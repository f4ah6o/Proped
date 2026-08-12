import { semanticHash } from "./ui-driver-v1.mjs";
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
    },
    input: action?.input ?? null,
  });
}

function edgeKey(fingerprint, actionId) {
  return `${fingerprint}\u0000${actionId}`;
}

function frontierScore(node, executedEdges, executedActionSignatures, actionFilter) {
  const available = node.inventory.actions.filter((action) => actionFilter(action) && !executedEdges.has(edgeKey(node.snapshot.fingerprint, action.id)));
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
      return left.node.snapshot.fingerprint.localeCompare(right.node.snapshot.fingerprint);
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

async function replayTrace(driver, trace) {
  let snapshot = await driver.reset();
  for (const actionId of trace) {
    const inventory = await driver.actions();
    const action = inventory.actions.find((candidate) => candidate.id === actionId);
    if (!action) return { ok: false, missingActionId: actionId, snapshot };
    const result = await driver.execute(action);
    snapshot = result.snapshot;
  }
  return { ok: true, snapshot };
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

  const diagnostics = [];
  const failures = [];
  const transitions = [];
  const executedEdges = new Set();
  const executedActionSignatures = new Set();
  const routeFamilies = new Set();
  const stateByFingerprint = new Map();
  let noveltyHistory = emptyWebStateNoveltyHistory();
  let ordinal = 0;

  const initialSnapshot = await driver.reset();
  const initialInventory = await driver.actions();
  const initialFeatures = webStateNoveltyFeatures({ snapshot: initialSnapshot, inventory: initialInventory });
  const initialNovelty = scoreWebStateNovelty(noveltyHistory, { features: initialFeatures });
  noveltyHistory = observeWebStateNovelty(noveltyHistory, { features: initialFeatures });
  const initialNode = {
    ordinal: ordinal++, depth: 0, trace: [], snapshot: initialSnapshot, inventory: initialInventory,
    discoveryNovelty: initialNovelty,
  };
  stateByFingerprint.set(initialSnapshot.fingerprint, initialNode);
  routeFamilies.add(webRouteFamily(initialSnapshot.url));

  while (transitions.length < maxTransitions && stateByFingerprint.size < maxStates) {
    const selected = selectFrontierNode([...stateByFingerprint.values()], executedEdges, executedActionSignatures, maxDepth, actionFilter);
    if (!selected) break;
    const action = selectAction(selected.frontier, executedActionSignatures);
    const source = selected.node;
    executedEdges.add(edgeKey(source.snapshot.fingerprint, action.id));
    executedActionSignatures.add(actionSignature(action));

    const replay = await replayTrace(driver, source.trace);
    if (!replay.ok) {
      diagnostics.push({
        code: "frontier_trace_replay_missing_action",
        sourceFingerprint: source.snapshot.fingerprint,
        missingActionId: replay.missingActionId,
        trace: source.trace,
      });
      continue;
    }
    const replayInventory = await driver.actions();
    const replayAction = replayInventory.actions.find((candidate) => candidate.id === action.id);
    if (!replayAction) {
      diagnostics.push({
        code: "frontier_action_missing_after_replay",
        sourceFingerprint: source.snapshot.fingerprint,
        actionId: action.id,
        trace: source.trace,
      });
      continue;
    }

    const result = await driver.execute(replayAction);
    const nextSnapshot = result.snapshot;
    const nextInventory = await driver.actions();
    const nextTrace = [...source.trace, action.id];
    transitions.push({
      from: source.snapshot.fingerprint,
      actionId: action.id,
      to: nextSnapshot.fingerprint,
      depth: source.depth + 1,
    });
    const transitionViolations = result.violations ?? [];
    for (const failure of transitionViolations) failures.push({ ...failure, trace: failure.trace ?? nextTrace });
    routeFamilies.add(webRouteFamily(nextSnapshot.url));
    // A property violation terminates this branch. Keeping the post-failure
    // state on the frontier tends to rediscover the same failure with a
    // strictly longer trace (for example Crash -> Crash) and obscures the
    // first counterexample before shrinking/replay has a chance to classify it.
    if (transitionViolations.length > 0) continue;

    if (!stateByFingerprint.has(nextSnapshot.fingerprint) && stateByFingerprint.size < maxStates) {
      const features = webStateNoveltyFeatures({ snapshot: nextSnapshot, inventory: nextInventory });
      const novelty = scoreWebStateNovelty(noveltyHistory, { features });
      noveltyHistory = observeWebStateNovelty(noveltyHistory, { features });
      stateByFingerprint.set(nextSnapshot.fingerprint, {
        ordinal: ordinal++,
        depth: source.depth + 1,
        trace: nextTrace,
        snapshot: nextSnapshot,
        inventory: nextInventory,
        discoveryNovelty: novelty,
      });
    }
  }

  const nodes = [...stateByFingerprint.values()].sort((a, b) => a.ordinal - b.ordinal);
  const frontierRemaining = nodes.some((node) => frontierScore(node, executedEdges, executedActionSignatures, actionFilter).available.length > 0 && node.depth < maxDepth);
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
    stateTraces: nodes.map((node) => ({ fingerprint: node.snapshot.fingerprint, depth: node.depth, trace: node.trace })),
    frontierExhausted: !frontierRemaining,
    truncatedByStateLimit: nodes.length >= maxStates && frontierRemaining,
    truncatedByTransitionLimit: transitions.length >= maxTransitions && frontierRemaining,
  };
  return {
    ok: true,
    runtime: "web-coverage-guided-exploration",
    bounds: { maxStates, maxTransitions, maxDepth },
    ...stable,
    failures,
    semanticHash: semanticHash(stable),
  };
}
