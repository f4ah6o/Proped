#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mineVolatility } from "../protocol/web-volatility-miner.mjs";
import { analyzeWebNormalizerCandidates } from "../protocol/web-normalizer-candidates.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-normalizer-candidates-"));
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "view.ts"), `
    const generatedId = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    const token = crypto.randomUUID();
  `);
  const samples = [
    {
      semanticDom: { role: "main", attributes: { id: "aaaaaaaaaaaaaaaa" }, children: [{ role: "text", text: "stable" }] },
      storage: { local: { sessionToken: "aaaaaaaaaaaaaaaaaaaa" }, session: {} },
      applicationState: { generated: "aaaaaaaaaaaaaaaaaaaa" },
      metadata: { timestamp: "2026-08-12T00:00:00Z", token: "aaaaaaaaaaaaaaaaaaaa" },
    },
    {
      semanticDom: { role: "main", attributes: { id: "bbbbbbbbbbbbbbbb" }, children: [{ role: "text", text: "stable" }] },
      storage: { local: { sessionToken: "bbbbbbbbbbbbbbbbbbbb" }, session: {} },
      applicationState: { generated: "bbbbbbbbbbbbbbbbbbbb" },
      metadata: { timestamp: "2026-08-12T00:00:01Z", token: "bbbbbbbbbbbbbbbbbbbb" },
    },
    {
      semanticDom: { role: "main", attributes: { id: "cccccccccccccccc" }, children: [{ role: "text", text: "stable" }] },
      storage: { local: { sessionToken: "cccccccccccccccccccc" }, session: {} },
      applicationState: { generated: "cccccccccccccccccccc" },
      metadata: { timestamp: "2026-08-12T00:00:02Z", token: "cccccccccccccccccccc" },
    },
  ];
  const volatility = mineVolatility(samples);
  const report = analyzeWebNormalizerCandidates(root, volatility);
  const byPath = new Map(report.candidates.map((candidate) => [candidate.path, candidate]));
  const domId = byPath.get("$.semanticDom.attributes.id");
  assert.ok(domId);
  assert.equal(domId.semanticRisk, "low");
  assert.equal(domId.recommendedDecision, "review-replacement");
  assert.equal(domId.proposedRule.replacement, "<generated-id>");
  assert.ok(domId.evidenceKinds.includes("source"));
  assert.ok(domId.confidence >= 0.9);

  const timestamp = byPath.get("$.metadata.timestamp");
  assert.ok(timestamp);
  assert.equal(timestamp.semanticRisk, "low");
  assert.equal(timestamp.proposedRule.replacement, "<timestamp>");

  const storageToken = byPath.get('$.storage.local.sessionToken');
  assert.ok(storageToken);
  assert.equal(storageToken.semanticRisk, "high");
  assert.equal(storageToken.proposedRule, null);
  assert.equal(storageToken.recommendedDecision, "review-semantic-state");

  const applicationToken = byPath.get("$.applicationState.generated");
  assert.ok(applicationToken);
  assert.equal(applicationToken.semanticRisk, "high");
  assert.equal(applicationToken.proposedRule, null);

  assert.equal(report.automaticActivationCount, 0);
  assert.equal(report.appliedCount, 0);
  console.log(JSON.stringify({
    ok: true,
    runtime: "web-normalizer-candidates-test",
    candidateCount: report.candidateCount,
    replacementCandidateCount: report.replacementCandidateCount,
    highRiskCount: report.highRiskCount,
    lowRiskExamples: report.candidates.filter((candidate) => candidate.semanticRisk === "low").map((candidate) => candidate.path),
    automaticActivationCount: report.automaticActivationCount,
    appliedCount: report.appliedCount,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
