import { semanticHash } from "./ui-driver-v1.mjs";
import {
  ENVIRONMENT_CHECKPOINT_VERSION,
  captureEnvironmentCheckpoint,
  checkpointEvidence,
  environmentEffect,
  extendedStateIdentity,
  hasEnvironmentCheckpointCapability,
  restoreEnvironmentCheckpoint,
} from "./environment-checkpoints.mjs";
import {
  emptyWebStateNoveltyHistory,
  observeWebStateNovelty,
  scoreWebStateNovelty,
  webRouteFamily,
  webStateNoveltyFeatures,
} from "./web-state-novelty.mjs";

export const WEB_COVERAGE_GUIDED_EXPLORATION_VERSION = "1";

function actionSignature(action) {
  return semanticHash({
    kind: action?.kind ?? "unknown",
    target: {
      role: action?.target?.role ?? "",
      name: action?.target?.name ?? "",
      within: action?.target?.within ?? [],
      testIdentity: action?.target?.testIdentity ?? null,
      href: action?.target?.href ?? null,
    },
    input: action?.input ?? null,
  });
}

function edgeKey(stateIdentity, actionId) {
  return `${stateIdentity}\u0000${actionId}`;
}

function sameTrace(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((actionId, index) => actionId === right[index]);
}

function frontierScore(node, executedEdges, executedActionSignatures, actionFilter) {
  const available = node.inventory.actions.filter((action) => actionFilter(action) && !executedEdges.has(edgeKey(node.identity, action.id)));
  const globallyNew = available.filter((action) => !executedActionSignatures.has(actionSignature(action)));
  return {
    score: node.discoveryNovelty.score + globallyNew.length * 5 + available.length,
    available,
    globallyNew,
  };
}

function selectFrontierNode(nodes, executedEdges, executedActionSignatures, maxDepth, actionFilter) {
  const ranked = nodes
    .filter((node) => node.depth < maxDepth)
    .map((node) => ({ node, frontier: frontierScore(node, executedEdges, executedActionSignatures, actionFilter) }))
    .filter(({ frontier }) => frontier.available.length > 0)
    .sort((left, right) => {
      if (right.frontier.score !== left.frontier.score) return right.frontier.score - left.frontier.score;
      if (left.node.depth !== right.node.depth) return left.node.depth - right.node.depth;
      if (left.node.ordinal !== right.node.ordinal) return left.node.ordinal - right.node.ordinal;
      return left.node.identity.localeCompare(right.node.identity);
    });
  return ranked[0] ?? null;
}

function selectAction(frontier, executedActionSignatures) {
  return [...frontier.available].sort((left, right) => {
    const leftNew = executedActionSignatures.has(actionSignature(left)) ? 0 : 1;
    const rightNew = executedActionSignatures.has(actionSignature(right)) ? 0 : 1;
    if (rightNew !== leftNew) return rightNew - leftNew;
    return left.id.localeCompare(right.id);
  })[0];
}

async function replayStatelessTrace(driver, trace) {
  let snapshot = await driver.reset();
  for (const actionId of trace) {
    const inventory = await driver.actions();
    const action = inventory.actions.find((candidate) => candidate.id === actionId);
    if (!action) return { ok: false, missingActionId: actionId, snapshot };
    let result;
    try {
      result = await driver.execute(action);
    } catch (error) {
      return { ok: false, executionError: error.message, failedActionId: actionId, snapshot };
    }
    snapshot = result.snapshot;
  }
  return { ok: true, snapshot };
}

function checkpointTransition({ beforeSnapshot, beforeEnvironment, actionId, afterSnapshot, afterEnvironment }) {
  const from = extendedStateIdentity(beforeSnapshot.fingerprint, beforeEnvironment.environmentStateId);
  const to = extendedStateIdentity(afterSnapshot.fingerprint, afterEnvironment.environmentStateId);
  return {
    from,
    actionId,
    to,
    runtimeFrom: beforeSnapshot.fingerprint,
    runtimeTo: afterSnapshot.fingerprint,
    environmentBefore: beforeEnvironment.environmentStateId,
    environmentAfter: afterEnvironment.environmentStateId,
    environmentEffect: environmentEffect(beforeEnvironment.environmentStateId, afterEnvironment.environmentStateId),
  };
}

function transitionMatches(expected, actual) {
  return expected?.from === actual.from
    && expected?.actionId === actual.actionId
    && expected?.to === actual.to
    && expected?.runtimeFrom === actual.runtimeFrom
    && expected?.runtimeTo === actual.runtimeTo
    && expected?.environmentBefore === actual.environmentBefore
    && expected?.environmentAfter === actual.environmentAfter
    && expected?.environmentEffect === actual.environmentEffect;
}

export async function replayWebCheckpointedTrace(driver, {
  initialCheckpoint,
  trace,
  expectedTransitions = [],
  expectedFinalIdentity = null,
} = {}) {
  if (!hasEnvironmentCheckpointCapability(driver)) {
    throw new Error("checkpoint-aware replay requires checkpoint()/restoreCheckpoint() driver methods");
  }
  if (!Array.isArray(trace)) throw new Error("checkpoint-aware replay trace must be an array");
  if (!Array.isArray(expectedTransitions)) throw new Error("checkpoint-aware expectedTransitions must be an array");
  if (expectedTransitions.length > 0 && expectedTransitions.length !== trace.length) {
    throw new Error("checkpoint-aware expectedTransitions length must match trace length");
  }

  const baseline = checkpointEvidence(initialCheckpoint);
  try {
    await restoreEnvironmentCheckpoint(driver, baseline);
  } catch (error) {
    return { ok: false, diagnostic: { code: "environment_checkpoint_restore_failed", error: error.message } };
  }

  let snapshot;
  try {
    snapshot = await driver.reset();
  } catch (error) {
    return { ok: false, diagnostic: { code: "runtime_reset_after_checkpoint_restore_failed", error: error.message } };
  }

  let environment;
  try {
    environment = await captureEnvironmentCheckpoint(driver);
  } catch (error) {
    return { ok: false, diagnostic: { code: "environment_checkpoint_capture_failed", error: error.message } };
  }
  if (environment.environmentStateId !== baseline.environmentStateId) {
    return {
      ok: false,
      diagnostic: {
        code: "environment_checkpoint_drift_after_reset",
        expectedEnvironmentStateId: baseline.environmentStateId,
        actualEnvironmentStateId: environment.environmentStateId,
      },
    };
  }

  const transitionEvidence = [];
  for (let index = 0; index < trace.length; index += 1) {
    const actionId = trace[index];
    const inventory = await driver.actions();
    const action = inventory.actions.find((candidate) => candidate.id === actionId);
    if (!action) return { ok: false, missingActionId: actionId, snapshot, environment, transitionEvidence };
    const beforeSnapshot = snapshot;
    const beforeEnvironment = environment;
    let result;
    try {
      result = await driver.execute(action);
    } catch (error) {
      return { ok: false, executionError: error.message, failedActionId: actionId, snapshot, environment, transitionEvidence };
    }
    snapshot = result.snapshot;
    try {
      environment = await captureEnvironmentCheckpoint(driver);
    } catch (error) {
      return { ok: false, diagnostic: { code: "environment_checkpoint_capture_failed", actionId, error: error.message }, snapshot, transitionEvidence };
    }
    const evidence = checkpointTransition({ beforeSnapshot, beforeEnvironment, actionId, afterSnapshot: snapshot, afterEnvironment: environment });
    transitionEvidence.push(evidence);
    if (expectedTransitions.length > 0 && !transitionMatches(expectedTransitions[index], evidence)) {
      return {
        ok: false,
        diagnostic: {
          code: "extended_state_replay_mismatch",
          step: index,
          expected: expectedTransitions[index],
          actual: evidence,
        },
        snapshot,
        environment,
        transitionEvidence,
      };
    }
  }

  const finalIdentity = extendedStateIdentity(snapshot.fingerprint, environment.environmentStateId);
  if (expectedFinalIdentity !== null && finalIdentity !== expectedFinalIdentity) {
    return {
      ok: false,
      diagnostic: {
        code: "extended_state_replay_final_identity_mismatch",
        expected: expectedFinalIdentity,
        actual: finalIdentity,
      },
      snapshot,
      environment,
      transitionEvidence,
    };
  }
  return {
    ok: true,
    snapshot,
    environment,
    finalIdentity,
    transitionEvidence,
    inventory: await driver.actions(),
  };
}

function checkpointReplayEvidence(initialEnvironment, transitions) {
  return {
    version: ENVIRONMENT_CHECKPOINT_VERSION,
    initialCheckpoint: checkpointEvidence(initialEnvironment),
    transitions: transitions.map((transition) => ({ ...transition })),
  };
}

function replayProjection(failures) {
  return failures
    .filter((failure) => failure?.checkpointReplay)
    .map((failure) => ({
      code: failure?.code ?? failure?.property ?? failure?.failureClass ?? null,
      trace: failure.trace ?? [],
      transitions: failure.checkpointReplay.transitions ?? [],
    }));
}

export async function exploreWebCoverageGuided(driver, {
  maxStates = 100,
  maxTransitions = 500,
  maxDepth = 12,
  actionFilter = () => true,
} = {}) {
  if (!driver || typeof driver.reset !== "function" || typeof driver.actions !== "function" || typeof driver.execute !== "function") {
    throw new Error("coverage-guided exploration requires reset/actions/execute driver methods");
  }
  if (typeof actionFilter !== "function") throw new Error("actionFilter must be a function");
  for (const [label, value] of [["maxStates", maxStates], ["maxTransitions", maxTransitions], ["maxDepth", maxDepth]]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
  }

  const checkpointAware = hasEnvironmentCheckpointCapability(driver);
  const diagnostics = [];
  const failures = [];
  const transitions = [];
  const executedEdges = new Set();
  const executedActionSignatures = new Set();
  const routeFamilies = new Set();
  const stateByIdentity = new Map();
  let noveltyHistory = emptyWebStateNoveltyHistory();
  let ordinal = 0;

  const initialSnapshot = await driver.reset();
  const initialEnvironment = checkpointAware ? await captureEnvironmentCheckpoint(driver) : null;
  const initialIdentity = extendedStateIdentity(initialSnapshot.fingerprint, initialEnvironment?.environmentStateId ?? null);
  const initialInventory = await driver.actions();
  const initialFeatures = webStateNoveltyFeatures({ snapshot: initialSnapshot, inventory: initialInventory });
  const initialNovelty = scoreWebStateNovelty(noveltyHistory, { features: initialFeatures });
  noveltyHistory = observeWebStateNovelty(noveltyHistory, { features: initialFeatures });
  const initialNode = {
    ordinal: ordinal++, depth: 0, trace: [], traceEvidence: [], identity: initialIdentity,
    snapshot: initialSnapshot, environment: initialEnvironment, inventory: initialInventory,
    discoveryNovelty: initialNovelty,
  };
  stateByIdentity.set(initialIdentity, initialNode);
  routeFamilies.add(webRouteFamily(initialSnapshot.url));
  let currentTrace = [];
  let currentFingerprint = initialSnapshot.fingerprint;
  let currentInventory = initialInventory;

  while (transitions.length < maxTransitions && stateByIdentity.size < maxStates) {
    const selected = selectFrontierNode([...stateByIdentity.values()], executedEdges, executedActionSignatures, maxDepth, actionFilter);
    if (!selected) break;
    const action = selectAction(selected.frontier, executedActionSignatures);
    const source = selected.node;
    executedEdges.add(edgeKey(source.identity, action.id));
    executedActionSignatures.add(actionSignature(action));

    let replay = null;
    let replayInventory = null;
    const reuseCandidate = !checkpointAware
      && sameTrace(currentTrace, source.trace)
      && currentFingerprint === source.snapshot.fingerprint
      && currentInventory
      && typeof driver.snapshot === "function";
    if (reuseCandidate) {
      try {
        const liveSnapshot = await driver.snapshot();
        currentFingerprint = liveSnapshot.fingerprint;
        if (liveSnapshot.fingerprint === source.snapshot.fingerprint) {
          replay = { ok: true, snapshot: liveSnapshot };
          replayInventory = currentInventory;
        }
      } catch {
        currentFingerprint = null;
      }
    }

    if (checkpointAware) {
      replay = await replayWebCheckpointedTrace(driver, {
        initialCheckpoint: initialEnvironment,
        trace: source.trace,
        expectedTransitions: source.traceEvidence,
        expectedFinalIdentity: source.identity,
      });
      if (replay.ok) {
        try {
          await restoreEnvironmentCheckpoint(driver, source.environment);
          const restored = await captureEnvironmentCheckpoint(driver);
          if (restored.environmentStateId !== source.environment.environmentStateId) {
            replay = {
              ok: false,
              diagnostic: {
                code: "parent_environment_restore_mismatch",
                expectedEnvironmentStateId: source.environment.environmentStateId,
                actualEnvironmentStateId: restored.environmentStateId,
              },
            };
          } else {
            replayInventory = await driver.actions();
          }
        } catch (error) {
          replay = { ok: false, diagnostic: { code: "parent_environment_restore_failed", error: error.message } };
        }
      }
      currentTrace = null;
      currentFingerprint = null;
      currentInventory = null;
    } else if (!replay) {
      replay = await replayStatelessTrace(driver, source.trace);
      currentTrace = replay.ok ? [...source.trace] : null;
      currentFingerprint = replay.ok ? replay.snapshot.fingerprint : null;
      currentInventory = replay.ok ? await driver.actions() : null;
      replayInventory = currentInventory;
    }

    if (!replay.ok) {
      if (replay.diagnostic) {
        diagnostics.push({
          ...replay.diagnostic,
          sourceFingerprint: source.snapshot.fingerprint,
          sourceStateIdentity: source.identity,
          trace: source.trace,
        });
      } else {
        diagnostics.push(replay.executionError ? {
          code: "frontier_trace_replay_execution_failed",
          sourceFingerprint: source.snapshot.fingerprint,
          sourceStateIdentity: source.identity,
          actionId: replay.failedActionId,
          trace: source.trace,
          error: replay.executionError,
        } : {
          code: "frontier_trace_replay_missing_action",
          sourceFingerprint: source.snapshot.fingerprint,
          sourceStateIdentity: source.identity,
          missingActionId: replay.missingActionId,
          trace: source.trace,
        });
      }
      continue;
    }

    const replayAction = replayInventory.actions.find((candidate) => candidate.id === action.id);
    if (!replayAction) {
      diagnostics.push({
        code: "frontier_action_missing_after_replay",
        sourceFingerprint: source.snapshot.fingerprint,
        sourceStateIdentity: source.identity,
        actionId: action.id,
        trace: source.trace,
      });
      continue;
    }

    let result;
    try {
      result = await driver.execute(replayAction);
    } catch (error) {
      currentTrace = null;
      currentFingerprint = null;
      currentInventory = null;
      diagnostics.push({
        code: "frontier_action_execution_failed",
        sourceFingerprint: source.snapshot.fingerprint,
        sourceStateIdentity: source.identity,
        actionId: action.id,
        trace: source.trace,
        error: error.message,
      });
      continue;
    }

    const nextSnapshot = result.snapshot;
    let nextEnvironment = null;
    if (checkpointAware) {
      try {
        nextEnvironment = await captureEnvironmentCheckpoint(driver);
      } catch (error) {
        diagnostics.push({
          code: "frontier_environment_checkpoint_failed",
          sourceFingerprint: source.snapshot.fingerprint,
          sourceStateIdentity: source.identity,
          actionId: action.id,
          trace: source.trace,
          error: error.message,
        });
        continue;
      }
    }
    const nextIdentity = extendedStateIdentity(nextSnapshot.fingerprint, nextEnvironment?.environmentStateId ?? null);
    const nextInventory = await driver.actions();
    const nextTrace = [...source.trace, action.id];
    const transition = checkpointAware
      ? {
        ...checkpointTransition({
          beforeSnapshot: source.snapshot,
          beforeEnvironment: source.environment,
          actionId: action.id,
          afterSnapshot: nextSnapshot,
          afterEnvironment: nextEnvironment,
        }),
        depth: source.depth + 1,
      }
      : {
        from: source.snapshot.fingerprint,
        actionId: action.id,
        to: nextSnapshot.fingerprint,
        depth: source.depth + 1,
      };
    const { depth: _transitionDepth, ...transitionEvidence } = transition;
    const nextTraceEvidence = checkpointAware ? [...source.traceEvidence, transitionEvidence] : [];

    currentTrace = checkpointAware ? null : nextTrace;
    currentFingerprint = checkpointAware ? null : nextSnapshot.fingerprint;
    currentInventory = checkpointAware ? null : nextInventory;
    transitions.push(transition);
    const transitionViolations = result.violations ?? [];
    for (const failure of transitionViolations) {
      const enriched = { ...failure, trace: failure.trace ?? nextTrace };
      if (checkpointAware) enriched.checkpointReplay = checkpointReplayEvidence(initialEnvironment, nextTraceEvidence);
      failures.push(enriched);
    }
    routeFamilies.add(webRouteFamily(nextSnapshot.url));
    // A property violation terminates this branch. Keeping the post-failure
    // state on the frontier tends to rediscover the same failure with a
    // strictly longer trace and obscures the first counterexample.
    if (transitionViolations.length > 0) continue;

    if (!stateByIdentity.has(nextIdentity) && stateByIdentity.size < maxStates) {
      const features = webStateNoveltyFeatures({ snapshot: nextSnapshot, inventory: nextInventory });
      const novelty = scoreWebStateNovelty(noveltyHistory, { features });
      noveltyHistory = observeWebStateNovelty(noveltyHistory, { features });
      stateByIdentity.set(nextIdentity, {
        ordinal: ordinal++,
        depth: source.depth + 1,
        trace: nextTrace,
        traceEvidence: nextTraceEvidence,
        identity: nextIdentity,
        snapshot: nextSnapshot,
        environment: nextEnvironment,
        inventory: nextInventory,
        discoveryNovelty: novelty,
      });
    }
  }

  const nodes = [...stateByIdentity.values()].sort((a, b) => a.ordinal - b.ordinal);
  const frontierRemaining = nodes.some((node) => frontierScore(node, executedEdges, executedActionSignatures, actionFilter).available.length > 0 && node.depth < maxDepth);
  const stateTraces = checkpointAware
    ? nodes.map((node) => ({
      identity: node.identity,
      fingerprint: node.snapshot.fingerprint,
      environmentStateId: node.environment.environmentStateId,
      depth: node.depth,
      trace: node.trace,
      transitions: node.traceEvidence,
    }))
    : nodes.map((node) => ({ fingerprint: node.snapshot.fingerprint, depth: node.depth, trace: node.trace }));
  const stable = {
    version: WEB_COVERAGE_GUIDED_EXPLORATION_VERSION,
    states: nodes.length,
    transitions: transitions.length,
    routeFamilies: [...routeFamilies].sort(),
    executedActionSignatureCount: executedActionSignatures.size,
    failureCount: failures.length,
    diagnostics,
    transitionGraph: transitions,
    stateFingerprints: nodes.map((node) => node.snapshot.fingerprint),
    stateTraces,
    frontierExhausted: !frontierRemaining,
    truncatedByStateLimit: nodes.length >= maxStates && frontierRemaining,
    truncatedByTransitionLimit: transitions.length >= maxTransitions && frontierRemaining,
  };
  if (checkpointAware) {
    stable.checkpointAware = true;
    stable.checkpointVersion = ENVIRONMENT_CHECKPOINT_VERSION;
    stable.stateIdentities = nodes.map((node) => node.identity);
    stable.replayProjectionHash = semanticHash(replayProjection(failures));
  }
  return {
    ok: true,
    runtime: "web-coverage-guided-exploration",
    bounds: { maxStates, maxTransitions, maxDepth },
    ...stable,
    ...(checkpointAware ? { checkpointProvenance: checkpointEvidence(initialEnvironment) } : {}),
    failures,
    semanticHash: semanticHash(stable),
  };
}
