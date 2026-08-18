import { semanticHash } from "./ui-driver-v1.mjs";
import {
  captureEnvironmentCheckpoint,
  hasEnvironmentCheckpointCapability,
  restoreEnvironmentCheckpoint,
} from "./environment-checkpoints.mjs";

export const CONTENT_BLIND_OPAQUE_PROFILE = "content-blind-opaque-v1";
export const OPAQUE_WEB_REPLAY_VERSION = "OpaqueWebReplayV1";
export const OPAQUE_WEB_CANDIDATE_ORDER_VERSION = "1";
export const OPAQUE_WEB_ACTION_KINDS = Object.freeze(["dom_activate", "pointer_point"]);
export const OPAQUE_WEB_TRANSITIONS = Object.freeze(["changed", "unchanged", "terminal", "not_observed"]);
export const OPAQUE_WEB_BROWSER_ENGINES = Object.freeze(["chromium", "webkit"]);
export const OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES = 32;
export const OPAQUE_WEB_MAX_REPLAY_STEPS = 64;
export const OPAQUE_WEB_POINTER_POINTS = Object.freeze([
  Object.freeze({ xNumerator: 1, xDenominator: 4, yNumerator: 1, yDenominator: 4 }),
  Object.freeze({ xNumerator: 2, xDenominator: 4, yNumerator: 1, yDenominator: 4 }),
  Object.freeze({ xNumerator: 3, xDenominator: 4, yNumerator: 1, yDenominator: 4 }),
  Object.freeze({ xNumerator: 1, xDenominator: 4, yNumerator: 2, yDenominator: 4 }),
  Object.freeze({ xNumerator: 2, xDenominator: 4, yNumerator: 2, yDenominator: 4 }),
  Object.freeze({ xNumerator: 3, xDenominator: 4, yNumerator: 2, yDenominator: 4 }),
  Object.freeze({ xNumerator: 1, xDenominator: 4, yNumerator: 3, yDenominator: 4 }),
  Object.freeze({ xNumerator: 2, xDenominator: 4, yNumerator: 3, yDenominator: 4 }),
  Object.freeze({ xNumerator: 3, xDenominator: 4, yNumerator: 3, yDenominator: 4 }),
]);

const ACTION_KEYS = new Set(["kind", "ordinal", "expectedTransition"]);
const REPLAY_KEYS = new Set(["version", "candidateOrderVersion", "browserEngine", "steps", "minimality"]);
const MINIMALITY_KEYS = new Set([
  "status",
  "budget",
  "checks",
  "originalStepCount",
  "minimalStepCount",
  "freshReplayAttempts",
  "deterministic",
]);
const MINIMALITY_STATUSES = new Set(["one-minimal", "budget-exhausted", "not-one-minimal"]);

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new Error(`${label} has unsupported field: ${key}`);
  for (const key of expected) if (!(key in value)) throw new Error(`${label} is missing field: ${key}`);
}

export function opaqueActionId(kind, ordinal) {
  if (!OPAQUE_WEB_ACTION_KINDS.includes(kind)) throw new Error(`unsupported opaque action kind: ${kind}`);
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 999) throw new Error("opaque action ordinal must be an integer in [0,999]");
  return `${kind}:${String(ordinal).padStart(3, "0")}`;
}

export function opaqueCandidateOrderFixtureVector() {
  const pointerActions = OPAQUE_WEB_POINTER_POINTS.map((_, ordinal) => ({ kind: "pointer_point", ordinal }));
  const actionsForDomCount = (count) => [
    ...Array.from({ length: Math.min(count, OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES) }, (_, ordinal) => ({ kind: "dom_activate", ordinal })),
    ...pointerActions,
  ];
  return {
    profile: CONTENT_BLIND_OPAQUE_PROFILE,
    candidateOrderVersion: OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
    actionKinds: [...OPAQUE_WEB_ACTION_KINDS],
    maximumDomActivateCandidates: OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES,
    maximumReplaySteps: OPAQUE_WEB_MAX_REPLAY_STEPS,
    domActivateOrder: "native-structural-document-order",
    domActivateEligibility: [
      "button:not-disabled",
      "anchor:has-href",
      "input-button:not-disabled",
      "input-submit:not-disabled",
      "input-reset:not-disabled",
      "input-checkbox:not-disabled",
      "input-radio:not-disabled",
      "summary",
      "exclude-hidden-ancestor",
    ],
    pointerGeometry: {
      coordinateSpace: "viewport",
      points: OPAQUE_WEB_POINTER_POINTS.map((point, ordinal) => ({ ordinal, ...point })),
    },
    vectors: [
      { domActivateCount: 0, expectedActions: actionsForDomCount(0) },
      { domActivateCount: 3, expectedActions: actionsForDomCount(3) },
      { domActivateCount: 40, expectedActions: actionsForDomCount(40) },
    ],
  };
}

export function validateOpaqueWebReplayV1(value) {
  assertExactKeys(value, REPLAY_KEYS, OPAQUE_WEB_REPLAY_VERSION);
  if (value.version !== OPAQUE_WEB_REPLAY_VERSION) throw new Error(`unsupported opaque replay version: ${value.version}`);
  if (value.candidateOrderVersion !== OPAQUE_WEB_CANDIDATE_ORDER_VERSION) throw new Error(`unsupported candidate order version: ${value.candidateOrderVersion}`);
  if (!OPAQUE_WEB_BROWSER_ENGINES.includes(value.browserEngine)) throw new Error(`unsupported opaque replay browser engine: ${value.browserEngine}`);
  if (!Array.isArray(value.steps)) throw new Error("opaque replay steps must be an array");
  if (value.steps.length > OPAQUE_WEB_MAX_REPLAY_STEPS) throw new Error("opaque replay step count exceeds the P0 bound");
  for (const [index, step] of value.steps.entries()) {
    assertExactKeys(step, ACTION_KEYS, `opaque replay step ${index}`);
    if (!OPAQUE_WEB_ACTION_KINDS.includes(step.kind)) throw new Error(`opaque replay step ${index} has unsupported kind`);
    const maximum = step.kind === "dom_activate" ? OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES : OPAQUE_WEB_POINTER_POINTS.length;
    if (!Number.isSafeInteger(step.ordinal) || step.ordinal < 0 || step.ordinal >= maximum) throw new Error(`opaque replay step ${index} has invalid ordinal`);
    if (!OPAQUE_WEB_TRANSITIONS.includes(step.expectedTransition)) throw new Error(`opaque replay step ${index} has invalid expectedTransition`);
  }
  assertExactKeys(value.minimality, MINIMALITY_KEYS, "opaque replay minimality");
  if (!MINIMALITY_STATUSES.has(value.minimality.status)) throw new Error("opaque replay minimality has invalid status");
  for (const key of ["budget", "checks", "originalStepCount", "minimalStepCount", "freshReplayAttempts"]) {
    if (!Number.isSafeInteger(value.minimality[key]) || value.minimality[key] < 0) throw new Error(`opaque replay minimality.${key} must be a non-negative integer`);
  }
  if (typeof value.minimality.deterministic !== "boolean") throw new Error("opaque replay minimality.deterministic must be boolean");
  return value;
}

function opaqueActionFromId(actionId) {
  const match = /^(dom_activate|pointer_point):(\d{3})$/.exec(String(actionId));
  if (!match) return null;
  return { kind: match[1], ordinal: Number(match[2]) };
}

function targetMatches(replay, targetFingerprint, targetEnvironmentStateId) {
  return replay.ok
    && replay.finalFingerprint === targetFingerprint
    && (targetEnvironmentStateId === null || replay.finalEnvironmentStateId === targetEnvironmentStateId);
}

async function replayOpaqueTrace(driver, trace, { initialCheckpoint = null } = {}) {
  try {
    if (initialCheckpoint) await restoreEnvironmentCheckpoint(driver, initialCheckpoint);
    let snapshot = await driver.reset();
    const steps = [];
    for (const actionId of trace) {
      const inventory = await driver.actions();
      const action = inventory.actions.find((candidate) => candidate.id === actionId);
      if (!action || !OPAQUE_WEB_ACTION_KINDS.includes(action.kind) || !Number.isSafeInteger(action.ordinal)) {
        const requested = opaqueActionFromId(actionId) ?? { kind: "dom_activate", ordinal: 0 };
        return { ok: false, steps: [...steps, { ...requested, expectedTransition: "not_observed" }] };
      }
      const beforeFingerprint = snapshot.fingerprint;
      let result;
      try {
        result = await driver.execute(action);
      } catch {
        return { ok: false, steps: [...steps, { kind: action.kind, ordinal: action.ordinal, expectedTransition: "not_observed" }] };
      }
      snapshot = result.snapshot;
      const terminal = Number(snapshot?.opaqueState?.domActivateCount ?? -1) === 0;
      steps.push({
        kind: action.kind,
        ordinal: action.ordinal,
        expectedTransition: terminal ? "terminal" : (snapshot.fingerprint === beforeFingerprint ? "unchanged" : "changed"),
      });
    }
    let finalEnvironmentStateId = null;
    if (initialCheckpoint && hasEnvironmentCheckpointCapability(driver)) {
      finalEnvironmentStateId = (await captureEnvironmentCheckpoint(driver)).environmentStateId;
    }
    return { ok: true, steps, finalFingerprint: snapshot.fingerprint, finalEnvironmentStateId };
  } catch {
    return { ok: false, steps: [] };
  }
}

function withoutIndex(values, index) {
  return values.filter((_, itemIndex) => itemIndex !== index);
}

export async function replayOpaqueWebReplayV1(driver, replay, { attempts = 1 } = {}) {
  validateOpaqueWebReplayV1(replay);
  if (!driver) throw new Error("opaque replay execution requires a driver");
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("opaque replay attempts must be a positive integer");
  const trace = replay.steps.map((step) => opaqueActionId(step.kind, step.ordinal));
  const runs = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const run = await replayOpaqueTrace(driver, trace);
    const observedSteps = run.steps;
    const matchesExpectedTransitions = observedSteps.length === replay.steps.length
      && replay.steps.every((step, index) => step.kind === observedSteps[index]?.kind
        && step.ordinal === observedSteps[index]?.ordinal
        && step.expectedTransition === observedSteps[index]?.expectedTransition);
    runs.push({ ok: run.ok, matchesExpectedTransitions, steps: observedSteps });
  }
  const deterministic = runs.every((run) => run.ok && run.matchesExpectedTransitions)
    && new Set(runs.map((run) => semanticHash(run.steps))).size === 1;
  return {
    ok: deterministic,
    browserEngine: driver.browserEngine ?? "chromium",
    attempts,
    deterministic,
    matchesExpectedTransitions: runs.every((run) => run.matchesExpectedTransitions),
    runs,
  };
}

export async function observeOpaqueWebReplayV1(driver, replay, { attempts = 2 } = {}) {
  validateOpaqueWebReplayV1(replay);
  if (!driver) throw new Error("opaque replay observation requires a driver");
  if (!Number.isSafeInteger(attempts) || attempts < 2) throw new Error("opaque replay observation requires at least two attempts");
  const browserEngine = driver.browserEngine ?? "chromium";
  if (!OPAQUE_WEB_BROWSER_ENGINES.includes(browserEngine)) throw new Error(`unsupported opaque replay engine: ${browserEngine}`);
  const trace = replay.steps.map((step) => opaqueActionId(step.kind, step.ordinal));
  const runs = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) runs.push(await replayOpaqueTrace(driver, trace));
  const complete = runs.every((run) => run.ok
    && run.steps.length === replay.steps.length
    && replay.steps.every((step, index) => step.kind === run.steps[index]?.kind && step.ordinal === run.steps[index]?.ordinal));
  const deterministic = complete && new Set(runs.map((run) => semanticHash(run.steps))).size === 1;
  if (!deterministic) throw new Error("opaque replay observation is not deterministic across fresh contexts");
  return validateOpaqueWebReplayV1({
    version: OPAQUE_WEB_REPLAY_VERSION,
    candidateOrderVersion: OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
    browserEngine,
    steps: runs[0].steps,
    minimality: {
      status: "not-one-minimal",
      budget: 0,
      checks: 0,
      originalStepCount: replay.steps.length,
      minimalStepCount: replay.steps.length,
      freshReplayAttempts: attempts,
      deterministic: true,
    },
  });
}

export async function buildOpaqueWebReplayV1(driver, {
  trace,
  targetFingerprint,
  targetEnvironmentStateId = null,
  initialCheckpoint = null,
  browserEngine = "chromium",
  budget = 128,
  freshReplayAttempts = 2,
} = {}) {
  if (!driver) throw new Error("opaque replay export requires a driver");
  if (!Array.isArray(trace) || trace.length === 0) throw new Error("opaque replay export requires a non-empty trace");
  if (typeof targetFingerprint !== "string" || targetFingerprint.length === 0) throw new Error("opaque replay export requires a target fingerprint");
  if (!OPAQUE_WEB_BROWSER_ENGINES.includes(browserEngine)) throw new Error(`unsupported opaque replay engine: ${browserEngine}`);
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("opaque replay budget must be a positive integer");
  if (!Number.isSafeInteger(freshReplayAttempts) || freshReplayAttempts < 2) throw new Error("opaque fresh replay attempts must be at least 2");
  if (initialCheckpoint && !hasEnvironmentCheckpointCapability(driver)) throw new Error("opaque replay initial checkpoint requires checkpoint capability");

  const originalTrace = [...trace];
  let minimized = [...trace];
  let checks = 0;
  let exhausted = false;
  const reproduces = async (candidateTrace) => {
    if (checks >= budget) {
      exhausted = true;
      return false;
    }
    checks += 1;
    return targetMatches(await replayOpaqueTrace(driver, candidateTrace, { initialCheckpoint }), targetFingerprint, targetEnvironmentStateId);
  };

  if (!(await reproduces(minimized))) throw new Error("opaque transition target is not reproducible from a fresh context");

  let changed = true;
  while (changed && !exhausted) {
    changed = false;
    for (let index = 0; index < minimized.length; index += 1) {
      const candidateTrace = withoutIndex(minimized, index);
      if (await reproduces(candidateTrace)) {
        minimized = candidateTrace;
        changed = true;
        break;
      }
      if (exhausted) break;
    }
  }

  let oneMinimal = !exhausted;
  if (oneMinimal) {
    for (let index = 0; index < minimized.length; index += 1) {
      if (await reproduces(withoutIndex(minimized, index))) {
        oneMinimal = false;
        break;
      }
      if (exhausted) {
        oneMinimal = false;
        break;
      }
    }
  }

  const freshRuns = [];
  for (let attempt = 0; attempt < freshReplayAttempts; attempt += 1) {
    freshRuns.push(await replayOpaqueTrace(driver, minimized, { initialCheckpoint }));
  }
  const successful = freshRuns.every((run) => targetMatches(run, targetFingerprint, targetEnvironmentStateId));
  const projectionHashes = freshRuns.map((run) => semanticHash({ ok: run.ok, steps: run.steps, finalFingerprint: run.finalFingerprint ?? null, finalEnvironmentStateId: run.finalEnvironmentStateId ?? null }));
  const deterministic = successful && new Set(projectionHashes).size === 1;
  if (!deterministic) throw new Error("opaque transition replay is not deterministic across fresh contexts");

  const replay = {
    version: OPAQUE_WEB_REPLAY_VERSION,
    candidateOrderVersion: OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
    browserEngine,
    steps: freshRuns[0].steps,
    minimality: {
      status: oneMinimal ? "one-minimal" : (exhausted ? "budget-exhausted" : "not-one-minimal"),
      budget,
      checks,
      originalStepCount: originalTrace.length,
      minimalStepCount: minimized.length,
      freshReplayAttempts,
      deterministic,
    },
  };
  return validateOpaqueWebReplayV1(replay);
}
