import { classifyWebFinding } from "./web-finding-group.mjs";
import { runFailureReplayGate } from "./web-replay-gate.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";
import {
  captureEnvironmentCheckpoint,
  environmentEffect,
  extendedStateIdentity,
  hasEnvironmentCheckpointCapability,
  restoreEnvironmentCheckpoint,
} from "./environment-checkpoints.mjs";

export const WEB_EXPLORATION_REPLAY_GATE_VERSION = "2";

function failureCode(failure) {
  return failure?.code ?? failure?.property ?? failure?.failureClass ?? null;
}

function failureRoute(failure) {
  return failure?.route ?? failure?.url ?? failure?.evidence?.route ?? failure?.evidence?.url ?? null;
}

function checkpointTransition({ beforeSnapshot, beforeEnvironment, actionId, afterSnapshot, afterEnvironment }) {
  return {
    from: extendedStateIdentity(beforeSnapshot.fingerprint, beforeEnvironment.environmentStateId),
    actionId,
    to: extendedStateIdentity(afterSnapshot.fingerprint, afterEnvironment.environmentStateId),
    runtimeFrom: beforeSnapshot.fingerprint,
    runtimeTo: afterSnapshot.fingerprint,
    environmentBefore: beforeEnvironment.environmentStateId,
    environmentAfter: afterEnvironment.environmentStateId,
    environmentEffect: environmentEffect(beforeEnvironment.environmentStateId, afterEnvironment.environmentStateId),
  };
}

function sameCheckpointTransition(expected, actual) {
  return expected?.from === actual.from
    && expected?.actionId === actual.actionId
    && expected?.to === actual.to
    && expected?.runtimeFrom === actual.runtimeFrom
    && expected?.runtimeTo === actual.runtimeTo
    && expected?.environmentBefore === actual.environmentBefore
    && expected?.environmentAfter === actual.environmentAfter
    && expected?.environmentEffect === actual.environmentEffect;
}

async function prepareCheckpointReplay(driver, checkpointReplay) {
  if (!checkpointReplay) return { ok: true, checkpointAware: false };
  if (!hasEnvironmentCheckpointCapability(driver)) {
    return { ok: false, diagnostic: { code: "checkpoint_replay_capability_missing" } };
  }
  const baseline = checkpointReplay.initialCheckpoint;
  try {
    await restoreEnvironmentCheckpoint(driver, baseline);
    const snapshot = await driver.reset();
    const environment = await captureEnvironmentCheckpoint(driver);
    if (environment.environmentStateId !== baseline.environmentStateId) {
      return {
        ok: false,
        diagnostic: {
          code: "checkpoint_replay_environment_drift",
          expectedEnvironmentStateId: baseline.environmentStateId,
          actualEnvironmentStateId: environment.environmentStateId,
        },
      };
    }
    return { ok: true, checkpointAware: true, snapshot, environment };
  } catch (error) {
    return { ok: false, diagnostic: { code: "checkpoint_replay_prepare_failed", error: error.message } };
  }
}

async function replayCandidateTrace(driver, candidate, trace, { verifyCheckpointTransitions = false } = {}) {
  if (!Array.isArray(trace) || trace.length === 0) return { reproduced: false, transitionEvidence: [] };
  if (!failureCode(candidate)) return { reproduced: false, transitionEvidence: [] };
  const targetFinding = classifyWebFinding(candidate);
  const targetRoute = failureRoute(candidate);
  const replayedTrace = [];
  const checkpointReplay = candidate?.checkpointReplay ?? null;
  const prepared = await prepareCheckpointReplay(driver, checkpointReplay);
  if (!prepared.ok) return { reproduced: false, transitionEvidence: [], diagnostic: prepared.diagnostic };

  let snapshot = prepared.checkpointAware ? prepared.snapshot : await driver.reset();
  let environment = prepared.checkpointAware ? prepared.environment : null;
  const transitionEvidence = [];
  const expectedTransitions = checkpointReplay?.transitions ?? [];
  if (verifyCheckpointTransitions && expectedTransitions.length !== trace.length) {
    return {
      reproduced: false,
      transitionEvidence,
      diagnostic: {
        code: "checkpoint_replay_transition_count_mismatch",
        expected: expectedTransitions.length,
        actual: trace.length,
      },
    };
  }

  for (let index = 0; index < trace.length; index += 1) {
    const actionId = trace[index];
    const inventory = await driver.actions();
    const action = inventory.actions.find((item) => item.id === actionId);
    if (!action) return { reproduced: false, transitionEvidence, diagnostic: { code: "checkpoint_replay_action_missing", actionId } };
    const beforeSnapshot = snapshot;
    const beforeEnvironment = environment;
    let result;
    try {
      result = await driver.execute(action);
    } catch (error) {
      return { reproduced: false, transitionEvidence, diagnostic: { code: "checkpoint_replay_action_failed", actionId, error: error.message } };
    }
    snapshot = result.snapshot;
    replayedTrace.push(actionId);

    if (prepared.checkpointAware) {
      try {
        environment = await captureEnvironmentCheckpoint(driver);
      } catch (error) {
        return { reproduced: false, transitionEvidence, diagnostic: { code: "checkpoint_replay_capture_failed", actionId, error: error.message } };
      }
      const evidence = checkpointTransition({ beforeSnapshot, beforeEnvironment, actionId, afterSnapshot: snapshot, afterEnvironment: environment });
      transitionEvidence.push(evidence);
      if (verifyCheckpointTransitions && !sameCheckpointTransition(expectedTransitions[index], evidence)) {
        return {
          reproduced: false,
          transitionEvidence,
          diagnostic: {
            code: "checkpoint_replay_extended_state_mismatch",
            step: index,
            expected: expectedTransitions[index],
            actual: evidence,
          },
        };
      }
    }

    for (const violation of result.violations ?? []) {
      const observedFinding = classifyWebFinding({
        ...violation,
        trace: violation?.trace ?? replayedTrace,
        route: failureRoute(violation) ?? (targetRoute ? result.snapshot?.url ?? null : null),
      });
      if (observedFinding.id === targetFinding.id) {
        if (verifyCheckpointTransitions && index !== trace.length - 1) {
          return {
            reproduced: false,
            transitionEvidence,
            diagnostic: { code: "checkpoint_replay_failure_reproduced_before_expected_end", step: index },
          };
        }
        return { reproduced: true, transitionEvidence };
      }
    }
  }
  return { reproduced: false, transitionEvidence };
}

async function replayCandidate(driver, candidate) {
  return replayCandidateTrace(driver, candidate, candidate?.trace ?? [], { verifyCheckpointTransitions: Boolean(candidate?.checkpointReplay) });
}

function withoutIndex(values, removed) {
  return values.filter((_, index) => index !== removed);
}

export async function shrinkWebExplorationFailureTrace(driver, candidate, { budget = 128 } = {}) {
  if (!driver) throw new Error("exploration failure shrink requires driver");
  if (!candidate || !Array.isArray(candidate.trace) || candidate.trace.length === 0) {
    throw new Error("exploration failure shrink requires a non-empty candidate trace");
  }
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("exploration failure shrink budget must be a positive safe integer");

  const finding = classifyWebFinding(candidate);
  const originalTrace = [...candidate.trace];
  let trace = [...originalTrace];
  let evaluations = 0;
  let exhausted = false;
  let changed = true;

  while (changed && !exhausted) {
    changed = false;
    for (let index = 0; index < trace.length; index += 1) {
      if (evaluations >= budget) {
        exhausted = true;
        break;
      }
      const candidateTrace = withoutIndex(trace, index);
      evaluations += 1;
      if ((await replayCandidateTrace(driver, candidate, candidateTrace)).reproduced) {
        trace = candidateTrace;
        changed = true;
        break;
      }
    }
  }

  let oneMinimal = !exhausted;
  if (oneMinimal) {
    for (let index = 0; index < trace.length; index += 1) {
      if (evaluations >= budget) {
        exhausted = true;
        oneMinimal = false;
        break;
      }
      evaluations += 1;
      if ((await replayCandidateTrace(driver, candidate, withoutIndex(trace, index))).reproduced) {
        oneMinimal = false;
        break;
      }
    }
  }

  const stable = {
    version: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    findingGroupId: finding.id,
    originalTrace,
    trace,
    originalLength: originalTrace.length,
    length: trace.length,
    evaluations,
    budget,
    minimality: oneMinimal ? "one-minimal" : exhausted ? "budget-exhausted" : "not-one-minimal",
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}

function replayProjectionEntry(candidate, transitionEvidence) {
  return {
    code: failureCode(candidate),
    trace: candidate?.trace ?? [],
    transitions: transitionEvidence,
  };
}

export async function replayWebExplorationFailureCampaign(driver, failures = []) {
  const reproduced = [];
  const diagnostics = [];
  const checkpointProjection = [];
  for (const candidate of failures) {
    const finding = classifyWebFinding(candidate);
    const replay = await replayCandidate(driver, candidate);
    if (replay.reproduced) {
      reproduced.push(candidate);
      if (candidate?.checkpointReplay) checkpointProjection.push(replayProjectionEntry(candidate, replay.transitionEvidence));
    } else diagnostics.push({
      code: "exploration_failure_not_reproduced",
      failureCode: failureCode(candidate),
      findingGroupId: finding.id,
      trace: candidate?.trace ?? [],
      ...(replay.diagnostic ? { replayDiagnostic: replay.diagnostic } : {}),
    });
  }
  const stable = {
    version: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    reproducedFailureCodes: reproduced.map(failureCode).filter(Boolean).sort(),
    reproducedFindingGroupIds: reproduced.map((failure) => classifyWebFinding(failure).id).sort(),
    diagnostics,
  };
  if (checkpointProjection.length > 0) stable.replayProjectionHash = semanticHash(checkpointProjection);
  return {
    ok: reproduced.length === 0,
    runtime: "web-exploration-replay-campaign",
    failures: reproduced,
    diagnostics,
    ...(checkpointProjection.length > 0 ? { replayProjectionHash: stable.replayProjectionHash } : {}),
    semanticHash: semanticHash(stable),
  };
}

export async function runWebExplorationReplayGate({ driver, exploration, attempts = 3 } = {}) {
  if (!driver) throw new Error("exploration replay gate requires driver");
  if (!exploration || !Array.isArray(exploration.failures)) throw new Error("exploration replay gate requires exploration failures");
  const initialCampaign = {
    ok: exploration.failures.length === 0,
    failures: exploration.failures,
    semanticHash: exploration.semanticHash ?? semanticHash(exploration.failures),
    ...(exploration.replayProjectionHash ? { replayProjectionHash: exploration.replayProjectionHash } : {}),
  };
  return runFailureReplayGate({
    initialCampaign,
    attempts,
    runCampaign: async () => replayWebExplorationFailureCampaign(driver, exploration.failures),
  });
}
