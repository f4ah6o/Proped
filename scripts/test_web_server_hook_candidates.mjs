#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeWebServerHookCandidates } from "../protocol/web-server-hook-candidates.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-server-hook-candidates-"));
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/client.ts"), `
    fetch('/api/items');
    fetch('/api/health', { method: 'HEAD' });
    fetch('/api/reset', { method: 'POST' });
    fetch('/api/delete', { method: 'POST' });
    fetch(\`/api/items/\${id}\`);
  `);
  fs.writeFileSync(path.join(root, "src/server.ts"), `
    const app = new Hono();
    app.get('/api/items', listItems);
    app.head('/api/health', health);
    app.post('/api/reset', resetFixture);
    app.post('/api/delete', deleteAll);
  `);
  const report = analyzeWebServerHookCandidates(root);
  assert.equal(report.candidateCount, 3);
  assert.equal(report.readOnlyCount, 2);
  assert.equal(report.resetCount, 1);
  assert.equal(report.automaticActivationCount, 0);
  assert.equal(report.candidates.some((candidate) => candidate.proposedHook.config.path === '/api/delete'), false);
  const items = report.candidates.find((candidate) => candidate.proposedHook.config.path === '/api/items');
  assert.equal(items.proposedHook.hookKind, 'readOnly');
  assert.equal(items.confidence, 0.96);
  assert.deepEqual(new Set(items.evidence.map((item) => item.origin)), new Set(['client-fetch', 'server-route']));
  const reset = report.candidates.find((candidate) => candidate.proposedHook.config.path === '/api/reset');
  assert.equal(reset.semanticRisk, 'high');
  assert.equal(reset.proposedHook.hookKind, 'reset');
  console.log(JSON.stringify({ ok: true, runtime: 'web-server-hook-candidates-test', candidateCount: report.candidateCount, readOnlyCount: report.readOnlyCount, resetCount: report.resetCount, automaticActivationCount: report.automaticActivationCount }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
