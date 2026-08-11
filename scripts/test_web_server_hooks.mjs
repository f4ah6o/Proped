#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { createWebServerHookClient, validateWebServerHooks } from "../protocol/web-server-hooks.mjs";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";

let generation = 7;
let resetCount = 0;
const server = http.createServer((request, response) => {
  if (request.url === "/" && request.method === "GET") { response.writeHead(200, { "content-type": "text/html" }); response.end("<!doctype html><main><button>Ready</button></main>"); return; }
  if (request.url === "/__test/reset" && request.method === "POST") {
    generation = 0; resetCount += 1; response.writeHead(204); response.end(); return;
  }
  if (request.url === "/api/state" && request.method === "GET") {
    const body = JSON.stringify({ generation, items: [{ id: 1, label: "secret-ish-value" }] });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }); response.end(body); return;
  }
  if (request.url === "/health" && request.method === "HEAD") { response.writeHead(200); response.end(); return; }
  if (request.url === "/redirect") { response.writeHead(302, { location: "https://example.com/" }); response.end(); return; }
  response.writeHead(404); response.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const config = {
  reset: { method: "POST", path: "/__test/reset", expectedStatus: [204], timeoutMs: 1000 },
  readOnly: [
    { id: "state", method: "GET", path: "/api/state", expectedStatus: [200], timeoutMs: 1000, maxBytes: 4096 },
    { id: "health", method: "HEAD", path: "/health", expectedStatus: [200], timeoutMs: 1000, maxBytes: 1 },
  ],
};
try {
  assert.deepEqual(validateWebServerHooks(config).readOnly.map((hook) => hook.id), ["state", "health"]);
  assert.throws(() => validateWebServerHooks({ reset: null, readOnly: [{ id: "x", method: "POST", path: "/x", expectedStatus: [200], timeoutMs: 1, maxBytes: 1 }] }), /GET or HEAD/);
  assert.throws(() => validateWebServerHooks({ reset: { method: "POST", path: "https://evil.example/x", expectedStatus: [204], timeoutMs: 1 }, readOnly: [] }), /same-origin/);
  const client = createWebServerHookClient(baseUrl, config);
  const before = await client.readOnlyState();
  assert.equal(before.hooks[0].shape.fields.generation, "number");
  assert.equal(before.hooks[0].shape.fields.items.type, "array");
  assert.equal("body" in before.hooks[0], false);
  const reset = await client.reset();
  assert.equal(reset.status, 204);
  assert.equal(resetCount, 1);
  const after = await client.readOnlyState();
  assert.notEqual(before.hooks[0].bodyHash, after.hooks[0].bodyHash);
  assert.equal(before.hooks[1].bodyHash, null);

  const redirectClient = createWebServerHookClient(baseUrl, { reset: null, readOnly: [{ id: "redirect", method: "GET", path: "/redirect", expectedStatus: [302], timeoutMs: 1000, maxBytes: 100 }] });
  await assert.rejects(() => redirectClient.readOnlyState(), /redirect denied/);

  const browserClient = createWebServerHookClient(baseUrl, config);
  const driver = new GenericPlaywrightBrowserDriver({
    url: `${baseUrl}/`,
    timeoutMs: 2000,
    beforeReset: async () => { await browserClient.reset(); },
    readOnlyStateProbe: async () => browserClient.readOnlyState(),
  });
  try {
    const firstSnapshot = await driver.reset();
    assert.ok(firstSnapshot.applicationState.serverHooks.hooks.some((hook) => hook.id === "state"));
    const afterFirstReset = resetCount;
    await driver.reset();
    assert.equal(resetCount, afterFirstReset + 1);
  } finally {
    await driver.dispose();
  }

  console.log(JSON.stringify({ ok: true, runtime: "web-server-hooks-test", resetCount, readOnlyHookCount: after.hooks.length, bodyCaptured: false, redirectDenied: true, browserIntegrated: true }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
