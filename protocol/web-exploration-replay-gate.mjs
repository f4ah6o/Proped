import { runFailureReplayGate } from "./web-replay-gate.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_EXPLORATION_REPLAY_GATE_VERSION = "1";

function failureCode(failure) {
  return failure?.code ?? failure?.property ?? failure?.failureClass ?? null;
}

async function replayCandidate(driver, candidate) {
  const trace = candidate?.trace ?? [];
  if (!Array.isArray(trace) || trace.length === 0) return false;
  const code = failureCode(candidate);
  if (!code) return false;
  await driver.reset();
  for (const actionId of trace) {
    const inventory = await driver.actions();
    const action = inventory.actions.find((item) => item.id === actionId);
    if (!action) return false;
    const result = await driver.execute(action);
    if ((result.violations ?? []).some((violation) => failureCode(violation) === code)) return true;
  }
  return false;
}

export async function replayWebExplorationFailureCampaign(driver, failures = []) {
  const reproduced = [];
  const diagnostics = [];
  for (const candidate of failures) {
    const ok = await replayCandidate(driver, candidate);
    if (ok) reproduced.push(candidate);
    else diagnostics.push({
      code: "exploration_failure_not_reproduced",
      failureCode: failureCode(candidate),
      trace: candidate?.trace ?? [],
    });
  }
  const stable = {
    version: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    reproducedFailureCodes: reproduced.map(failureCode).filter(Boolean).sort(),
    diagnostics,
  };
  return {
    ok: reproduced.length === 0,
    runtime: "web-exploration-replay-campaign",
    failures: reproduced,
    diagnostics,
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
  };
  return runFailureReplayGate({
    initialCampaign,
    attempts,
    runCampaign: async () => replayWebExplorationFailureCampaign(driver, exploration.failures),
  });
}
