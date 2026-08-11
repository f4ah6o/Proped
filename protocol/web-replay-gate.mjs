import { classifyWebFailure } from "./web-failure-classifier.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_REPLAY_GATE_VERSION = "1";

function classEntries(campaign) {
  const entries = new Map();
  for (const failure of campaign?.failures ?? []) {
    const classification = classifyWebFailure(failure);
    if (!entries.has(classification.id)) entries.set(classification.id, { failure, classification });
  }
  return entries;
}

export function evaluateFailureReplayCampaigns(campaigns) {
  if (!Array.isArray(campaigns) || campaigns.length === 0) throw new Error("replay gate requires at least one campaign");
  const runs = campaigns.map((campaign, index) => {
    const entries = classEntries(campaign);
    return {
      attempt: index + 1,
      failureCount: campaign?.failures?.length ?? 0,
      canonicalFailureClassIds: [...entries.keys()].sort(),
      campaignSemanticHash: campaign?.semanticHash ?? null,
    };
  });
  const allIds = [...new Set(runs.flatMap((run) => run.canonicalFailureClassIds))].sort();
  const stableIds = allIds.filter((id) => runs.every((run) => run.canonicalFailureClassIds.includes(id)));
  const unstableIds = allIds.filter((id) => !stableIds.includes(id));
  const firstEntries = classEntries(campaigns[0]);
  const stableFailures = stableIds
    .map((id) => firstEntries.get(id)?.failure ?? campaigns.map(classEntries).map((entries) => entries.get(id)?.failure).find(Boolean))
    .filter(Boolean);
  const unstableCandidates = unstableIds.map((id) => ({
    canonicalFailureClassId: id,
    occurrenceCount: runs.filter((run) => run.canonicalFailureClassIds.includes(id)).length,
    requiredCount: campaigns.length,
    severity: "diagnostic",
    code: "nondeterministic_failure_candidate",
  }));
  const report = {
    ok: stableFailures.length === 0,
    runtime: "web-failure-replay-gate",
    version: WEB_REPLAY_GATE_VERSION,
    attempts: campaigns.length,
    deterministic: unstableIds.length === 0,
    stableFailureCount: stableFailures.length,
    stableFailureClassIds: stableIds,
    unstableFailureClassIds: unstableIds,
    stableFailures,
    unstableCandidates,
    runs,
  };
  report.semanticHash = semanticHash({
    version: report.version,
    attempts: report.attempts,
    deterministic: report.deterministic,
    stableFailureClassIds: report.stableFailureClassIds,
    unstableFailureClassIds: report.unstableFailureClassIds,
    runs: report.runs.map(({ attempt, canonicalFailureClassIds }) => ({ attempt, canonicalFailureClassIds })),
  });
  return report;
}

export async function runFailureReplayGate({ initialCampaign, attempts = 3, runCampaign } = {}) {
  if (!initialCampaign) throw new Error("replay gate requires initialCampaign");
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("replay gate attempts must be a positive safe integer");
  if (attempts > 1 && typeof runCampaign !== "function") throw new Error("replay gate requires runCampaign when attempts > 1");
  const campaigns = [initialCampaign];
  for (let attempt = 1; attempt < attempts; attempt += 1) campaigns.push(await runCampaign(attempt + 1));
  return evaluateFailureReplayCampaigns(campaigns);
}
