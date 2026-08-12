#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { runGenericPropertyPacks } from "../protocol/web-generic-property-packs.mjs";
import { runFailureReplayGate } from "../protocol/web-replay-gate.mjs";

const dogfoodEvidence = JSON.parse(readFileSync(new URL("../protocol/fixtures/blind-stateful-server-dogfood.json", import.meta.url), "utf8"));
assert.equal(dogfoodEvidence.schemaVersion, 1);
assert.deepEqual(dogfoodEvidence.genericAcceptance.crudFamilies, ["create", "read", "update", "delete"]);
assert.equal(dogfoodEvidence.genericAcceptance.serverProjectionRequired, true);
assert.equal(dogfoodEvidence.safety.domainUnverifiedSilentPass, false);
assert.ok(dogfoodEvidence.realTargets.some((target) => target.id === "osc2026" && target.projectAdapterLoc === 0));
assert.ok(dogfoodEvidence.realTargets.some((target) => target.id === "taskflow" && target.verdict === "target-runtime-incompatible"));

let items = [{ id: 1, name: "seed" }];
let updateSequence = 0;

function page() {
  return `<!doctype html><main>
    <h1>Stateful fixture</h1>
    <p>Items ${items.length}</p>
    <p>Names ${items.map((item) => item.name).join(",")}</p>
    <button id="create">Create item</button>
    <button id="view">View item</button>
    <button id="save">Save item</button>
    <button id="delete">Delete item</button>
    <button id="login">Login</button>
    <form id="invalid-operation" aria-label="Invalid operation"><label>Task id <input type="number" aria-label="Task id"></label><button type="submit">Validate</button></form>
    <label>Backend service address <input aria-label="Backend service address"></label>
    <button id="archive">归档记录</button>
    <button id="sync">同步到外部</button>
    <button id="approve">批准报名</button>
    <output id="detail"></output>
  </main><script>
    const mutate = (method) => fetch('/api/items', { method }).then(() => location.reload());
    document.querySelector('#create').addEventListener('click', () => mutate('POST'));
    document.querySelector('#save').addEventListener('click', () => mutate('PUT'));
    document.querySelector('#delete').addEventListener('click', () => mutate('DELETE'));
    document.querySelector('#view').addEventListener('click', () => { document.querySelector('#detail').textContent = 'viewed'; });
    document.querySelector('#login').addEventListener('click', () => { document.querySelector('#detail').textContent = 'anonymous-session-boundary'; });
    document.querySelector('#invalid-operation').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('#detail').textContent = 'invalid-operation-rejected'; });
  </script>`;
}

const server = http.createServer((request, response) => {
  if (request.url === "/api/items") {
    if (request.method === "POST") items.push({ id: items.length + 1, name: `created-${items.length + 1}` });
    else if (request.method === "PUT" && items.length > 0) items[0].name = `updated-${++updateSequence}`;
    else if (request.method === "DELETE" && items.length > 0) items.pop();
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(page());
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const driver = new GenericPlaywrightBrowserDriver({
  url: `${origin}/`,
  timeoutMs: 3_000,
  restartServer: async () => ({ url: `${origin}/` }),
  readOnlyStateProbe: async () => ({ items: items.map((item) => ({ ...item })) }),
});

async function runCampaign() {
  return runGenericPropertyPacks(driver, {
    packs: ["stateful-server"],
    allowBoundedMutations: true,
    maxProbes: 12,
  });
}

try {
  await driver.reset();
  const corpusInventory = await driver.actions();
  assert.ok(corpusInventory.actions.some((action) => action.kind === "type" && action.target.name === "Backend service address" && action.input === origin));
  assert.equal(corpusInventory.actions.find((action) => action.kind === "click" && action.target.name === "归档记录")?.destructiveRisk, "bounded-mutation");
  assert.equal(corpusInventory.actions.find((action) => action.kind === "click" && action.target.name === "同步到外部")?.destructiveRisk, "destructive");
  assert.equal(corpusInventory.actions.find((action) => action.kind === "click" && action.target.name === "批准报名")?.destructiveRisk, "destructive");
  const report = await runCampaign();
  const stateful = report.results.find((result) => result.id === "stateful-server");
  assert.equal(report.ok, true);
  assert.equal(stateful.coverage.status, "generic-covered");
  assert.deepEqual(stateful.coverage.mutationFamilies, ["create", "delete", "read", "update"]);
  assert.deepEqual(stateful.coverage.missingFamilies, []);
  assert.equal(stateful.coverage.serverProjectionObserved, true);
  assert.equal(stateful.coverage.reloadPersistenceObserved, true);
  assert.equal(stateful.coverage.restartPersistenceObserved, true);
  assert.equal(stateful.coverage.sessionBoundaryObserved, true);
  assert.notEqual(stateful.coverage.invalidOperationStatus, "not-observed");
  assert.notEqual(stateful.coverage.invalidOperationStatus, "browser-failure");
  assert.equal(stateful.advisories.some((item) => item.code === "stateful_campaign_incomplete"), false);
  const replay = await runFailureReplayGate({ initialCampaign: report, attempts: 3, runCampaign });
  assert.equal(replay.deterministic, true);
  assert.equal(replay.replayProjectionDeterministic, true);
  console.log(JSON.stringify({
    ok: true,
    runtime: "web-stateful-server-pack-test",
    coverage: stateful.coverage,
    probes: stateful.probes,
    replay: { attempts: replay.attempts, deterministic: replay.deterministic, replayProjectionDeterministic: replay.replayProjectionDeterministic },
  }));
} finally {
  await driver.dispose();
  await new Promise((resolve) => server.close(resolve));
}
