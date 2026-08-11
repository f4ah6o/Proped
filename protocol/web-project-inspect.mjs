import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
    const priority = (name) => name === "next" || name === "nuxt" ? 3 : name.startsWith("react") || name.startsWith("vue") ? 2 : 1;
    return priority(b.name) - priority(a.name) || b.confidence - a.confidence;
  });
  const primary = ranked[0];
  const materiallyDifferent = ranked.filter((candidate) => candidate !== primary && !(
    (primary.name === "next" && candidate.name.startsWith("react")) ||
    (primary.name === "nuxt" && candidate.name.startsWith("vue"))
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

  if (framework.name === "next") {
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
  let routeModel = "unknown";
  if (hasDep("react-router-dom") || hasDep("react-router")) routeModel = "react-router";
  else if (hasDep("vue-router")) routeModel = "vue-router";
  else if (hasDep("next")) routeModel = "next-file-system";
  else if (hasDep("nuxt")) routeModel = "nuxt-file-system";
  if (dexie) evidence.push("state:dexie");
  if (websocket) evidence.push("runtime:websocket");
  if (authDependencies.length) evidence.push(`auth:${authDependencies.join(",")}`);
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

  const nodeRequirement = typeof pkg?.engines?.node === "string" ? pkg.engines.node : null;
  if (nodeRequirement) evidence.push(`node:${nodeRequirement}`);
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
