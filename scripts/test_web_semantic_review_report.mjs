#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildWebSemanticReviewReport, confidenceBand, displayEvidence, formatWebSemanticReview } from "../protocol/web-semantic-review-report.mjs";

assert.equal(confidenceBand(0.95), "high");
assert.equal(confidenceBand(0.75), "medium");
assert.equal(confidenceBand(0.5), "low");
assert.match(displayEvidence({ kind: "source", path: "src/app.ts", line: 12, excerpt: "const x = 1" }).label, /src\/app\.ts:12/);

const properties = { candidates: [{
  id: "undo-redo-inverse", title: "Undo/redo is inverse", status: "review-only", confidence: 0.98,
  evidence: [{ kind: "source", path: "src/editor.ts", line: 4, excerpt: "undo(); redo();" }, { kind: "test-title", title: "undo redo restores state" }],
  automaticActivation: false,
}] };
const projections = { candidates: [{
  id: "selected-entity-identity", title: "Selected entity", status: "review-only", confidence: 0.82,
  evidence: [{ kind: "ui-vocabulary", label: "Selected node" }], automaticActivation: false,
  suggestedHook: { kind: "state-projection", outputShape: { type: "scalar-or-null" }, executableCode: null },
}] };
const normalizers = { candidates: [{
  id: "generated-id:$.semanticDom.attributes.id", explanation: "generated DOM id", status: "review-only", confidence: 0.94,
  semanticRisk: "low", recommendedDecision: "review-replacement", automaticActivation: false,
  evidence: [{ kind: "fresh-run-volatility", path: "$.semanticDom.attributes.id", volatilityKind: "generated-id", observedRuns: 3, distinctValueCount: 3, missingRunCount: 0 }],
  proposedRule: { action: "replace", path: "$.semanticDom.attributes.id", replacement: "<generated-id>" },
}] };
const serverHooks = { candidates: [{
  id: "read-only-api-state-a1b2c3d4", title: "Observe GET /api/state", status: "review-only", confidence: 0.91,
  semanticRisk: "low", recommendedDecision: "approve-only-if-endpoint-is-side-effect-free", automaticActivation: false,
  evidence: [{ kind: "source", path: "src/api.ts", line: 8, excerpt: "fetch('/api/state')" }],
  proposedHook: { hookKind: "readOnly", config: { id: "read-only-api-state-a1b2c3d4", method: "GET", path: "/api/state", expectedStatus: [200], timeoutMs: 5000, maxBytes: 65536 } },
}] };
const report = buildWebSemanticReviewReport({ properties, projections, normalizers, serverHooks });
assert.equal(report.candidateCount, 4);
assert.deepEqual(report.counts, { property: 1, projection: 1, normalizer: 1, serverHook: 1, highConfidence: 3, mediumConfidence: 1, lowConfidence: 0 });
assert.equal(report.automaticActivationCount, 0);
assert.equal(new Set(report.candidates.map((candidate) => candidate.ref)).size, 4);
const text = formatWebSemanticReview(report);
assert.match(text, /HIGH · 0\.98/);
assert.match(text, /evidence:/);
assert.match(text, /src\/editor\.ts:4/);
assert.match(text, /risk=low/);
assert.match(text, /automatic activation: no/);
assert.match(text, /volatility: \$\.semanticDom\.attributes\.id/);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-semantic-review-report-test",
  candidateCount: report.candidateCount,
  counts: report.counts,
  automaticActivationCount: report.automaticActivationCount,
  textIncludesConfidence: /HIGH · 0\.98/.test(text),
  textIncludesEvidence: /evidence:/.test(text),
}));
