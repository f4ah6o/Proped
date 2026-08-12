import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWebProjectManifest } from "./web-project-runner.mjs";
import { validateWebServerHooks } from "./web-server-hooks.mjs";
import { applyApprovedServerHooks, validateApprovedSemanticHints } from "./web-approved-semantics-runtime.mjs";

export const WEB_PROJECT_MANIFEST_V2 = 2;
const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERIC_BROWSER_STAGE = path.join(TOOL_ROOT, "scripts/web_generic_browser_stage.mjs");
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TOP_KEYS = new Set([
  "schemaVersion", "id", "project", "bootstrap", "server", "browser", "discovery",
  "state", "environment", "normalization", "properties", "semantics", "exploration", "replay", "sandbox", "artifacts", "inference",
]);

function fail(message) {
  throw new Error(`Web project manifest v2: ${message}`);
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} has unknown field ${key}`);
}

function string(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string${nullable ? " or null" : ""}`);
}

function bool(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
}

function positiveInt(value, label, { zero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1)) fail(`${label} must be a ${zero ? "non-negative" : "positive"} safe integer`);
}

function command(value, label) {
  if (value === null) return;
  if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== "string" || part.length === 0)) {
    fail(`${label} must be null or a non-empty argv array`);
  }
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must be a string array`);
  if (new Set(value).size !== value.length) fail(`${label} must not contain duplicates`);
}

function safeId(value) {
  let id = String(value ?? "web-project")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!id) id = "web-project";
  if (!/^[a-z0-9]/.test(id)) id = `web-${id}`;
  return id;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateWebProjectManifestV2(manifest) {
  exactKeys(manifest, TOP_KEYS, "manifest");
  if (manifest.schemaVersion !== 2) fail("schemaVersion must be 2");
  string(manifest.id, "id");
  if (!ID_PATTERN.test(manifest.id)) fail("id must match ^[a-z0-9][a-z0-9-]*$");

  exactKeys(manifest.project, new Set(["root", "framework", "packageManager", "packageManagerReference", "nodeRequirement", "nodePreferredVersion"]), "project");
  string(manifest.project.root, "project.root");
  string(manifest.project.framework, "project.framework");
  string(manifest.project.packageManager, "project.packageManager", { nullable: true });
  if (manifest.project.packageManagerReference !== undefined) string(manifest.project.packageManagerReference, "project.packageManagerReference", { nullable: true });
  if (manifest.project.nodeRequirement !== undefined) string(manifest.project.nodeRequirement, "project.nodeRequirement", { nullable: true });
  if (manifest.project.nodePreferredVersion !== undefined) string(manifest.project.nodePreferredVersion, "project.nodePreferredVersion", { nullable: true });

  exactKeys(manifest.bootstrap, new Set(["install", "build"]), "bootstrap");
  command(manifest.bootstrap.install, "bootstrap.install");
  command(manifest.bootstrap.build, "bootstrap.build");

  exactKeys(manifest.server, new Set(["mode", "outputDir", "start", "url", "readiness", "hooks", "mutationPolicy"]), "server");
  if (!["static-output", "command", "external", "review-required"].includes(manifest.server.mode)) fail("server.mode is invalid");
  string(manifest.server.outputDir, "server.outputDir", { nullable: true });
  command(manifest.server.start, "server.start");
  string(manifest.server.url, "server.url", { nullable: true });
  exactKeys(manifest.server.readiness, new Set(["strategy", "timeoutMs"]), "server.readiness");
  if (manifest.server.readiness.strategy !== "semantic-quiescence") fail("server.readiness.strategy must be semantic-quiescence");
  positiveInt(manifest.server.readiness.timeoutMs, "server.readiness.timeoutMs");
  validateWebServerHooks(manifest.server.hooks);
  if (manifest.server.mutationPolicy !== undefined && !["deny", "bounded-managed"].includes(manifest.server.mutationPolicy)) fail("server.mutationPolicy is invalid");
  if (manifest.server.mutationPolicy === "bounded-managed" && manifest.server.mode !== "command") fail("bounded-managed mutation policy requires command server mode");
  if (manifest.server.mode === "static-output" && !manifest.server.outputDir) fail("static-output server requires outputDir");
  if (manifest.server.mode === "command" && !manifest.server.start) fail("command server requires start argv");
  if (manifest.server.mode === "external" && !manifest.server.url) fail("external server requires url");

  exactKeys(manifest.browser, new Set(["engine", "headless", "viewport", "locale", "timezone", "serviceWorkers"]), "browser");
  if (manifest.browser.engine !== "chromium") fail("browser.engine must be chromium");
  bool(manifest.browser.headless, "browser.headless");
  if (!Array.isArray(manifest.browser.viewport) || manifest.browser.viewport.length !== 2) fail("browser.viewport must contain [width,height]");
  positiveInt(manifest.browser.viewport[0], "browser.viewport[0]");
  positiveInt(manifest.browser.viewport[1], "browser.viewport[1]");
  string(manifest.browser.locale, "browser.locale");
  string(manifest.browser.timezone, "browser.timezone");
  if (manifest.browser.serviceWorkers !== "block") fail("browser.serviceWorkers must be block");

  exactKeys(manifest.discovery, new Set(["actions", "selectorPolicy", "ambiguity"]), "discovery");
  if (manifest.discovery.actions !== "accessibility") fail("discovery.actions must be accessibility");
  if (manifest.discovery.selectorPolicy !== "role-first") fail("discovery.selectorPolicy must be role-first");
  if (manifest.discovery.ambiguity !== "fail-closed") fail("discovery.ambiguity must be fail-closed");

  exactKeys(manifest.state, new Set(["sources", "indexedDB"]), "state");
  uniqueStrings(manifest.state.sources, "state.sources");
  exactKeys(manifest.state.indexedDB, new Set(["mode", "adapter"]), "state.indexedDB");
  if (!["off", "auto-metadata"].includes(manifest.state.indexedDB.mode)) fail("state.indexedDB.mode is invalid");
  if (manifest.state.indexedDB.adapter !== null) {
    exactKeys(manifest.state.indexedDB.adapter, new Set(["kind", "declaredVersion", "resolvedVersion"]), "state.indexedDB.adapter");
    if (manifest.state.indexedDB.adapter.kind !== "dexie") fail("state.indexedDB.adapter.kind must be dexie");
    string(manifest.state.indexedDB.adapter.declaredVersion, "state.indexedDB.adapter.declaredVersion", { nullable: true });
    string(manifest.state.indexedDB.adapter.resolvedVersion, "state.indexedDB.adapter.resolvedVersion", { nullable: true });
  }

  if (manifest.environment !== undefined) {
    exactKeys(manifest.environment, new Set(["variables", "templateFiles", "valueCapture", "automaticForwarding"]), "environment");
    if (!Array.isArray(manifest.environment.variables)) fail("environment.variables must be an array");
    for (const [index, variable] of manifest.environment.variables.entries()) {
      exactKeys(variable, new Set(["name", "exposure", "evidence", "confidence", "required"]), `environment.variables[${index}]`);
      string(variable.name, `environment.variables[${index}].name`);
      if (!["public", "sensitive-candidate", "server-config"].includes(variable.exposure)) fail(`environment.variables[${index}].exposure is invalid`);
      uniqueStrings(variable.evidence, `environment.variables[${index}].evidence`);
      if (typeof variable.confidence !== "number" || variable.confidence < 0 || variable.confidence > 1) fail(`environment.variables[${index}].confidence must be 0..1`);
      if (variable.required !== "unknown") fail(`environment.variables[${index}].required must be unknown`);
    }
    uniqueStrings(manifest.environment.templateFiles, "environment.templateFiles");
    bool(manifest.environment.valueCapture, "environment.valueCapture");
    bool(manifest.environment.automaticForwarding, "environment.automaticForwarding");
    if (manifest.environment.valueCapture !== false || manifest.environment.automaticForwarding !== false) fail("environment discovery must not capture values or forward variables automatically");
  }

  exactKeys(manifest.normalization, new Set(["builtin", "volatilityProbeRuns"]), "normalization");
  bool(manifest.normalization.builtin, "normalization.builtin");
  positiveInt(manifest.normalization.volatilityProbeRuns, "normalization.volatilityProbeRuns", { zero: true });

  exactKeys(manifest.properties, new Set(["packs"]), "properties");
  uniqueStrings(manifest.properties.packs, "properties.packs");

  if (manifest.semantics !== undefined) {
    exactKeys(manifest.semantics, new Set(["approved"]), "semantics");
    validateApprovedSemanticHints(manifest.semantics.approved);
  }

  exactKeys(manifest.exploration, new Set(["mode", "maxStates", "maxTransitions", "maxDepth", "seed"]), "exploration");
  if (manifest.exploration.mode !== undefined && !["off", "coverage-guided"].includes(manifest.exploration.mode)) fail("exploration.mode is invalid");
  positiveInt(manifest.exploration.maxStates, "exploration.maxStates");
  if (manifest.exploration.maxTransitions !== undefined) positiveInt(manifest.exploration.maxTransitions, "exploration.maxTransitions");
  positiveInt(manifest.exploration.maxDepth, "exploration.maxDepth");
  positiveInt(manifest.exploration.seed, "exploration.seed", { zero: true });

  exactKeys(manifest.replay, new Set(["attempts", "freshContext"]), "replay");
  positiveInt(manifest.replay.attempts, "replay.attempts");
  if (manifest.replay.freshContext !== true) fail("replay.freshContext must be true");

  exactKeys(manifest.sandbox, new Set(["mode", "executionNetwork", "credentials"]), "sandbox");
  if (!["strict", "caller-enforced"].includes(manifest.sandbox.mode)) fail("sandbox.mode is invalid");
  if (manifest.sandbox.executionNetwork !== "deny") fail("sandbox.executionNetwork must be deny");
  if (manifest.sandbox.credentials !== "deny") fail("sandbox.credentials must be deny");

  exactKeys(manifest.artifacts, new Set(["output", "traceOnFailure"]), "artifacts");
  string(manifest.artifacts.output, "artifacts.output");
  bool(manifest.artifacts.traceOnFailure, "artifacts.traceOnFailure");

  if (manifest.inference !== undefined) {
    exactKeys(manifest.inference, new Set(["generated", "confidence", "ambiguities"]), "inference");
    bool(manifest.inference.generated, "inference.generated");
    if (!manifest.inference.confidence || typeof manifest.inference.confidence !== "object" || Array.isArray(manifest.inference.confidence)) fail("inference.confidence must be an object");
    if (!Array.isArray(manifest.inference.ambiguities)) fail("inference.ambiguities must be an array");
  }
  return manifest;
}

export function loadWebProjectManifestV2(file) {
  return validateWebProjectManifestV2(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function criticalWebProjectInferenceAmbiguities(manifest) {
  validateWebProjectManifestV2(manifest);
  return (manifest.inference?.ambiguities ?? []).filter((item) => item?.severity === "error");
}

export function createWebProjectManifestV2FromInspection(inspection, { projectRoot = ".", id = null } = {}) {
  if (!inspection?.ok) fail("inspection result must be successful");
  const persistent = inspection.runtime.stateSources.some((source) => ["localStorage", "sessionStorage", "indexedDB"].includes(source));
  const packs = ["browser-safety"];
  if (inspection.runtime.routing.model !== "unknown") packs.push("navigation");
  if (persistent) packs.push("reload-persistence");

  let serverMode = "review-required";
  let outputDir = null;
  let start = null;
  if (["spa", "static", "static-export"].includes(inspection.project.mode) && inspection.project.outputDir) {
    serverMode = "static-output";
    outputDir = inspection.project.outputDir;
  } else if (inspection.commands.serve.argv) {
    serverMode = "command";
    start = clone(inspection.commands.serve.argv);
  }

  const manifest = {
    schemaVersion: 2,
    id: safeId(id ?? inspection.target.packageName ?? path.basename(inspection.target.root)),
    project: {
      root: projectRoot,
      framework: inspection.framework.name,
      packageManager: inspection.packageManager.name,
      packageManagerReference: inspection.packageManager.reference ?? null,
      nodeRequirement: inspection.nodeRequirement ?? null,
      nodePreferredVersion: inspection.nodePreferredVersion ?? null,
    },
    bootstrap: {
      install: inspection.commands.install.argv ? clone(inspection.commands.install.argv) : null,
      build: inspection.commands.build.argv ? clone(inspection.commands.build.argv) : null,
    },
    server: {
      mode: serverMode,
      outputDir,
      start,
      url: null,
      readiness: { strategy: "semantic-quiescence", timeoutMs: 30_000 },
      hooks: { reset: null, readOnly: [] },
      mutationPolicy: "deny",
    },
    browser: {
      engine: "chromium",
      headless: true,
      viewport: [1280, 900],
      locale: "en-US",
      timezone: "UTC",
      serviceWorkers: "block",
    },
    discovery: {
      actions: "accessibility",
      selectorPolicy: "role-first",
      ambiguity: "fail-closed",
    },
    state: {
      sources: clone(inspection.runtime.stateSources),
      indexedDB: {
        mode: inspection.runtime.indexedDB.detected ? "auto-metadata" : "off",
        adapter: inspection.runtime.indexedDB.dexie ? {
          kind: "dexie",
          declaredVersion: inspection.runtime.indexedDB.dexieDeclaredVersion ?? null,
          resolvedVersion: inspection.runtime.indexedDB.dexieResolvedVersion ?? null,
        } : null,
      },
    },
    environment: {
      variables: clone(inspection.runtime.environment?.variables ?? []),
      templateFiles: clone(inspection.runtime.environment?.templateFiles ?? []),
      valueCapture: false,
      automaticForwarding: false,
    },
    normalization: { builtin: true, volatilityProbeRuns: 3 },
    properties: { packs },
    semantics: { approved: null },
    exploration: { mode: "coverage-guided", maxStates: 32, maxTransitions: 64, maxDepth: 4, seed: 1 },
    replay: { attempts: 3, freshContext: true },
    sandbox: { mode: "strict", executionNetwork: "deny", credentials: "deny" },
    artifacts: { output: ".proped/out", traceOnFailure: true },
    inference: {
      generated: true,
      confidence: clone(inspection.confidence),
      ambiguities: clone(inspection.ambiguities),
    },
  };
  return validateWebProjectManifestV2(manifest);
}

export function compileWebProjectManifestV2(manifest, repositoryRoot) {
  validateWebProjectManifestV2(manifest);
  const criticalAmbiguities = criticalWebProjectInferenceAmbiguities(manifest);
  if (criticalAmbiguities.length > 0) {
    fail(`critical inference ambiguity requires review: ${criticalAmbiguities.map((item) => item.code ?? "unknown").join(", ")}`);
  }
  const stages = [];
  if (manifest.bootstrap.build) {
    stages.push({
      id: "project-build",
      kind: "check",
      cwd: ".",
      command: clone(manifest.bootstrap.build),
      timeoutMs: 300_000,
      dependsOn: [],
      required: true,
    });
  }

  if (manifest.server.mode === "review-required") fail("server.mode review-required must be resolved before compilation");
  const browserCommand = [
    process.execPath,
    GENERIC_BROWSER_STAGE,
    "--project-root", ".",
    "--server-mode", manifest.server.mode,
    "--headless", String(manifest.browser.headless),
    "--viewport", manifest.browser.viewport.join("x"),
    "--locale", manifest.browser.locale,
    "--timezone", manifest.browser.timezone,
    "--readiness-timeout", String(manifest.server.readiness.timeoutMs),
    "--allow-managed-mutations", String(manifest.server.mutationPolicy === "bounded-managed"),
    "--server-hooks-json", JSON.stringify(manifest.server.hooks),
    "--property-packs-json", JSON.stringify(manifest.properties.packs),
    "--semantic-hints-json", JSON.stringify(manifest.semantics?.approved ?? null),
    "--exploration-json", JSON.stringify({
      mode: manifest.exploration.mode ?? "off",
      maxStates: manifest.exploration.maxStates,
      maxTransitions: manifest.exploration.maxTransitions ?? Math.min(manifest.exploration.maxStates * 2, 500),
      maxDepth: manifest.exploration.maxDepth,
      seed: manifest.exploration.seed,
    }),
    "--indexeddb-mode", manifest.state.indexedDB.mode,
    "--indexeddb-adapter-json", JSON.stringify(manifest.state.indexedDB.adapter),
    "--volatility-probe-runs", String(manifest.normalization.volatilityProbeRuns),
    "--replay-attempts", String(manifest.replay.attempts),
  ];
  if (manifest.server.outputDir) browserCommand.push("--output-dir", manifest.server.outputDir);
  if (manifest.server.start) browserCommand.push("--start-json", JSON.stringify(manifest.server.start));
  if (manifest.server.url) browserCommand.push("--url", manifest.server.url);

  stages.push({
    id: "generic-browser",
    kind: "browser",
    cwd: ".",
    command: browserCommand,
    timeoutMs: Math.max(60_000, manifest.server.readiness.timeoutMs + 30_000),
    dependsOn: stages.length ? [stages.at(-1).id] : [],
    required: true,
  });

  const v1 = {
    schemaVersion: 1,
    id: manifest.id,
    projectRoot: manifest.project.root,
    safety: {
      network: "caller-enforced-deny",
      filesystemWrites: "caller-enforced-artifacts-and-build-output",
      upstreamWrites: "caller-enforced-deny",
      credentials: "caller-enforced-deny",
    },
    stages,
    artifacts: { output: manifest.artifacts.output },
  };
  validateWebProjectManifest(v1, repositoryRoot);
  const writablePaths = [];
  if (manifest.server.mode === "static-output" && manifest.server.outputDir) {
    writablePaths.push(path.join(manifest.project.root, manifest.server.outputDir));
  }
  return {
    manifest: v1,
    execution: {
      sandboxMode: manifest.sandbox.mode,
      strictSandbox: manifest.sandbox.mode === "strict",
      writablePaths,
      bootstrapInstall: manifest.bootstrap.install ? clone(manifest.bootstrap.install) : null,
    },
  };
}

export function withApprovedWebSemantics(manifest, approved) {
  validateWebProjectManifestV2(manifest);
  validateApprovedSemanticHints(approved);
  const next = clone(manifest);
  next.semantics = { approved: clone(approved) };
  next.server.hooks = applyApprovedServerHooks(next.server.hooks, approved);
  return validateWebProjectManifestV2(next);
}
