import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateNodeEngine } from "./web-node-engine.mjs";

export const WEB_PROJECT_INSPECT_VERSION = 1;

const LOCKFILES = Object.freeze([
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
]);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".html"]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".cache",
  ".turbo",
]);
const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
}

function gitValue(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : null;
}

function pathInsideOrEqual(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function ancestorDirectories(start, stop) {
  const result = [];
  let current = start;
  while (true) {
    result.push(current);
    if (current === stop) break;
    const parent = path.dirname(current);
    if (parent === current || !pathInsideOrEqual(stop, parent)) break;
    current = parent;
  }
  return result;
}

function packageManagerFromField(value) {
  if (typeof value !== "string") return null;
  const match = /^(npm|pnpm|yarn|bun)@/.exec(value.trim());
  return match?.[1] ?? null;
}

function normalizeNodeSelector(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  let match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  if (match) return { kind: "pin", requirement: `${match[1]}.${match[2]}.${match[3]}` };
  match = /^v?(\d+)\.(\d+)$/.exec(trimmed);
  if (match) {
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return { kind: "range", requirement: `>=${major}.${minor}.0 <${major}.${minor + 1}.0` };
  }
  match = /^v?(\d+)$/.exec(trimmed);
  if (match) {
    const major = Number(match[1]);
    return { kind: "range", requirement: `>=${major}.0.0 <${major + 1}.0.0` };
  }
  return null;
}

function readSmallText(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096) return null;
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

function intersectNodeRequirements(requirements) {
  const unique = [...new Set(requirements.filter(Boolean))];
  if (unique.length === 0) return null;
  let clauses = [""];
  for (const requirement of unique) {
    const parts = String(requirement).split("||").map((part) => part.trim()).filter(Boolean);
    clauses = clauses.flatMap((base) => parts.map((part) => `${base} ${part}`.trim()));
  }
  return [...new Set(clauses)].join(" || ");
}

function detectNodeRequirement(root, pkg, ambiguities, evidence) {
  const sources = [];
  let unsupportedSelector = false;
  const addRange = (source, value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const requirement = value.trim();
    sources.push({ source, kind: "range", requirement, raw: requirement });
    evidence.push(`node-requirement:${source}:${requirement}`);
  };
  const addSelector = (source, value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const raw = value.trim();
    const normalized = normalizeNodeSelector(raw);
    if (!normalized) {
      unsupportedSelector = true;
      ambiguities.push({
        code: "node-requirement-source-unsupported",
        message: `${source} contains a Node selector that cannot be safely normalized: ${raw}`,
        severity: "error",
      });
      evidence.push(`node-requirement:${source}:unparseable`);
      return;
    }
    sources.push({ source, kind: normalized.kind, requirement: normalized.requirement, raw });
    evidence.push(`node-requirement:${source}:${normalized.requirement}`);
  };

  addRange("package.json#engines.node", pkg?.engines?.node);
  addSelector("package.json#volta.node", pkg?.volta?.node);
  addSelector(".nvmrc", readSmallText(path.join(root, ".nvmrc")));
  addSelector(".node-version", readSmallText(path.join(root, ".node-version")));

  if (unsupportedSelector) return { requirement: null, sources, status: "ambiguous" };

  const pins = [...new Set(sources.filter((item) => item.kind === "pin").map((item) => item.requirement))];
  if (pins.length > 1) {
    ambiguities.push({
      code: "node-requirement-source-conflict",
      message: `conflicting Node version pins found: ${pins.join(", ")}`,
      severity: "error",
    });
    return { requirement: null, sources, status: "ambiguous" };
  }

  const pin = pins[0] ?? null;
  const ranges = [...new Set(sources.filter((item) => item.kind === "range").map((item) => item.requirement))];
  if (pin) {
    let unknown = false;
    for (const requirement of ranges) {
      const result = evaluateNodeEngine(requirement, pin);
      if (result.compatible === false) {
        ambiguities.push({
          code: "node-requirement-source-conflict",
          message: `Node version pin ${pin} does not satisfy ${requirement}`,
          severity: "error",
        });
        return { requirement: null, sources, status: "ambiguous" };
      }
      if (result.compatible === null) unknown = true;
    }
    if (unknown) {
      ambiguities.push({
        code: "node-requirement-consistency-unverified",
        message: `Node version pin ${pin} could not be proven compatible with every declared range`,
        severity: "error",
      });
      return { requirement: null, sources, status: "unverified" };
    }
    return { requirement: ranges[0] ?? pin, sources, status: "resolved" };
  }

  const requirement = intersectNodeRequirements(ranges);
  return requirement
    ? { requirement, sources, status: "resolved" }
    : { requirement: null, sources, status: "not-declared" };
}

function detectPackageManager(root, gitRoot, pkg, ambiguities, evidence) {
  const declared = packageManagerFromField(pkg?.packageManager);
  const searchRoot = gitRoot && pathInsideOrEqual(gitRoot, root) ? gitRoot : root;
  const found = [];
  for (const directory of ancestorDirectories(root, searchRoot)) {
    for (const [filename, manager] of LOCKFILES) {
      const file = path.join(directory, filename);
      if (fs.existsSync(file)) found.push({ manager, file, distance: path.relative(root, directory).split(path.sep).filter(Boolean).length });
    }
  }
  found.sort((a, b) => a.distance - b.distance || a.file.localeCompare(b.file));
  const nearestDistance = found[0]?.distance;
  const nearest = found.filter((item) => item.distance === nearestDistance);
  const nearestManagers = [...new Set(nearest.map((item) => item.manager))];

  if (nearestManagers.length > 1) {
    ambiguities.push({
      code: "multiple-package-manager-lockfiles",
      message: `multiple package-manager lockfiles found at the same scope: ${nearestManagers.join(", ")}`,
      severity: "warning",
    });
  }
  if (declared && nearestManagers.length > 0 && !nearestManagers.includes(declared)) {
    ambiguities.push({
      code: "package-manager-declaration-lockfile-mismatch",
      message: `packageManager declares ${declared} but nearest lockfile implies ${nearestManagers.join(", ")}`,
      severity: "warning",
    });
  }

  let name = declared ?? nearest[0]?.manager ?? null;
  let source = declared ? "packageManager" : nearest[0] ? "lockfile" : null;
  let confidence = declared ? 1 : nearest[0] ? 0.99 : 0;
  if (!name && pkg?.engines?.npm) {
    name = "npm";
    source = "engines.npm";
    confidence = 0.65;
  }
  if (!name && pkg) {
    name = "npm";
    source = "fallback";
    confidence = 0.35;
    ambiguities.push({
      code: "package-manager-inferred-by-fallback",
      message: "no packageManager field or lockfile found; npm is only a low-confidence fallback",
      severity: "info",
    });
  }
  if (name) evidence.push(`package-manager:${name}:${source}`);
  return {
    name,
    source,
    confidence,
    lockfile: nearest[0] ? path.relative(root, nearest[0].file) || path.basename(nearest[0].file) : null,
  };
}

function allDependencies(pkg) {
  return {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    ...(pkg?.peerDependencies ?? {}),
    ...(pkg?.optionalDependencies ?? {}),
  };
}

function hasDependency(dependencies, name) {
  return Object.prototype.hasOwnProperty.call(dependencies, name);
}

function detectFramework(root, pkg, evidence, ambiguities) {
  const dependencies = allDependencies(pkg);
  const has = (name) => hasDependency(dependencies, name);
  const candidates = [];
  if (has("@docusaurus/core")) candidates.push({ name: "docusaurus", confidence: 1, evidence: "dependency:@docusaurus/core" });
  if (has("waku")) candidates.push({ name: "waku", confidence: 1, evidence: "dependency:waku" });
  if (has("next")) candidates.push({ name: "next", confidence: 1, evidence: "dependency:next" });
  if (has("nuxt") || has("nuxi")) candidates.push({ name: "nuxt", confidence: 1, evidence: has("nuxt") ? "dependency:nuxt" : "dependency:nuxi" });
  if (has("react")) {
    const variant = has("vite") || fs.existsSync(path.join(root, "vite.config.js")) || fs.existsSync(path.join(root, "vite.config.mjs")) || fs.existsSync(path.join(root, "vite.config.ts"))
      ? "react-vite"
      : has("webpack") ? "react-webpack" : "react";
    candidates.push({ name: variant, confidence: variant === "react" ? 0.9 : 0.99, evidence: `dependencies:react${variant.includes("vite") ? "+vite" : variant.includes("webpack") ? "+webpack" : ""}` });
  }
  if (has("vue")) {
    const variant = has("vite") || fs.existsSync(path.join(root, "vite.config.js")) || fs.existsSync(path.join(root, "vite.config.mjs")) || fs.existsSync(path.join(root, "vite.config.ts"))
      ? "vue-vite"
      : "vue";
    candidates.push({ name: variant, confidence: variant === "vue" ? 0.9 : 0.99, evidence: `dependencies:vue${variant.includes("vite") ? "+vite" : ""}` });
  }
  if (candidates.length === 0 && pkg && has("vite")) candidates.push({ name: "vite", confidence: 0.85, evidence: "dependency:vite" });
  if (candidates.length === 0 && fs.existsSync(path.join(root, "index.html"))) candidates.push({ name: "static", confidence: 0.75, evidence: "root:index.html" });
  if (candidates.length === 0) candidates.push({ name: "unknown", confidence: 0, evidence: "no-known-framework-signal" });

  const ranked = candidates.sort((a, b) => {
    const priority = (name) => ["next", "nuxt", "docusaurus", "waku"].includes(name) ? 3 : name.startsWith("react") || name.startsWith("vue") ? 2 : 1;
    return priority(b.name) - priority(a.name) || b.confidence - a.confidence;
  });
  const primary = ranked[0];
  const materiallyDifferent = ranked.filter((candidate) => candidate !== primary && !(
    (primary.name === "next" && candidate.name.startsWith("react")) ||
    (primary.name === "nuxt" && candidate.name.startsWith("vue")) ||
    (primary.name === "docusaurus" && candidate.name.startsWith("react")) ||
    (primary.name === "waku" && candidate.name.startsWith("react"))
  ));
  if (materiallyDifferent.length > 0) {
    ambiguities.push({
      code: "multiple-framework-signals",
      message: `multiple framework signals detected: ${ranked.map((candidate) => candidate.name).join(", ")}`,
      severity: "info",
    });
  }
  evidence.push(`framework:${primary.evidence}`);
  return { name: primary.name, confidence: primary.confidence, candidates: ranked.map(({ name, confidence }) => ({ name, confidence })) };
}

function readTextIfSmall(file, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function configText(root, prefixes) {
  for (const prefix of prefixes) {
    for (const ext of [".js", ".mjs", ".cjs", ".ts"]) {
      const file = path.join(root, `${prefix}${ext}`);
      if (fs.existsSync(file)) return { file, text: readTextIfSmall(file) ?? "" };
    }
  }
  return null;
}

function inferModeAndOutput(root, framework, pkg, evidence, ambiguities) {
  const scripts = pkg?.scripts ?? {};
  let mode = "unknown";
  let modeConfidence = 0;
  let outputDir = null;
  let outputConfidence = 0;

  if (framework.name === "waku") {
    mode = "server-rendered";
    modeConfidence = 0.99;
    outputDir = null;
    outputConfidence = 0;
    evidence.push("waku:managed-server-runtime");
  } else if (framework.name === "docusaurus") {
    mode = "static-export";
    modeConfidence = 0.99;
    outputDir = "build";
    outputConfidence = 0.98;
    evidence.push("docusaurus:default-build-dir=build");
  } else if (framework.name === "next") {
    const config = configText(root, ["next.config"]);
    const staticExport = config && /output\s*:\s*["']export["']/.test(config.text);
    mode = staticExport ? "static-export" : "server-rendered";
    modeConfidence = staticExport ? 0.99 : 0.9;
    outputDir = staticExport ? "out" : ".next";
    outputConfidence = 0.95;
    evidence.push(staticExport ? "next:output=export" : "next:default-server-rendered");
  } else if (framework.name === "nuxt") {
    const config = configText(root, ["nuxt.config"]);
    const spa = config && /ssr\s*:\s*false/.test(config.text);
    mode = spa ? "spa" : "server-rendered";
    modeConfidence = spa ? 0.99 : 0.9;
    outputDir = ".output";
    outputConfidence = 0.95;
    evidence.push(spa ? "nuxt:ssr=false" : "nuxt:default-ssr");
  } else if (["react-vite", "vue-vite", "vite"].includes(framework.name)) {
    mode = "spa";
    modeConfidence = 0.92;
    outputDir = "dist";
    outputConfidence = 0.9;
    const config = configText(root, ["vite.config"]);
    const outDir = config?.text.match(/outDir\s*:\s*["']([^"']+)["']/)?.[1];
    if (outDir) {
      outputDir = outDir;
      outputConfidence = 0.98;
      evidence.push(`vite:outDir=${outDir}`);
    } else evidence.push("vite:default-outDir=dist");
  } else if (framework.name === "react-webpack") {
    mode = "spa";
    modeConfidence = 0.85;
    outputDir = "dist";
    outputConfidence = 0.7;
    evidence.push("webpack:spa-heuristic");
  } else if (framework.name === "static") {
    mode = "static";
    modeConfidence = 0.95;
    outputDir = ".";
    outputConfidence = 0.95;
  } else if ((framework.name === "react" || framework.name === "vue") && !scripts.build && !scripts.dev && !scripts.start) {
    mode = "component";
    modeConfidence = 0.7;
  }

  if (!scripts.build && !["static", "component"].includes(mode)) {
    ambiguities.push({
      code: "no-build-script",
      message: "no package.json build script was found",
      severity: "info",
    });
  }
  return { mode, modeConfidence, outputDir, outputConfidence };
}

function inferCommands(pkg, manager, framework, mode, ambiguities) {
  const scripts = pkg?.scripts ?? {};
  const run = (script) => manager ? [manager, "run", script] : null;
  let install = null;
  if (manager === "npm") install = ["npm", "ci"];
  else if (manager === "pnpm") install = ["pnpm", "install", "--frozen-lockfile"];
  else if (manager === "yarn") install = ["yarn", "install", "--immutable"];
  else if (manager === "bun") install = ["bun", "install", "--frozen-lockfile"];

  const build = scripts.build ? run("build") : null;
  let serve = null;
  let serveScript = null;
  const preference = mode === "server-rendered" ? ["start", "preview", "serve", "dev"] : ["preview", "serve", "start", "dev"];
  for (const script of preference) {
    if (scripts[script]) {
      serve = run(script);
      serveScript = script;
      break;
    }
  }
  if (!serve && pkg && mode !== "component") {
    ambiguities.push({
      code: "no-serve-script",
      message: "no start/preview/serve/dev script was found; server lifecycle needs review",
      severity: "info",
    });
  }
  return {
    install: { argv: install, confidence: install ? 0.95 : 0, source: install ? "package-manager" : null },
    build: { argv: build, confidence: build ? 1 : 0, source: build ? "scripts.build" : null },
    serve: { argv: serve, confidence: serve ? (serveScript === "dev" ? 0.75 : 0.95) : 0, source: serveScript ? `scripts.${serveScript}` : null },
  };
}

function collectSourceFiles(root) {
  const files = [];
  const stack = [root];
  let bytes = 0;
  while (stack.length > 0 && files.length < MAX_SOURCE_FILES && bytes < MAX_SOURCE_BYTES) {
    const directory = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_SOURCE_FILES || bytes >= MAX_SOURCE_BYTES) break;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) stack.push(file);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = fs.statSync(file);
        if (stat.size > 256 * 1024) continue;
        files.push(file);
        bytes += stat.size;
      } catch {
        // Ignore unreadable files during read-only inspection.
      }
    }
  }
  return { files, bytes, truncated: files.length >= MAX_SOURCE_FILES || bytes >= MAX_SOURCE_BYTES };
}

function detectRuntimeHints(root, pkg, evidence) {
  const dependencies = allDependencies(pkg);
  const scan = collectSourceFiles(root);
  const chunks = [];
  for (const file of scan.files) {
    const text = readTextIfSmall(file);
    if (text) chunks.push(text);
  }
  const source = chunks.join("\n");
  const hasDep = (name) => hasDependency(dependencies, name);
  const stateSources = ["dom", "forms", "url"];
  const add = (value) => { if (!stateSources.includes(value)) stateSources.push(value); };
  if (/\blocalStorage\b/.test(source)) add("localStorage");
  if (/\bsessionStorage\b/.test(source)) add("sessionStorage");
  if (/\bindexedDB\b/.test(source) || hasDep("dexie") || hasDep("idb")) add("indexedDB");
  const dexie = hasDep("dexie") || /\bnew\s+Dexie\s*\(/.test(source);
  const dexieDeclaredVersion = typeof dependencies.dexie === "string" ? dependencies.dexie : null;
  let dexieResolvedVersion = null;
  if (dexie) {
    const dexiePackage = path.join(root, "node_modules", "dexie", "package.json");
    try {
      const installed = JSON.parse(fs.readFileSync(dexiePackage, "utf8"));
      if (typeof installed.version === "string") dexieResolvedVersion = installed.version;
    } catch {
      // node_modules is optional during read-only inspection.
    }
  }
  const websocket = /\bnew\s+WebSocket\s*\(/.test(source) || ["socket.io-client", "sockjs-client", "ws"].some(hasDep);
  const serviceWorker = /\bserviceWorker\b/.test(source) || hasDep("workbox-window") || hasDep("vite-plugin-pwa");
  const authDependencies = [
    "next-auth", "@auth/core", "@clerk/nextjs", "@clerk/react", "lucia", "@supabase/supabase-js", "firebase",
  ].filter(hasDep);
  const serverFrameworks = ["hono", "express", "fastify", "koa", "@hapi/hapi"].filter(hasDep);
  const serverPersistenceDependencies = ["drizzle-orm", "prisma", "@prisma/client", "better-sqlite3", "sqlite3", "pg", "mysql2", "mongodb", "redis", "ioredis"].filter(hasDep);
  const relativeApiCalls = (source.match(/\bfetch\s*\(\s*["'`]\/(?:api|rpc|trpc)(?:[\/"'`?]|$)/g) ?? []).length;
  const serverRouteSyntaxDetected = /\bnew\s+Hono\s*\(|\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(/.test(source);
  const serverDetected = serverFrameworks.length > 0 || serverPersistenceDependencies.length > 0 || serverRouteSyntaxDetected;
  let routeModel = "unknown";
  if (hasDep("react-router-dom") || hasDep("react-router")) routeModel = "react-router";
  else if (hasDep("vue-router")) routeModel = "vue-router";
  else if (hasDep("next")) routeModel = "next-file-system";
  else if (hasDep("nuxt")) routeModel = "nuxt-file-system";
  else if (hasDep("@docusaurus/core")) routeModel = "docusaurus-client-router";
  else if (hasDep("waku")) routeModel = "waku-router";
  if (dexie) evidence.push("state:dexie");
  if (websocket) evidence.push("runtime:websocket");
  if (authDependencies.length) evidence.push(`auth:${authDependencies.join(",")}`);
  if (serverFrameworks.length) evidence.push(`server-framework:${serverFrameworks.join(",")}`);
  if (serverPersistenceDependencies.length) evidence.push(`server-persistence:${serverPersistenceDependencies.join(",")}`);
  if (relativeApiCalls > 0) evidence.push(`runtime:relative-api-calls:${relativeApiCalls}`);
  if (scan.truncated) evidence.push(`source-scan:bounded:${scan.files.length}-files:${scan.bytes}-bytes`);
  else evidence.push(`source-scan:${scan.files.length}-files:${scan.bytes}-bytes`);
  return {
    stateSources,
    indexedDB: {
      detected: stateSources.includes("indexedDB"),
      dexie,
      dexieDeclaredVersion,
      dexieResolvedVersion,
      confidence: dexie ? 0.99 : stateSources.includes("indexedDB") ? 0.9 : 0,
    },
    routing: { model: routeModel, confidence: routeModel === "unknown" ? 0 : 0.95 },
    websocket: { detected: websocket, confidence: websocket ? 0.9 : 0 },
    serviceWorker: { detected: serviceWorker, confidence: serviceWorker ? 0.85 : 0 },
    auth: { detected: authDependencies.length > 0, dependencies: authDependencies, confidence: authDependencies.length ? 0.95 : 0 },
    server: {
      detected: serverDetected,
      frameworks: serverFrameworks,
      persistenceDependencies: serverPersistenceDependencies,
      relativeApiCalls,
      routeSyntaxDetected: serverRouteSyntaxDetected,
      confidence: serverFrameworks.length ? 0.95 : serverPersistenceDependencies.length ? 0.85 : serverRouteSyntaxDetected ? 0.7 : 0,
    },
    sourceScan: { files: scan.files.length, bytes: scan.bytes, truncated: scan.truncated },
  };
}

export function inspectWebProject(targetPath, options = {}) {
  const input = targetPath || ".";
  const root = fs.realpathSync(path.resolve(options.cwd ?? process.cwd(), input));
  if (!fs.statSync(root).isDirectory()) throw new Error(`target is not a directory: ${root}`);
  const packageFile = path.join(root, "package.json");
  const pkg = fs.existsSync(packageFile) ? readJson(packageFile) : null;
  const gitRootRaw = gitValue(root, ["rev-parse", "--show-toplevel"]);
  const gitRoot = gitRootRaw ? fs.realpathSync(gitRootRaw) : null;
  const revision = gitValue(root, ["rev-parse", "HEAD"]);
  const ambiguities = [];
  const evidence = [];

  const packageManager = detectPackageManager(root, gitRoot, pkg, ambiguities, evidence);
  const framework = detectFramework(root, pkg, evidence, ambiguities);
  const project = inferModeAndOutput(root, framework, pkg, evidence, ambiguities);
  const commands = inferCommands(pkg, packageManager.name, framework, project.mode, ambiguities);
  const runtime = detectRuntimeHints(root, pkg, evidence);

  const nodeRequirementResolution = detectNodeRequirement(root, pkg, ambiguities, evidence);
  const nodeRequirement = nodeRequirementResolution.requirement;
  const confidence = {
    packageManager: packageManager.confidence,
    framework: framework.confidence,
    build: commands.build.confidence,
    serveMode: project.modeConfidence,
    outputDir: project.outputConfidence,
    runtimeHints: runtime.sourceScan.files > 0 ? 0.8 : 0.3,
  };

  return {
    ok: true,
    schemaVersion: WEB_PROJECT_INSPECT_VERSION,
    command: "web inspect",
    target: {
      input,
      root,
      gitRoot,
      revision,
      packageName: pkg?.name ?? null,
    },
    packageManager,
    nodeRequirement,
    nodeRequirementResolution,
    framework,
    project: {
      mode: project.mode,
      outputDir: project.outputDir,
    },
    commands,
    runtime,
    confidence,
    ambiguities,
    evidence: [...new Set(evidence)].sort(),
    safety: {
      readOnly: true,
      packageScriptsExecuted: false,
      networkUsed: false,
    },
  };
}
