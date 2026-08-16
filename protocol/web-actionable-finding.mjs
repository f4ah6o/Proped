import {
  WEB_FINDING_GROUP_VERSION,
  classifyWebFinding,
  groupWebFindings,
  selectWebFindingRepresentativeFailure,
} from "./web-finding-group.mjs";
import {
  WEB_EXPLORATION_REPLAY_GATE_VERSION,
  shrinkWebExplorationFailureTrace,
} from "./web-exploration-replay-gate.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";
import { classifyWebFailure } from "./web-failure-classifier.mjs";

export const WEB_ACTIONABLE_FINDING_VERSION = "1";
export const DEFAULT_WEB_FINDING_SHRINK_BUDGET = 32;

function stableFailureClassIds(replayGate) {
  return new Set(Array.isArray(replayGate?.stableFailureClassIds) ? replayGate.stableFailureClassIds : []);
}


function qualificationReasons({ group, deterministic, replayable, shrink }) {
  const reasons = [];
  if (group.grouping !== "strong") reasons.push("weak-provenance-singleton");
  if (!deterministic) reasons.push("not-deterministic");
  if (!replayable) reasons.push("same-finding-replay-not-stable");
  if (!shrink) reasons.push("minimal-replay-unavailable");
  else if (shrink.minimality !== "one-minimal") reasons.push(shrink.minimality);
  return reasons;
}

function safeFindingSummary(finding) {
  const codes = finding.memberFailureCodes.join(", ") || "unknown failure";
  const replay = finding.representativeReplay;
  const replayText = replay
    ? `${replay.minimizedActionCount} action${replay.minimizedActionCount === 1 ? "" : "s"}, ${replay.minimality}`
    : "minimal replay unavailable";
  return `${codes}: ${finding.findingGroupId} (${finding.grouping}, ${finding.occurrenceCount} occurrence${finding.occurrenceCount === 1 ? "" : "s"}, ${replayText})`;
}

export async function analyzeWebActionableFindings({
  driver,
  exploration,
  explorationReplayGate,
  shrinkBudget = DEFAULT_WEB_FINDING_SHRINK_BUDGET,
} = {}) {
  if (!driver) throw new Error("actionable finding analysis requires driver");
  if (!exploration || !Array.isArray(exploration.failures)) throw new Error("actionable finding analysis requires exploration failures");
  if (!explorationReplayGate || typeof explorationReplayGate !== "object") throw new Error("actionable finding analysis requires exploration replay gate");
  if (!Number.isSafeInteger(shrinkBudget) || shrinkBudget < 1) throw new Error("actionable finding shrink budget must be a positive safe integer");

  const eligibleFailures = exploration.failures.filter((failure) => classifyWebFailure(failure).oracleFamily === "browser-safety");
  const grouped = groupWebFindings(eligibleFailures);
  const stableIds = stableFailureClassIds(explorationReplayGate);
  const findings = [];

  for (const group of grouped.groups) {
    const members = eligibleFailures.filter((failure) => classifyWebFinding(failure).id === group.id);
    const deterministic = group.canonicalFailureClassIds.length > 0
      && group.canonicalFailureClassIds.every((id) => stableIds.has(id));
    const replayable = deterministic;
    const representativeFailure = selectWebFindingRepresentativeFailure(members);
    let shrink = null;
    if (group.grouping === "strong" && replayable && Array.isArray(representativeFailure?.trace) && representativeFailure.trace.length > 0) {
      shrink = await shrinkWebExplorationFailureTrace(driver, representativeFailure, { budget: shrinkBudget });
    }
    const qualification = qualificationReasons({ group, deterministic, replayable, shrink });
    const representativeReplay = shrink ? {
      trace: [...shrink.trace],
      originalActionCount: shrink.originalLength,
      minimizedActionCount: shrink.length,
      minimality: shrink.minimality,
      shrinkEvaluationCount: shrink.evaluations,
      shrinkBudget: shrink.budget,
      sameFindingReplay: true,
      deterministic,
      replayGateVersion: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    } : null;
    const finding = {
      findingGroupId: group.id,
      groupingVersion: WEB_FINDING_GROUP_VERSION,
      grouping: group.grouping,
      strong: group.grouping === "strong",
      singleton: group.grouping === "singleton",
      memberFailureClassIds: [...group.canonicalFailureClassIds],
      memberFailureCodes: [...group.failureCodes],
      occurrenceCount: group.count,
      provenance: group.provenance,
      provenanceRejectionReasons: [...(group.provenanceRejectionReasons ?? [])],
      representativeReplay,
      deterministic,
      replayable,
      actionable: qualification.length === 0,
      qualificationReasons: qualification,
    };
    finding.summary = safeFindingSummary(finding);
    finding.semanticHash = semanticHash({
      findingGroupId: finding.findingGroupId,
      groupingVersion: finding.groupingVersion,
      grouping: finding.grouping,
      memberFailureClassIds: finding.memberFailureClassIds,
      memberFailureCodes: finding.memberFailureCodes,
      occurrenceCount: finding.occurrenceCount,
      provenance: finding.provenance,
      provenanceRejectionReasons: finding.provenanceRejectionReasons,
      representativeReplay: finding.representativeReplay,
      deterministic: finding.deterministic,
      replayable: finding.replayable,
      actionable: finding.actionable,
      qualificationReasons: finding.qualificationReasons,
    });
    findings.push(finding);
  }

  findings.sort((left, right) => left.findingGroupId.localeCompare(right.findingGroupId));
  const deterministicFindings = findings.filter((finding) => finding.deterministic);
  const actionable = findings.filter((finding) => finding.actionable);
  const replayable = findings.filter((finding) => finding.replayable);
  const oneMinimal = findings.filter((finding) => finding.representativeReplay?.minimality === "one-minimal");
  const privacyRejections = {};
  for (const finding of findings) {
    for (const reason of finding.provenanceRejectionReasons) privacyRejections[reason] = (privacyRejections[reason] ?? 0) + 1;
  }
  const metrics = {
    deterministicFindingGroups: deterministicFindings.length,
    replayableFindingGroups: replayable.length,
    actionableFindingGroups: actionable.length,
    actionableFindingRate: deterministicFindings.length > 0 ? actionable.length / deterministicFindings.length : null,
    oneMinimalFindingGroups: oneMinimal.length,
    oneMinimalRateAmongReplayable: replayable.length > 0 ? oneMinimal.length / replayable.length : null,
    strongFindingGroups: findings.filter((finding) => finding.strong).length,
    singletonFindingGroups: findings.filter((finding) => finding.singleton).length,
    representativeActionsBefore: findings.reduce((total, finding) => total + (finding.representativeReplay?.originalActionCount ?? 0), 0),
    representativeActionsAfter: findings.reduce((total, finding) => total + (finding.representativeReplay?.minimizedActionCount ?? 0), 0),
    privacyProvenanceRejections: Object.fromEntries(Object.entries(privacyRejections).sort(([left], [right]) => left.localeCompare(right))),
  };
  const stable = {
    version: WEB_ACTIONABLE_FINDING_VERSION,
    groupingVersion: WEB_FINDING_GROUP_VERSION,
    replayGateVersion: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    shrinkBudget,
    eligibleFindingGroupCount: findings.length,
    metrics,
    findings,
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}
