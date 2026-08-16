import assert from "node:assert/strict";

export const WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION = 1;
export const WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME = "real-oss-actionable-finding-campaign-evidence";

export function assertRealOssAcceptancePrivateSafe(value, projectRoot = null) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\b(?:localhost|127\.0\.0\.1|\[::1\]):\d+\b/i);
  assert.doesNotMatch(serialized, /\b(?:password|passwd|token|secret|authorization|cookie|api[-_]?key)=[^<\s]/i);
  if (projectRoot) {
    assert.equal(serialized.includes(projectRoot), false, "absolute project path must not appear in actionable-finding acceptance evidence");
  }
}

function assertExpectedTarget(evidence, acceptance) {
  assert.equal(evidence.schemaVersion, WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION);
  assert.equal(evidence.runtime, WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME);
  assert.equal(typeof evidence.campaignId, "string");
  assert.ok(evidence.campaignId.length > 0);
  assert.equal(evidence.target?.corpus, acceptance.corpus);
  assert.equal(evidence.target?.targetId, acceptance.targetId);
  assert.equal(evidence.target?.repository, acceptance.repository);
  assert.equal(evidence.target?.revision, acceptance.revision);
  assert.equal(evidence.target?.project, acceptance.project);
  assert.equal(evidence.target?.adapterLoc, acceptance.adapterLoc);
  assert.equal(evidence.target?.adapterLoc, 0);
  assert.equal(typeof evidence.target?.corpusSemanticHash, "string");
  assert.ok(evidence.target.corpusSemanticHash.length > 0);
  if (typeof acceptance.corpusSemanticHash === "string") assert.equal(evidence.target.corpusSemanticHash, acceptance.corpusSemanticHash);
}

function assertExpectedCampaign(evidence, acceptance) {
  assert.equal(evidence.execution?.sandboxMode, "strict");
  assert.equal(evidence.execution?.prepareTimeoutMs, 300_000);
  assert.equal(evidence.execution?.offline, false);
  assert.equal(evidence.execution?.campaignRuntime, "unknown-web-project-campaign");
  assert.equal(evidence.execution?.campaignSchemaVersion, 2);
  assert.equal(evidence.execution?.runnerVersion, "2");
  assert.equal(evidence.execution?.sandboxRequested, "strict");
  assert.equal(evidence.execution?.status, "completed");
  assert.equal(evidence.execution?.autoOnboarded, true);
  assert.equal(evidence.execution?.humanInterventions, 0);
  assert.equal(evidence.execution?.deterministicReplay, true);
  assert.equal(typeof evidence.execution?.semanticHash, "string");
  assert.ok(evidence.execution.semanticHash.length > 0);
  assert.equal(evidence.checkout?.initialVerified, true);
  assert.equal(evidence.checkout?.baselineCaptured, true);
  assert.equal(evidence.checkout?.cleanupOk, true);
  assert.equal(evidence.checkout?.finalVerified, true);
  assert.equal(evidence.artifacts?.summaryFindingMatched, true);
  assert.equal(evidence.artifacts?.humanIncidentValidated, true);
  assert.equal(evidence.privacySafe, true);

  const finding = evidence.finding;
  assert.equal(finding?.findingGroupId, acceptance.expectedFindingGroupId);
  assert.equal(finding?.actionable, true);
  assert.equal(finding?.grouping, "strong");
  assert.ok((finding?.memberFailureCodes ?? []).includes(acceptance.expectedFailureCode));
  assert.equal(finding?.provenance?.topProjectFrame?.projectOwned, true);
  assert.equal(finding?.deterministic, true);
  assert.equal(finding?.replayable, true);
  assert.equal(finding?.representativeReplay?.minimality, acceptance.expectedMinimality);
  assert.equal(finding?.representativeReplay?.sameFindingReplay, true);
  assert.equal(finding?.representativeReplay?.deterministic, true);
  assert.ok((finding?.representativeReplay?.shrinkEvaluationCount ?? Number.POSITIVE_INFINITY) <= acceptance.maxShrinkBudget);
  assert.ok((finding?.representativeReplay?.minimizedActionCount ?? 0) > 0);

  const incident = evidence.incident;
  assert.equal(incident?.findingGroupId, acceptance.expectedFindingGroupId);
  assert.equal(incident?.actionable, true);
  assert.equal(incident?.minimalReplay?.minimality, acceptance.expectedMinimality);
  assert.equal(incident?.minimalReplay?.sameFindingReplay, true);
  assert.equal(incident?.minimalReplay?.deterministic, true);
  assert.equal(incident?.minimalReplay?.replayable, true);
  assert.deepEqual(incident?.minimalReplay?.actions, finding?.representativeReplay?.trace);

  assert.match(evidence.humanIncident ?? "", new RegExp(`Incident ${acceptance.expectedFindingGroupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(evidence.humanIncident ?? "", new RegExp(acceptance.expectedFailureCode));
  assert.match(evidence.humanIncident ?? "", /status: actionable/);
  assertRealOssAcceptancePrivateSafe(evidence);
}

export function validateRealOssActionableFindingEvidence(evidence, acceptance) {
  assertExpectedTarget(evidence, acceptance);
  assertExpectedCampaign(evidence, acceptance);
  return evidence;
}

export function compareRealOssActionableFindingEvidence(first, second, acceptance) {
  validateRealOssActionableFindingEvidence(first, acceptance);
  validateRealOssActionableFindingEvidence(second, acceptance);
  assert.notEqual(first.campaignId, second.campaignId, "acceptance evidence must represent two distinct fresh campaigns");
  assert.equal(second.target.corpusSemanticHash, first.target.corpusSemanticHash);
  assert.equal(second.finding.findingGroupId, first.finding.findingGroupId);
  assert.deepEqual(second.finding.representativeReplay.trace, first.finding.representativeReplay.trace);
  assert.deepEqual(second.incident.minimalReplay.actions, first.incident.minimalReplay.actions);
  assert.equal(second.finding.representativeReplay.minimality, "one-minimal");
  return {
    ok: true,
    runtime: "real-oss-actionable-finding-acceptance",
    targetId: first.target.targetId,
    repository: first.target.repository,
    revision: first.target.revision,
    project: first.target.project,
    adapterLoc: first.target.adapterLoc,
    findingGroupId: first.finding.findingGroupId,
    failureCodes: first.finding.memberFailureCodes,
    occurrenceCount: first.finding.occurrenceCount,
    minimality: first.finding.representativeReplay.minimality,
    representativeReplay: first.finding.representativeReplay.trace,
    repeatStable: true,
    privacySafe: true,
    checkoutCleanup: first.checkout.cleanupOk && second.checkout.cleanupOk,
    freshCampaigns: [first.campaignId, second.campaignId],
    timing: {
      campaigns: [first.timing, second.timing],
      parallelizableCriticalMs: Math.max(first.timing?.totalMs ?? 0, second.timing?.totalMs ?? 0),
    },
  };
}
