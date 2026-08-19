import {
  OPAQUE_WEB_ACTION_KINDS,
  OPAQUE_WEB_BROWSER_ENGINES,
  OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
  OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES,
  OPAQUE_WEB_POINTER_POINTS,
  OPAQUE_WEB_TRANSITIONS,
} from "./opaque-web-replay-v1.mjs";

export const OPAQUE_WEB_REAL_CONSUMER_EVIDENCE_VERSION = "OpaqueWebRealConsumerEvidenceV1";
export const OPAQUE_WEB_REAL_CONSUMER_ACCEPTANCE_VERSION = "OpaqueWebRealConsumerAcceptanceV1";

const EVIDENCE_KEYS = new Set([
  "version",
  "candidateOrderVersion",
  "consumerSpecificAdapterLoc",
  "source",
  "peer",
  "consumerBefore",
  "consumerAfter",
]);
const REFERENCE_KEYS = new Set(["browserEngine", "steps", "attempts", "deterministic", "minimality"]);
const CONSUMER_KEYS = new Set(["steps", "attempts", "deterministic", "freshContext", "mutableStateIsolation"]);
const STEP_KEYS = new Set(["kind", "ordinal", "transition"]);
const MINIMALITY = new Set(["one-minimal", "budget-exhausted", "not-one-minimal"]);
const MUTABLE_STATE_ISOLATION = new Set(["isolated", "external-checkpoint", "unverified"]);
const CLASSIFICATIONS = new Set([
  "portable_replay_agrees",
  "consumer_boundary_divergence",
  "engine_family_divergence",
  "peer_engine_divergence",
  "inconclusive",
]);

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new Error(`${label} has unsupported field: ${key}`);
  for (const key of expected) if (!(key in value)) throw new Error(`${label} is missing field: ${key}`);
}

function validateSteps(steps, label) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 64) throw new Error(`${label}.steps must contain 1..64 steps`);
  return steps.map((step, index) => {
    assertExactKeys(step, STEP_KEYS, `${label}.steps[${index}]`);
    if (!OPAQUE_WEB_ACTION_KINDS.includes(step.kind)) throw new Error(`${label}.steps[${index}].kind is invalid`);
    const maximum = step.kind === "dom_activate" ? OPAQUE_WEB_MAX_DOM_ACTIVATE_CANDIDATES : OPAQUE_WEB_POINTER_POINTS.length;
    if (!Number.isSafeInteger(step.ordinal) || step.ordinal < 0 || step.ordinal >= maximum) throw new Error(`${label}.steps[${index}].ordinal is invalid`);
    if (!OPAQUE_WEB_TRANSITIONS.includes(step.transition)) throw new Error(`${label}.steps[${index}].transition is invalid`);
    return { kind: step.kind, ordinal: step.ordinal, transition: step.transition };
  });
}

function validateAttempts(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function validateReference(value, label) {
  assertExactKeys(value, REFERENCE_KEYS, label);
  if (!OPAQUE_WEB_BROWSER_ENGINES.includes(value.browserEngine)) throw new Error(`${label}.browserEngine is invalid`);
  validateAttempts(value.attempts, `${label}.attempts`);
  if (typeof value.deterministic !== "boolean") throw new Error(`${label}.deterministic must be boolean`);
  if (!MINIMALITY.has(value.minimality)) throw new Error(`${label}.minimality is invalid`);
  return { ...value, steps: validateSteps(value.steps, label) };
}

function validateConsumer(value, label) {
  assertExactKeys(value, CONSUMER_KEYS, label);
  validateAttempts(value.attempts, `${label}.attempts`);
  if (typeof value.deterministic !== "boolean") throw new Error(`${label}.deterministic must be boolean`);
  if (typeof value.freshContext !== "boolean") throw new Error(`${label}.freshContext must be boolean`);
  if (!MUTABLE_STATE_ISOLATION.has(value.mutableStateIsolation)) throw new Error(`${label}.mutableStateIsolation is invalid`);
  return { ...value, steps: validateSteps(value.steps, label) };
}

function actionVector(steps) {
  return steps.map(({ kind, ordinal }) => `${kind}:${ordinal}`);
}

function sameVector(left, right) {
  const a = actionVector(left);
  const b = actionVector(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function transitionVector(steps) {
  return steps.map(({ transition }) => transition);
}

function sameTransitions(left, right) {
  const a = transitionVector(left);
  const b = transitionVector(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function firstDivergence(sourceSteps, peerSteps, consumerSteps) {
  for (let index = 0; index < sourceSteps.length; index += 1) {
    const source = sourceSteps[index];
    const peer = peerSteps[index];
    const consumer = consumerSteps[index];
    if (source.transition === peer.transition && source.transition === consumer.transition) continue;
    return {
      index,
      kind: source.kind,
      ordinal: source.ordinal,
      sourceTransition: source.transition,
      peerTransition: peer.transition,
      consumerTransition: consumer.transition,
    };
  }
  return null;
}

function classify(sourceSteps, peerSteps, consumerSteps) {
  const sourcePeerAgree = sameTransitions(sourceSteps, peerSteps);
  const sourceConsumerAgree = sameTransitions(sourceSteps, consumerSteps);
  const peerConsumerAgree = sameTransitions(peerSteps, consumerSteps);
  if (sourcePeerAgree && sourceConsumerAgree) return "portable_replay_agrees";
  if (sourcePeerAgree && !sourceConsumerAgree) return "consumer_boundary_divergence";
  if (!sourcePeerAgree && peerConsumerAgree) return "engine_family_divergence";
  if (!sourcePeerAgree && sourceConsumerAgree) return "peer_engine_divergence";
  return "inconclusive";
}

function consumerProductionQualified(source, peer, consumer) {
  return source.minimality === "one-minimal"
    && source.deterministic
    && source.attempts >= 2
    && peer.minimality === "not-one-minimal"
    && peer.deterministic
    && peer.attempts >= 2
    && consumer.deterministic
    && consumer.attempts >= 2
    && consumer.freshContext
    && consumer.mutableStateIsolation !== "unverified"
    && consumer.steps.every((step) => step.transition !== "not_observed");
}

export function validateOpaqueWebRealConsumerEvidenceV1(value) {
  assertExactKeys(value, EVIDENCE_KEYS, OPAQUE_WEB_REAL_CONSUMER_EVIDENCE_VERSION);
  if (value.version !== OPAQUE_WEB_REAL_CONSUMER_EVIDENCE_VERSION) throw new Error("unsupported real-consumer evidence version");
  if (value.candidateOrderVersion !== OPAQUE_WEB_CANDIDATE_ORDER_VERSION) throw new Error("unsupported candidate order version");
  if (value.consumerSpecificAdapterLoc !== 0) throw new Error("consumer-specific adapter LOC must remain zero");
  const source = validateReference(value.source, "source");
  const peer = validateReference(value.peer, "peer");
  const consumerBefore = validateConsumer(value.consumerBefore, "consumerBefore");
  const consumerAfter = validateConsumer(value.consumerAfter, "consumerAfter");
  if (source.browserEngine === peer.browserEngine) throw new Error("peer observation must use a different browser engine");
  if (source.minimality !== "one-minimal") throw new Error("source observation must carry the source-engine one-minimal claim");
  if (peer.minimality !== "not-one-minimal") throw new Error("peer observation must not inherit source-engine one-minimality");
  for (const [label, steps] of [["peer", peer.steps], ["consumerBefore", consumerBefore.steps], ["consumerAfter", consumerAfter.steps]]) {
    if (!sameVector(source.steps, steps)) throw new Error(`${label} must preserve the exact portable kind+ordinal action vector`);
  }
  return {
    version: value.version,
    candidateOrderVersion: value.candidateOrderVersion,
    consumerSpecificAdapterLoc: 0,
    source,
    peer,
    consumerBefore,
    consumerAfter,
  };
}

export function buildOpaqueWebRealConsumerAcceptanceV1(value) {
  const evidence = validateOpaqueWebRealConsumerEvidenceV1(value);
  const beforeClassification = classify(evidence.source.steps, evidence.peer.steps, evidence.consumerBefore.steps);
  const afterClassification = classify(evidence.source.steps, evidence.peer.steps, evidence.consumerAfter.steps);
  if (!CLASSIFICATIONS.has(beforeClassification) || !CLASSIFICATIONS.has(afterClassification)) throw new Error("invalid real-consumer classification");
  return {
    version: OPAQUE_WEB_REAL_CONSUMER_ACCEPTANCE_VERSION,
    candidateOrderVersion: evidence.candidateOrderVersion,
    consumerSpecificAdapterLoc: 0,
    portableActionCount: evidence.source.steps.length,
    source: {
      browserEngine: evidence.source.browserEngine,
      attempts: evidence.source.attempts,
      deterministic: evidence.source.deterministic,
      minimality: evidence.source.minimality,
    },
    peer: {
      browserEngine: evidence.peer.browserEngine,
      attempts: evidence.peer.attempts,
      deterministic: evidence.peer.deterministic,
      minimality: evidence.peer.minimality,
    },
    before: {
      classification: beforeClassification,
      productionQualified: consumerProductionQualified(evidence.source, evidence.peer, evidence.consumerBefore),
      firstDivergence: firstDivergence(evidence.source.steps, evidence.peer.steps, evidence.consumerBefore.steps),
      mutableStateIsolation: evidence.consumerBefore.mutableStateIsolation,
    },
    after: {
      classification: afterClassification,
      productionQualified: consumerProductionQualified(evidence.source, evidence.peer, evidence.consumerAfter),
      firstDivergence: firstDivergence(evidence.source.steps, evidence.peer.steps, evidence.consumerAfter.steps),
      mutableStateIsolation: evidence.consumerAfter.mutableStateIsolation,
    },
  };
}
