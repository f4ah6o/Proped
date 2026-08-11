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
</script>
</body></html>`;

async function startServer() {
  const server = http.createServer((request, response) => {
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

  const beforeContext = storage.snapshot.browser.contextSequence;
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

  console.log(JSON.stringify({
    ok: true,
    runtime: "generic-browser-driver-test",
    expectedTargetCount: expectedTargets.length,
    foundTargetCount: found.length,
    actionRecall: recall,
    locatorUniqueness: inventory.metrics.locatorUniqueness,
    actionCount: inventory.actions.length,
    deterministicReplay: replay.deterministic,
  }));
} finally {
  await driver.dispose();
  await server.close();
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
