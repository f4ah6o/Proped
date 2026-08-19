#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenericPlaywrightBrowserDriver } from "./generic-browser-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const HTML = `<!doctype html><html><body>
<main>
  <h1>Generic inventory</h1>
  <form aria-label="Todo" id="todo-form">
    <input placeholder="What needs to be done?" id="new-todo">
    <button type="submit">Add</button>
  </form>
  <label><input type="checkbox" id="show-done"> Show done</label>
  <label for="sort">Sort</label>
  <select id="sort"><option>Newest</option><option>Oldest</option></select>
  <a href="/about">About</a>
  <button data-testid="write-storage" title="Write storage">◼</button>
  <button id="delayed-update">Delayed update</button>
  <output id="delayed-status">idle</output>
  <ul id="todos"></ul>
</main>
<script>
let next = 1;
const form = document.querySelector('#todo-form');
const input = document.querySelector('#new-todo');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  const li = document.createElement('li');
  li.textContent = value;
  li.dataset.id = String(next++);
  document.querySelector('#todos').append(li);
  localStorage.setItem('todos', JSON.stringify([...document.querySelectorAll('#todos li')].map((node) => node.textContent)));
  input.value = '';
});
document.querySelector('[data-testid=write-storage]').addEventListener('click', () => localStorage.setItem('mode', 'generic'));
document.querySelector('#delayed-update').addEventListener('click', async () => {
  document.querySelector('#delayed-status').textContent = 'loading';
  const response = await fetch('/slow');
  document.querySelector('#delayed-status').textContent = await response.text();
});
</script>
</body></html>`;

async function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/slow") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
        response.end("done");
      }, 80);
      return;
    }
    if (request.url === "/churn") {
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      response.end(`<!doctype html><main><h1 id="tick">0</h1></main><script>let n=0;const tick=()=>{document.querySelector('#tick').textContent=String(++n);requestAnimationFrame(tick)};requestAnimationFrame(tick)</script>`);
      return;
    }
    if (request.url === "/about") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><main><h1>About</h1><a href='/'>Home</a></main>");
      return;
    }
    if (request.url === "/ambiguous") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><main><button>Delete</button><button>Delete</button></main>");
      return;
    }
    if (request.url === "/href-fallback") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><main>
        <a href="/target"><span>Visible</span><span aria-hidden="true">Hidden</span></a>
        <a href="/same"><span>Same</span><span aria-hidden="true">One</span></a>
        <a href="/same"><span>Same</span><span aria-hidden="true">Two</span></a>
      </main>`);
      return;
    }
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end(HTML);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function targetSet(inventory) {
  return new Set(inventory.actions.map((action) => `${action.target.role}:${action.target.name}`));
}

const server = await startServer();
const driver = new GenericPlaywrightBrowserDriver({ url: server.url, timeoutMs: 4_000, inputCorpus: ["alpha"] });
try {
  const initial = await driver.reset();
  assert.equal(initial.browser.networkPolicy, "same-origin-only");
  assert.equal(initial.browser.managedRuntime.provider, "proped");
  assert.equal(initial.browser.managedRuntime.playwrightVersion, "1.62.0");
  assert.equal(initial.browser.managedRuntime.chromiumRevision, "1234");
  assert.equal(initial.browser.managedRuntime.targetProjectDependencyRequired, false);
  assert.deepEqual(initial.storage, { local: {}, session: {} });

  const inventory = await driver.actions();
  const targets = targetSet(inventory);
  const expectedTargets = [
    "textbox:What needs to be done?",
    "button:Add",
    "checkbox:Show done",
    "combobox:Sort",
    "link:About",
    "button:Write storage",
    "button:Delayed update",
  ];
  const found = expectedTargets.filter((target) => targets.has(target));
  const recall = found.length / expectedTargets.length;
  if (recall < 0.9) console.error(JSON.stringify({ expectedTargets, found, actualTargets: [...targets].sort() }));
  assert.ok(recall >= 0.9, `action recall ${recall}`);
  assert.ok(inventory.metrics.locatorUniqueness >= 0.99, `locator uniqueness ${inventory.metrics.locatorUniqueness}`);
  assert.equal(inventory.metrics.ambiguousLocatorTargets, 0);

  const type = inventory.actions.find((action) => action.kind === "type" && action.target.name === "What needs to be done?" && action.input === "alpha");
  assert.ok(type);
  await driver.execute(type);
  const add = (await driver.actions()).actions.find((action) => action.kind === "submit" && action.target.name === "Todo");
  assert.ok(add);
  const added = await driver.execute(add);
  assert.ok(added.snapshot.dom.includes("alpha"));
  assert.ok(added.snapshot.storage.local.todos.includes("alpha"));

  const replay = await driver.replay([type.id, add.id], { attempts: 2 });
  assert.equal(replay.deterministic, true);

  const writeStorage = (await driver.actions()).actions.find((action) => action.kind === "click" && action.target.name === "Write storage");
  assert.ok(writeStorage);
  const storage = await driver.execute(writeStorage);
  assert.equal(storage.snapshot.storage.local.mode, "generic");

  const delayed = (await driver.actions()).actions.find((action) => action.kind === "click" && action.target.name === "Delayed update");
  assert.ok(delayed);
  const delayedResult = await driver.execute(delayed);
  assert.equal(delayedResult.settle.status, "settled");
  assert.equal(delayedResult.settle.strategy, "semantic-quiescence");
  assert.equal(delayedResult.settle.pendingRequests, 0);
  assert.ok(delayedResult.settle.samples >= 3);
  assert.equal(delayedResult.settle.networkIdleUsed, false);
  assert.ok(delayedResult.snapshot.dom.includes("done"));
  assert.equal(delayedResult.snapshot.pendingRequests, 0);

  const beforeContext = delayedResult.snapshot.browser.contextSequence;
  const reset = await driver.reset();
  assert.ok(reset.browser.contextSequence > beforeContext);
  assert.deepEqual(reset.storage, { local: {}, session: {} });

  const ambiguous = new GenericPlaywrightBrowserDriver({ url: `${server.url}ambiguous`, timeoutMs: 4_000, inputCorpus: ["x"] });
  try {
    await ambiguous.reset();
    const ambiguousInventory = await ambiguous.actions();
    assert.equal(ambiguousInventory.actions.some((action) => action.target.name === "Delete"), false);
    assert.ok(ambiguousInventory.diagnostics.some((diagnostic) => diagnostic.kind === "ambiguous_action" || diagnostic.kind === "ambiguous_locator"));
  } finally {
    await ambiguous.dispose();
  }

  const hrefFallback = new GenericPlaywrightBrowserDriver({ url: `${server.url}href-fallback`, timeoutMs: 4_000, inputCorpus: ["x"] });
  try {
    await hrefFallback.reset();
    const hrefInventory = await hrefFallback.actions();
    const recovered = hrefInventory.actions.find((action) => action.target.href === "/target");
    assert.ok(recovered, "unique href should recover a link whose raw text does not match its accessible name");
    assert.equal(recovered.locator.strategy, "href");
    assert.equal(recovered.locator.count, 1);
    assert.equal(hrefInventory.actions.some((action) => action.target.href === "/same"), false, "duplicate href must remain fail-closed");
    assert.ok(hrefInventory.diagnostics.some((diagnostic) => ["ambiguous_action", "ambiguous_locator"].includes(diagnostic.kind)), "duplicate link identity must emit an ambiguity diagnostic");
  } finally {
    await hrefFallback.dispose();
  }

  const churn = new GenericPlaywrightBrowserDriver({
    url: `${server.url}churn`,
    timeoutMs: 1_000,
    quiescence: { timeoutMs: 140, stableSamples: 3, sampleIntervalMs: 10 },
  });
  try {
    const churnSnapshot = await churn.reset();
    assert.equal(churnSnapshot.settle.status, "timeout");
    assert.equal(churnSnapshot.settle.diagnostic.code, "semantic_quiescence_timeout");
    assert.ok(churnSnapshot.settle.distinctFingerprints >= 2);
    assert.equal(churnSnapshot.settle.networkIdleUsed, false);
  } finally {
    await churn.dispose();
  }

  console.log(JSON.stringify({
    ok: true,
    runtime: "generic-browser-driver-test",
    expectedTargetCount: expectedTargets.length,
    foundTargetCount: found.length,
    actionRecall: recall,
    locatorUniqueness: inventory.metrics.locatorUniqueness,
    actionCount: inventory.actions.length,
    deterministicReplay: replay.deterministic,
    semanticQuiescence: true,
  }));
} finally {
  await driver.dispose();
  await server.close();
}

// Opaque/data documents may deny storage access. Snapshotting must fail closed to empty storage
// rather than aborting the whole browser campaign.
const opaqueDriver = new GenericPlaywrightBrowserDriver({
  url: "data:text/html,<main><button>Opaque</button></main>",
  timeoutMs: 2_000,
});
try {
  const opaqueSnapshot = await opaqueDriver.reset();
  assert.deepEqual(opaqueSnapshot.storage, { local: {}, session: {} });
} finally {
  await opaqueDriver.dispose();
}


// Focus ownership is useful opaque telemetry, but focus-only changes must not create
// exploration progress states or minimal replay steps.
const focusOnlyDriver = new GenericPlaywrightBrowserDriver({
  url: "data:text/html,<button id='focus'>Focus</button>",
  profile: "content-blind-opaque-v1",
  timeoutMs: 2_000,
});
try {
  const beforeFocus = await focusOnlyDriver.reset();
  await focusOnlyDriver.page.evaluate(() => document.querySelector('button').focus());
  const afterFocus = await focusOnlyDriver.opaqueSnapshot();
  assert.notEqual(beforeFocus.opaqueState.focusPresent, afterFocus.opaqueState.focusPresent);
  assert.equal(beforeFocus.fingerprint, afterFocus.fingerprint);
} finally {
  await focusOnlyDriver.dispose();
}

// Portable dom activation must model a physically hittable pointer action. A covered
// structural candidate remains in ordinal order but is not executed through DOM .click().
const coveredOpaqueDriver = new GenericPlaywrightBrowserDriver({
  url: "data:text/html,<style>button{position:absolute;left:20px;top:20px;width:120px;height:60px}div{position:absolute;left:0;top:0;width:200px;height:120px;z-index:2}</style><button id=target>Target</button><div></div><script>globalThis.activated=0;target.addEventListener('click',()=>activated++)</script>",
  profile: "content-blind-opaque-v1",
  timeoutMs: 2_000,
});
try {
  await coveredOpaqueDriver.reset();
  const coveredInventory = await coveredOpaqueDriver.actions();
  const coveredAction = coveredInventory.actions.find((action) => action.kind === "dom_activate" && action.ordinal === 0);
  assert.ok(coveredAction);
  await assert.rejects(() => coveredOpaqueDriver.execute(coveredAction), /opaque_action_not_observed/);
  assert.equal(await coveredOpaqueDriver.page.evaluate(() => globalThis.activated), 0);
} finally {
  await coveredOpaqueDriver.dispose();
}

// Optional real TodoMVC dogfood: no project-specific Playwright adapter is used.
async function staticServer(root) {
  if (!fs.existsSync(path.join(root, "index.html"))) return null;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    let file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, "index.html");
    const ext = path.extname(file);
    const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}

for (const relative of [".tmp/todomvc/examples/react/dist", ".tmp/todomvc/examples/vue/dist"]) {
  const root = path.join(ROOT, relative);
  const realServer = await staticServer(root);
  if (!realServer) continue;
  const realDriver = new GenericPlaywrightBrowserDriver({ url: realServer.url, timeoutMs: 5_000, inputCorpus: ["proped"] });
  try {
    await realDriver.reset();
    const inventory = await realDriver.actions();
    const names = inventory.actions.map((action) => `${action.target.role}:${action.target.name}`);
    const newTodo = inventory.actions.some((action) => action.target.role === "textbox" && /todo|needs/i.test(action.target.name));
    if (!newTodo) console.error(JSON.stringify({ optionalRealTarget: relative, names, diagnostics: inventory.diagnostics, snapshot: await realDriver.snapshot() }));
    assert.equal(newTodo, true, `${relative}: new-todo action missing`);
    assert.ok(inventory.metrics.locatorUniqueness >= 0.99, `${relative}: locator uniqueness ${inventory.metrics.locatorUniqueness}`);
    console.log(JSON.stringify({ ok: true, optionalRealTarget: relative, actionCount: inventory.actions.length, locatorUniqueness: inventory.metrics.locatorUniqueness }));
  } finally {
    await realDriver.dispose();
    await realServer.close();
  }
}
