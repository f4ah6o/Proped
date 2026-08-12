#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  compileWebSemanticApprovals,
  createWebSemanticApprovalPlan,
  decideWebSemanticCandidate,
  validateWebSemanticApprovalPlan,
} from "../protocol/web-semantic-approval.mjs";
import { buildWebSemanticReviewReport } from "../protocol/web-semantic-review-report.mjs";
import { createPropertyHintContract, createProjectionHintContract } from "../protocol/web-domain-hint-contract.mjs";

const review = buildWebSemanticReviewReport({
  properties: { candidates: [{ id: "undo-redo-inverse", title: "Undo redo", status: "review-only", confidence: 0.98, evidence: [], automaticActivation: false, suggestedPredicate: createPropertyHintContract({ inputKind: "semantic-transition", inputId: "undo-redo-inverse", predicateOp: "domain-invariant", predicateId: "undo-redo-inverse" }) }] },
  projections: { candidates: [{ id: "selected-entity-identity", title: "Selected", status: "review-only", confidence: 0.82, evidence: [], automaticActivation: false, suggestedHook: { kind: "state-projection", outputShape: { type: "scalar-or-null" }, executableCode: null, contract: createProjectionHintContract({ selector: "selected-entity-identity" }) } }] },
  normalizers: { candidates: [
    { id: "generated-id:$.dom.id", explanation: "generated id", status: "review-only", confidence: 0.94, semanticRisk: "low", recommendedDecision: "review-replacement", evidence: [], automaticActivation: false, proposedRule: { action: "replace", path: "$.dom.id", replacement: "<generated-id>" } },
    { id: "route-volatility:$.url", explanation: "route volatility", status: "review-only", confidence: 0.45, semanticRisk: "high", recommendedDecision: "review-semantic-state", evidence: [], automaticActivation: false, proposedRule: { action: "replace", path: "$.url", replacement: "<route>" } },
    { id: "state-volatility:$.storage.local.key", explanation: "storage volatility", status: "review-only", confidence: 0.35, semanticRisk: "high", recommendedDecision: "review-semantic-state", evidence: [], automaticActivation: false, proposedRule: null },
  ] },
  serverHooks: { candidates: [
    { id: "read-only-api-state-a1b2c3d4", title: "Observe API state", status: "review-only", confidence: 0.91, semanticRisk: "low", evidence: [], automaticActivation: false, proposedHook: { hookKind: "readOnly", config: { id: "read-only-api-state-a1b2c3d4", method: "GET", path: "/api/state", expectedStatus: [200], timeoutMs: 5000, maxBytes: 65536 } } },
    { id: "reset-api-reset-b1c2d3e4", title: "Reset API fixture", status: "review-only", confidence: 0.85, semanticRisk: "high", evidence: [], automaticActivation: false, proposedHook: { hookKind: "reset", config: { method: "POST", path: "/api/reset", expectedStatus: [200, 204], timeoutMs: 5000 } } },
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
plan = decideWebSemanticCandidate(review, plan, { ref: "server-hook:read-only-api-state-a1b2c3d4", decision: "approve" });
assert.throws(() => decideWebSemanticCandidate(review, plan, { ref: "server-hook:reset-api-reset-b1c2d3e4", decision: "approve" }), /requires explicit risk acknowledgement/);
plan = decideWebSemanticCandidate(review, plan, { ref: "server-hook:reset-api-reset-b1c2d3e4", decision: "approve", riskAcknowledged: true, note: "dedicated test reset endpoint" });

const compiled = compileWebSemanticApprovals(review, plan);
assert.deepEqual(compiled.counts, { approved: 6, rejected: 0, deferred: 1, pending: 0 });
assert.equal(compiled.automaticActivation, false);
assert.equal(compiled.approved.filter((hint) => hint.kind === "normalizer").length, 2);
assert.equal(compiled.approved.filter((hint) => hint.kind === "server-hook").length, 2);
assert.equal(compiled.approved.find((hint) => hint.kind === "property").contract.version, "1");
assert.equal(compiled.approved.find((hint) => hint.kind === "projection").contract.version, "1");
assert.ok(compiled.approved.every((hint) => hint.approvedByHuman && hint.activation === "human-approved"));
assert.equal(compiled.approved.find((hint) => hint.ref.includes("route-volatility")).riskAcknowledged, true);
assert.equal(compiled.approved.find((hint) => hint.ref.includes("reset-api-reset")).riskAcknowledged, true);

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
