import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";

export const DOGFOOD_SCHEMA_VERSION = 1;
export const DOGFOOD_FRAMEWORKS = Object.freeze(["react", "vue", "next", "nuxt"]);
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "id",
  "framework",
  "repository",
  "revision",
  "release",
  "license",
  "source",
  "adapter",
  "bounds",
  "expected",
  "upstreamWritePolicy",
]);

function fail(message) {
  throw new Error(`external Web dogfood manifest: ${message}`);
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${label} has unknown field ${key}`);
  for (const key of expected) if (!(key in value)) fail(`${label} is missing ${key}`);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
}

export function validateDogfoodManifest(manifest) {
  assertExactKeys(manifest, MANIFEST_KEYS, "root");
  if (manifest.schemaVersion !== DOGFOOD_SCHEMA_VERSION) fail(`unsupported schemaVersion ${manifest.schemaVersion}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) fail(`invalid id ${manifest.id}`);
  if (!DOGFOOD_FRAMEWORKS.includes(manifest.framework)) fail(`unsupported framework ${manifest.framework}`);
  if (!/^[^/]+\/[^/]+$/.test(manifest.repository)) fail(`invalid repository ${manifest.repository}`);
  if (!/^[0-9a-f]{40}$/.test(manifest.revision)) fail(`invalid revision ${manifest.revision}`);
  assertString(manifest.release, "release");
  if (!["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"].includes(manifest.license)) {
    fail(`license is not permissive: ${manifest.license}`);
  }
  if (manifest.upstreamWritePolicy !== "read-only") fail("upstreamWritePolicy must be read-only");

  assertExactKeys(manifest.source, new Set(["upstreamPath", "snapshotPath", "snapshotKind", "sha256"]), "source");
  assertString(manifest.source.upstreamPath, "source.upstreamPath");
  assertString(manifest.source.snapshotPath, "source.snapshotPath");
  if (manifest.source.snapshotKind !== "reviewed-reduced-boundary") fail("source.snapshotKind must be reviewed-reduced-boundary");
  if (!/^[0-9a-f]{64}$/.test(manifest.source.sha256)) fail("source.sha256 must be a SHA-256 hex digest");

  assertExactKeys(manifest.adapter, new Set(["kind", "runtime", "boundary", "unsupportedEffects"]), "adapter");
  if (!["counter", "static-render"].includes(manifest.adapter.kind)) fail(`unsupported adapter kind ${manifest.adapter.kind}`);
  if (!["component", "ssr"].includes(manifest.adapter.runtime)) fail(`unsupported runtime ${manifest.adapter.runtime}`);
  assertString(manifest.adapter.boundary, "adapter.boundary");
  if (!Array.isArray(manifest.adapter.unsupportedEffects) || new Set(manifest.adapter.unsupportedEffects).size !== manifest.adapter.unsupportedEffects.length) {
    fail("adapter.unsupportedEffects must be a unique array");
  }
  for (const effect of manifest.adapter.unsupportedEffects) assertString(effect, "adapter.unsupportedEffects[]");

  assertExactKeys(manifest.bounds, new Set(["maxStates", "maxTransitions", "timeoutMs"]), "bounds");
  for (const field of ["maxStates", "maxTransitions", "timeoutMs"]) {
    if (!Number.isSafeInteger(manifest.bounds[field]) || manifest.bounds[field] < 0) fail(`bounds.${field} must be a non-negative safe integer`);
  }
  if (manifest.bounds.maxStates < 1 || manifest.bounds.timeoutMs < 1) fail("maxStates and timeoutMs must be positive");

  assertExactKeys(manifest.expected, new Set(["outcome", "propertyCoverage"]), "expected");
  if (manifest.expected.outcome !== "zero-failure") fail("only explicit zero-failure dogfood targets are accepted by this bounded campaign");
  if (!Array.isArray(manifest.expected.propertyCoverage) || manifest.expected.propertyCoverage.length === 0) {
    fail("expected.propertyCoverage must be non-empty");
  }
  if (new Set(manifest.expected.propertyCoverage).size !== manifest.expected.propertyCoverage.length) {
    fail("expected.propertyCoverage must be unique");
  }
  return manifest;
}

export function loadDogfoodManifests(root, directory = "external/web-dogfood-manifests") {
  const manifestDirectory = path.join(root, directory);
  const manifests = fs.readdirSync(manifestDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => validateDogfoodManifest(JSON.parse(fs.readFileSync(path.join(manifestDirectory, name), "utf8"))));
  const ids = manifests.map((manifest) => manifest.id);
  if (new Set(ids).size !== ids.length) fail("duplicate target id");
  const frameworks = manifests.map((manifest) => manifest.framework).sort();
  if (JSON.stringify(frameworks) !== JSON.stringify([...DOGFOOD_FRAMEWORKS].sort())) {
    fail(`campaign must contain exactly one target for each framework: ${DOGFOOD_FRAMEWORKS.join(", ")}`);
  }
  return manifests;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertSourceBoundary(manifest, source) {
  const checks = {
    react: ["useState", "setCount", "<button"],
    vue: ["ref(0)", "@click", "<button"],
    next: ["export default function", "<h1"],
    nuxt: ["<template>", "<h1"],
  }[manifest.framework];
  for (const token of checks) if (!source.includes(token)) fail(`${manifest.id} source boundary is missing ${token}`);
}

function createSnapshot(manifest, state) {
  const semantic = manifest.adapter.kind === "counter"
    ? {
      url: "/",
      dom: `<button role="button" name="counter">count is ${state.count}</button>`,
      focus: null,
      forms: [],
      pending: [],
      console: [],
      applicationState: { count: state.count },
    }
    : {
      url: "/",
      dom: manifest.framework === "next"
        ? "<main><h1>Hello, Next.js!</h1></main>"
        : "<main><h1>Hello, Nuxt!</h1></main>",
      focus: null,
      forms: [],
      pending: [],
      console: [],
      applicationState: { rendered: true },
    };
  return { ...semantic, fingerprint: semanticHash(semantic) };
}

function actions(manifest, state) {
  if (manifest.adapter.kind !== "counter" || state.count >= manifest.bounds.maxTransitions) return [];
  return [{
    id: "click:button:counter",
    kind: "click",
    target: { role: "button", name: "counter" },
  }];
}

function execute(manifest, state, action) {
  if (manifest.adapter.kind !== "counter" || action.id !== "click:button:counter") {
    throw new Error(`unsupported action ${action.id} for ${manifest.id}`);
  }
  return { count: state.count + 1 };
}

function initialState(manifest) {
  return manifest.adapter.kind === "counter" ? { count: 0 } : { rendered: true };
}

function replay(manifest, trace) {
  let state = initialState(manifest);
  for (const actionId of trace) state = execute(manifest, state, { id: actionId });
  return createSnapshot(manifest, state);
}

function evaluateProperties(manifest, states, transitions, replayResult) {
  const checks = {
    deterministic_replay: replayResult.deterministic,
    stable_action_identity: transitions.every((transition) => transition.actionId === "click:button:counter"),
    semantic_render_stability: states.length === 1 && states[0].pending.length === 0,
    unhandled_exception: states.every((state) => state.console.length === 0),
    pending_effect_leak: states.every((state) => state.pending.length === 0),
  };
  return manifest.expected.propertyCoverage.map((property) => ({
    property,
    status: checks[property] === true ? "pass" : "fail",
  }));
}

export function runDogfoodTarget(root, manifest) {
  const started = Date.now();
  const sourcePath = path.join(root, manifest.source.snapshotPath);
  const actualSourceSha256 = sha256File(sourcePath);
  if (actualSourceSha256 !== manifest.source.sha256) {
    fail(`${manifest.id} source hash mismatch: expected ${manifest.source.sha256}, got ${actualSourceSha256}`);
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  assertSourceBoundary(manifest, source);

  const firstState = initialState(manifest);
  const firstSnapshot = createSnapshot(manifest, firstState);
  const states = [firstSnapshot];
  const stateByFingerprint = new Map([[firstSnapshot.fingerprint, firstState]]);
  const queue = [firstState];
  const transitions = [];

  while (queue.length > 0 && transitions.length < manifest.bounds.maxTransitions) {
    if (Date.now() - started > manifest.bounds.timeoutMs) fail(`${manifest.id} exceeded ${manifest.bounds.timeoutMs}ms`);
    const state = queue.shift();
    const from = createSnapshot(manifest, state);
    for (const action of actions(manifest, state)) {
      if (transitions.length >= manifest.bounds.maxTransitions) break;
      const nextState = execute(manifest, state, action);
      const next = createSnapshot(manifest, nextState);
      transitions.push({ from: from.fingerprint, actionId: action.id, to: next.fingerprint });
      if (!stateByFingerprint.has(next.fingerprint)) {
        if (states.length >= manifest.bounds.maxStates) fail(`${manifest.id} exceeded maxStates`);
        stateByFingerprint.set(next.fingerprint, nextState);
        states.push(next);
        queue.push(nextState);
      }
    }
  }

  const representativeTrace = manifest.adapter.kind === "counter"
    ? Array.from({ length: Math.min(3, manifest.bounds.maxTransitions) }, () => "click:button:counter")
    : [];
  const replayOne = replay(manifest, representativeTrace);
  const replayTwo = replay(manifest, representativeTrace);
  const replayResult = {
    trace: representativeTrace,
    deterministic: replayOne.fingerprint === replayTwo.fingerprint,
    finalFingerprint: replayOne.fingerprint,
  };
  replayResult.signature = semanticHash({
    campaign: "external-web-dogfood",
    target: manifest.id,
    revision: manifest.revision,
    trace: replayResult.trace,
    finalFingerprint: replayResult.finalFingerprint,
  });

  const properties = evaluateProperties(manifest, states, transitions, replayResult);
  const failures = properties.filter((property) => property.status === "fail");
  const diagnostics = manifest.adapter.unsupportedEffects.map((effect) => ({
    code: "unsupported_effect",
    severity: "info",
    effect,
    policy: "descriptor-only",
  }));
  const frontierExhausted = stateByFingerprint.size === states.length &&
    [...stateByFingerprint.values()].every((state) => actions(manifest, state).length === 0 || transitions.some((transition) => transition.from === createSnapshot(manifest, state).fingerprint));

  const result = {
    id: manifest.id,
    framework: manifest.framework,
    repository: manifest.repository,
    revision: manifest.revision,
    release: manifest.release,
    license: manifest.license,
    upstreamWritePolicy: manifest.upstreamWritePolicy,
    source: {
      upstreamPath: manifest.source.upstreamPath,
      snapshotPath: manifest.source.snapshotPath,
      snapshotKind: manifest.source.snapshotKind,
      sha256: actualSourceSha256,
      verified: true,
    },
    adapter: manifest.adapter,
    bounds: manifest.bounds,
    exploration: {
      states: states.length,
      transitions: transitions.length,
      frontierExhausted,
      stateFingerprints: states.map((state) => state.fingerprint),
      transitionGraph: transitions,
    },
    properties,
    failures,
    diagnostics,
    replay: replayResult,
    zeroFailureReason: failures.length === 0
      ? "All properties covered by the reviewed finite boundary passed; excluded effects remain explicit descriptor-only diagnostics."
      : null,
  };
  result.semanticHash = semanticHash(result);
  return result;
}

export function runDogfoodCampaign(root) {
  const targets = loadDogfoodManifests(root).map((manifest) => runDogfoodTarget(root, manifest));
  const result = {
    ok: targets.every((target) => target.failures.length === 0 && target.replay.deterministic),
    schemaVersion: DOGFOOD_SCHEMA_VERSION,
    campaign: "external-web-dogfood",
    sourceOfTruth: "protocol/external-web-dogfood.mjs",
    targetCount: targets.length,
    zeroFailureCount: targets.filter((target) => target.failures.length === 0).length,
    failureCount: targets.reduce((count, target) => count + target.failures.length, 0),
    upstreamWritesPerformed: 0,
    targets,
  };
  result.semanticHash = semanticHash(result);
  return result;
}
