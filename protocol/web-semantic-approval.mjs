import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SEMANTIC_APPROVAL_VERSION = "1";
export const WEB_SEMANTIC_APPROVAL_DECISIONS = Object.freeze(["pending", "approve", "reject", "defer"]);

function fail(message) { throw new Error(`web semantic approval: ${message}`); }

function validateReview(review) {
  if (!review?.ok || review.runtime !== "web-semantic-review-report" || typeof review.semanticHash !== "string") fail("review report is invalid");
  if (!Array.isArray(review.candidates)) fail("review candidates must be an array");
  const refs = review.candidates.map((candidate) => candidate.ref);
  if (refs.some((ref) => typeof ref !== "string" || !ref.includes(":"))) fail("review candidate refs are invalid");
  if (new Set(refs).size !== refs.length) fail("review candidate refs must be unique");
  return review;
}

function candidateMap(review) {
  return new Map(review.candidates.map((candidate) => [candidate.ref, candidate]));
}

function stableDecision(entry) {
  return {
    ref: entry.ref,
    decision: entry.decision,
    riskAcknowledged: Boolean(entry.riskAcknowledged),
    note: entry.note ?? null,
    revision: entry.revision,
  };
}

function finalizePlan(plan) {
  const stable = {
    version: plan.version,
    reviewSemanticHash: plan.reviewSemanticHash,
    decisions: plan.decisions.map(stableDecision),
  };
  return { ...plan, semanticHash: semanticHash(stable) };
}

export function createWebSemanticApprovalPlan(review) {
  validateReview(review);
  return finalizePlan({
    ok: true,
    runtime: "web-semantic-approval-plan",
    version: WEB_SEMANTIC_APPROVAL_VERSION,
    reviewSemanticHash: review.semanticHash,
    decisions: review.candidates.map((candidate) => ({
      ref: candidate.ref,
      decision: "pending",
      riskAcknowledged: false,
      note: null,
      revision: 0,
    })),
  });
}

export function validateWebSemanticApprovalPlan(review, plan) {
  validateReview(review);
  if (!plan || plan.runtime !== "web-semantic-approval-plan" || plan.version !== WEB_SEMANTIC_APPROVAL_VERSION) fail("approval plan is invalid");
  if (plan.reviewSemanticHash !== review.semanticHash) fail("approval plan is stale for this review report");
  if (!Array.isArray(plan.decisions)) fail("approval plan decisions must be an array");
  const reviewRefs = new Set(review.candidates.map((candidate) => candidate.ref));
  const decisionRefs = new Set();
  for (const entry of plan.decisions) {
    if (!reviewRefs.has(entry.ref)) fail(`approval plan references unknown candidate ${entry.ref}`);
    if (decisionRefs.has(entry.ref)) fail(`approval plan duplicates candidate ${entry.ref}`);
    decisionRefs.add(entry.ref);
    if (!WEB_SEMANTIC_APPROVAL_DECISIONS.includes(entry.decision)) fail(`invalid decision for ${entry.ref}`);
    if (typeof entry.riskAcknowledged !== "boolean") fail(`riskAcknowledged must be boolean for ${entry.ref}`);
    if (entry.note !== null && (typeof entry.note !== "string" || entry.note.length > 1000)) fail(`note is invalid for ${entry.ref}`);
    if (!Number.isSafeInteger(entry.revision) || entry.revision < 0) fail(`revision is invalid for ${entry.ref}`);
  }
  if (decisionRefs.size !== reviewRefs.size) fail("approval plan must include every review candidate");
  const expected = finalizePlan({ ...plan, semanticHash: undefined }).semanticHash;
  if (plan.semanticHash !== expected) fail("approval plan semantic hash mismatch");
  return plan;
}

export function decideWebSemanticCandidate(review, plan, { ref, decision, riskAcknowledged = false, note = null } = {}) {
  validateWebSemanticApprovalPlan(review, plan);
  if (!["approve", "reject", "defer"].includes(decision)) fail("decision must be approve, reject, or defer");
  const candidates = candidateMap(review);
  const candidate = candidates.get(ref);
  if (!candidate) fail(`unknown candidate ${ref}`);
  if (decision === "approve" && candidate.semanticRisk === "high" && !riskAcknowledged) {
    fail(`high-risk candidate ${ref} requires explicit risk acknowledgement`);
  }
  if (decision === "approve" && candidate.kind === "normalizer" && !candidate.proposedChange) {
    fail(`normalizer candidate ${ref} has no concrete replacement rule to approve`);
  }
  if (note !== null && (typeof note !== "string" || note.length > 1000)) fail("note must be null or at most 1000 characters");
  const decisions = plan.decisions.map((entry) => entry.ref === ref ? {
    ...entry,
    decision,
    riskAcknowledged: Boolean(riskAcknowledged),
    note,
    revision: entry.revision + 1,
  } : { ...entry });
  return finalizePlan({ ...plan, decisions });
}

function approvedHint(candidate, decision) {
  const base = {
    ref: candidate.ref,
    id: candidate.id,
    confidence: candidate.confidence,
    confidenceBand: candidate.confidenceBand,
    approvedByHuman: true,
    riskAcknowledged: decision.riskAcknowledged,
    note: decision.note,
    activation: "human-approved",
  };
  if (candidate.kind === "property") return { ...base, kind: "property" };
  if (candidate.kind === "projection") return { ...base, kind: "projection", projection: candidate.proposedChange };
  if (candidate.kind === "normalizer") return { ...base, kind: "normalizer", normalizer: candidate.proposedChange };
  fail(`unsupported candidate kind ${candidate.kind}`);
}

export function compileWebSemanticApprovals(review, plan) {
  validateWebSemanticApprovalPlan(review, plan);
  const candidates = candidateMap(review);
  const approved = [];
  const rejected = [];
  const deferred = [];
  const pending = [];
  for (const decision of plan.decisions) {
    if (decision.decision === "approve") approved.push(approvedHint(candidates.get(decision.ref), decision));
    else if (decision.decision === "reject") rejected.push(decision.ref);
    else if (decision.decision === "defer") deferred.push(decision.ref);
    else pending.push(decision.ref);
  }
  const stable = { reviewSemanticHash: review.semanticHash, approved, rejected, deferred, pending };
  return {
    ok: true,
    runtime: "web-semantic-approved-hints",
    version: WEB_SEMANTIC_APPROVAL_VERSION,
    reviewSemanticHash: review.semanticHash,
    approvalPlanSemanticHash: plan.semanticHash,
    counts: { approved: approved.length, rejected: rejected.length, deferred: deferred.length, pending: pending.length },
    approved,
    rejected,
    deferred,
    pending,
    automaticActivation: false,
    semanticHash: semanticHash(stable),
  };
}
