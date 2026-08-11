#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  compileWebSemanticApprovals,
  createWebSemanticApprovalPlan,
  decideWebSemanticCandidate,
  validateWebSemanticApprovalPlan,
} from "../protocol/web-semantic-approval.mjs";
import { buildWebSemanticReviewReport } from "../protocol/web-semantic-review-report.mjs";

const review = buildWebSemanticReviewReport({
  properties: { candidates: [{ id: "undo-redo-inverse", title: "Undo redo", status: "review-only", confidence: 0.98, evidence: [], automaticActivation: false }] },
  projections: { candidates: [{ id: "selected-entity-identity", title: "Selected", status: "review-only", confidence: 0.82, evidence: [], automaticActivation: false, suggestedHook: { kind: "state-projection", outputShape: { type: "scalar-or-null" }, executableCode: null } }] },
  normalizers: { candidates: [
    { id: "generated-id:$.dom.id", explanation: "generated id", status: "review-only", confidence: 0.94, semanticRisk: "low", recommendedDecision: "review-replacement", evidence: [], automaticActivation: false, proposedRule: { action: "replace", path: "$.dom.id", replacement: "<generated-id>" } },
    { id: "route-volatility:$.url", explanation: "route volatility", status: "review-only", confidence: 0.45, semanticRisk: "high", recommendedDecision: "review-semantic-state", evidence: [], automaticActivation: false, proposedRule: { action: "replace", path: "$.url", replacement: "<route>" } },
    { id: "state-volatility:$.storage.local.key", explanation: "storage volatility", status: "review-only", confidence: 0.35, semanticRisk: "high", recommendedDecision: "review-semantic-state", evidence: [], automaticActivation: false, proposedRule: null },
  ] },
});

let plan = createWebSemanticApprovalPlan(review);
assert.equal(plan.decisions.length, review.candidateCount);
assert.ok(plan.decisions.every((entry) => entry.decision === "pending"));
validateWebSemanticApprovalPlan(review, plan);

plan = decideWebSemanticCandidate(review, plan, { ref: "property:undo-redo-inverse", decision: "approve", note: "matches domain expectation" });
plan = decideWebSemanticCandidate(review, plan, { ref: "projection:selected-entity-identity", decision: "approve" });
plan = decideWebSemanticCandidate(review, plan, { ref: "normalizer:generated-id:$.dom.id", decision: "approve" });
assert.throws(() => decideWebSemanticCandidate(review, plan, { ref: "normalizer:route-volatility:$.url", decision: "approve" }), /requires explicit risk acknowledgement/);
plan = decideWebSemanticCandidate(review, plan, { ref: "normalizer:route-volatility:$.url", decision: "approve", riskAcknowledged: true, note: "route id is generated in this fixture" });
assert.throws(() => decideWebSemanticCandidate(review, plan, { ref: "normalizer:state-volatility:$.storage.local.key", decision: "approve", riskAcknowledged: true }), /no concrete replacement rule/);
plan = decideWebSemanticCandidate(review, plan, { ref: "normalizer:state-volatility:$.storage.local.key", decision: "defer" });

const compiled = compileWebSemanticApprovals(review, plan);
assert.deepEqual(compiled.counts, { approved: 4, rejected: 0, deferred: 1, pending: 0 });
assert.equal(compiled.automaticActivation, false);
assert.equal(compiled.approved.filter((hint) => hint.kind === "normalizer").length, 2);
assert.ok(compiled.approved.every((hint) => hint.approvedByHuman && hint.activation === "human-approved"));
assert.equal(compiled.approved.find((hint) => hint.ref.includes("route-volatility")).riskAcknowledged, true);

const stale = { ...review, semanticHash: "deadbeef" };
assert.throws(() => validateWebSemanticApprovalPlan(stale, plan), /stale/);
const tampered = { ...plan, decisions: plan.decisions.map((entry, index) => index === 0 ? { ...entry, note: "tampered" } : entry) };
assert.throws(() => validateWebSemanticApprovalPlan(review, tampered), /semantic hash mismatch/);

const again = compileWebSemanticApprovals(review, plan);
assert.equal(again.semanticHash, compiled.semanticHash);
console.log(JSON.stringify({
  ok: true,
  runtime: "web-semantic-approval-test",
  reviewCandidates: review.candidateCount,
  counts: compiled.counts,
  highRiskAcknowledgementRequired: true,
  staleReviewRejected: true,
  tamperRejected: true,
  deterministic: again.semanticHash === compiled.semanticHash,
  automaticActivation: compiled.automaticActivation,
}));
