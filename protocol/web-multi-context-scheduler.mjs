import { failureSignature, semanticHash } from "./ui-driver-v1.mjs";

export const WEB_MULTI_CONTEXT_SCHEDULER_VERSION = "1";

function clone(value) {
  return structuredClone(value);
}

function normalizeContexts(contextIds) {
  if (!Array.isArray(contextIds) || contextIds.length < 2) throw new Error("multi-context scheduler requires at least two context ids");
  const ids = [...new Set(contextIds)];
  if (ids.length !== contextIds.length) throw new Error("context ids must be unique");
  for (const id of ids) if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid context id: ${id}`);
  return ids;
}

function operationId(contextId, action) {
  return `${contextId}:${action.id}`;
}

function stableState(state) {
  return {
    shared: state.shared,
    contexts: Object.fromEntries(Object.entries(state.contexts).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function stateFingerprint(state) {
  return semanticHash(stableState(state));
}

function makeFailure(failure, trace, state, seed) {
  const property = failure.property ?? failure.code ?? "multi_context_violation";
  const failureClass = failure.failureClass ?? property;
  const snapshotHash = stateFingerprint(state);
  return {
    ...failure,
    property,
    failureClass,
    trace,
    signature: failureSignature({
      fixture: "web-multi-context",
      property,
      failureClass,
      trace,
      snapshotHash,
      seed,
      normalizerVersion: "multi-context-1",
    }),
  };
}

export function replayMultiContextSchedule(scenario, trace, { seed = 1 } = {}) {
  let state = clone(scenario.initialState());
  const replayed = [];
  for (const step of trace) {
    const actions = scenario.actions(state, step.contextId) ?? [];
    const action = actions.find((candidate) => candidate.id === step.actionId);
    if (!action) return { ok: false, missing: step, trace: replayed, state, fingerprint: stateFingerprint(state) };
    state = clone(scenario.transition(clone(state), step.contextId, action));
    replayed.push({ contextId: step.contextId, actionId: action.id });
  }
  const violations = (scenario.invariant?.(state, replayed) ?? []).map((failure) => makeFailure(failure, replayed, state, seed));
  return {
    ok: true,
    trace: replayed,
    state,
    fingerprint: stateFingerprint(state),
    violations,
    semanticHash: semanticHash({ trace: replayed, state: stableState(state), violations: violations.map((failure) => failure.signature.semanticHash) }),
  };
}

export function exploreMultiContextSchedules(scenario, {
  contextIds = ["a", "b"],
  maxDepth = 6,
  maxTransitions = 1000,
  maxStates = 1000,
  seed = 1,
} = {}) {
  const ids = normalizeContexts(contextIds);
  for (const [name, value] of [["maxDepth", maxDepth], ["maxTransitions", maxTransitions], ["maxStates", maxStates]]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
  }
  if (!scenario || typeof scenario.initialState !== "function" || typeof scenario.actions !== "function" || typeof scenario.transition !== "function") {
    throw new Error("scenario must provide initialState/actions/transition");
  }

  const initial = clone(scenario.initialState());
  for (const id of ids) if (!(id in (initial.contexts ?? {}))) throw new Error(`initialState.contexts is missing ${id}`);

  const initialFingerprint = stateFingerprint(initial);
  const states = new Map([[initialFingerprint, { state: initial, depth: 0, trace: [], ordinal: 0 }]]);
  const queue = [initialFingerprint];
  const transitions = [];
  const failures = [];
  let ordinal = 1;
  let depthBoundReached = false;
  let transitionLimitReached = false;
  let stateLimitReached = false;

  while (queue.length > 0) {
    const fingerprint = queue.shift();
    const node = states.get(fingerprint);
    if (!node) continue;
    if (node.depth >= maxDepth) {
      const stillActionable = ids.some((contextId) => (scenario.actions(node.state, contextId) ?? []).length > 0);
      if (stillActionable) depthBoundReached = true;
      continue;
    }

    for (const contextId of ids) {
      const actions = [...(scenario.actions(node.state, contextId) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
      for (const action of actions) {
        if (transitions.length >= maxTransitions) { transitionLimitReached = true; break; }
        const next = clone(scenario.transition(clone(node.state), contextId, action));
        const nextTrace = [...node.trace, { contextId, actionId: action.id }];
        const nextFingerprint = stateFingerprint(next);
        transitions.push({ from: fingerprint, contextId, actionId: action.id, operationId: operationId(contextId, action), to: nextFingerprint, depth: node.depth + 1 });

        for (const failure of scenario.invariant?.(next, nextTrace) ?? []) {
          failures.push(makeFailure(failure, nextTrace, next, seed));
        }

        if (!states.has(nextFingerprint)) {
          if (states.size >= maxStates) { stateLimitReached = true; continue; }
          states.set(nextFingerprint, { state: next, depth: node.depth + 1, trace: nextTrace, ordinal: ordinal++ });
          queue.push(nextFingerprint);
        }
      }
      if (transitionLimitReached) break;
    }
    if (transitionLimitReached) break;
  }

  const orderedStates = [...states.entries()].sort(([, a], [, b]) => a.ordinal - b.ordinal);
  const canonicalFailures = [...new Map(failures.map((failure) => [failure.signature.semanticHash, failure])).values()]
    .sort((a, b) => a.signature.semanticHash.localeCompare(b.signature.semanticHash));
  const stable = {
    version: WEB_MULTI_CONTEXT_SCHEDULER_VERSION,
    contextIds: ids,
    bounds: { maxDepth, maxTransitions, maxStates },
    states: orderedStates.length,
    transitions: transitions.length,
    failures: canonicalFailures.map((failure) => ({ property: failure.property, failureClass: failure.failureClass, trace: failure.trace, signature: failure.signature.semanticHash })),
    stateFingerprints: orderedStates.map(([fingerprint]) => fingerprint),
    transitionGraph: transitions,
    depthBoundReached,
    transitionLimitReached,
    stateLimitReached,
  };
  return {
    ok: true,
    runtime: "web-multi-context-scheduler",
    ...stable,
    failures: canonicalFailures,
    semanticHash: semanticHash(stable),
  };
}
