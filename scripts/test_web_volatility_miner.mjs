#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { mineDriverVolatility, mineVolatility } from "../protocol/web-volatility-miner.mjs";

{
  const report = mineVolatility([
    { stable: "same", dom: { attributes: { id: "item-aabbccddeeff0011" } }, storage: { local: { session: "aaa" } }, text: "hello" },
    { stable: "same", dom: { attributes: { id: "item-bbccddeeff001122" } }, storage: { local: { session: "bbb" } }, text: "world" },
    { stable: "same", dom: { attributes: { id: "item-ccddeeff00112233" } }, storage: { local: { session: "ccc" } }, text: "again" },
  ]);
  const id = report.candidates.find((candidate) => candidate.path.endsWith(".attributes.id"));
  const storage = report.candidates.find((candidate) => candidate.path.includes(".storage.local.session"));
  const text = report.candidates.find((candidate) => candidate.path === "$.text");
  assert.equal(id.kind, "generated-id");
  assert.equal(id.candidateSafety, "likely-noise");
  assert.equal(id.applied, false);
  assert.equal(storage.kind, "semantic-state-volatility");
  assert.equal(storage.proposal, null);
  assert.equal(text.kind, "content-volatility");
  assert.equal(report.appliedCount, 0);
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end(`<!doctype html><main><div id="widget-${crypto.randomUUID()}">Stable UI</div><output id="random">${crypto.randomUUID()}</output></main><script>localStorage.setItem('session-token', crypto.randomUUID())</script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const driver = new GenericPlaywrightBrowserDriver({ url: `http://127.0.0.1:${server.address().port}/`, timeoutMs: 2_000 });
try {
  const report = await mineDriverVolatility(driver, { runs: 3 });
  assert.equal(report.runs, 3);
  assert.equal(report.appliedCount, 0);
  assert.ok(report.candidates.some((candidate) => candidate.kind === "generated-id" && candidate.candidateSafety === "likely-noise"));
  assert.ok(report.candidates.some((candidate) => candidate.kind === "generated-token" || candidate.kind === "content-volatility"));
  const storage = report.candidates.find((candidate) => candidate.path.includes("storage.local.session-token"));
  assert.ok(storage);
  assert.equal(storage.candidateSafety, "review-required");
  assert.equal(storage.proposal, null);
  assert.equal(JSON.stringify(report).includes("session-token"), true); // path is visible
  assert.equal(JSON.stringify(report).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i), null); // raw values are not emitted

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-volatility-miner-test",
    candidateCount: report.candidateCount,
    likelyNoiseCount: report.likelyNoiseCount,
    reviewRequiredCount: report.reviewRequiredCount,
    appliedCount: report.appliedCount,
    kinds: [...new Set(report.candidates.map((candidate) => candidate.kind))].sort(),
  }));
} finally {
  await driver.dispose();
  await new Promise((resolve) => server.close(resolve));
}
