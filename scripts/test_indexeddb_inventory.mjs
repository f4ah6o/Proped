#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";

const HTML = `<!doctype html><main><h1>IndexedDB fixture</h1><output id="ready">booting</output></main><script>
const request = indexedDB.open('proped-fixture', 3);
request.onupgradeneeded = () => {
  const db = request.result;
  if (!db.objectStoreNames.contains('todos')) {
    const todos = db.createObjectStore('todos', { keyPath: 'id' });
    todos.createIndex('byDone', 'done', { unique: false });
    todos.createIndex('byTitle', 'title', { unique: true });
  }
  if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { autoIncrement: true });
};
request.onsuccess = () => {
  const db = request.result;
  const tx = db.transaction(['todos','metadata'], 'readwrite');
  tx.objectStore('todos').put({ id: 1, title: 'alpha', done: false, secretPayload: 'must-not-be-in-inventory' });
  tx.objectStore('todos').put({ id: 2, title: 'beta', done: true, secretPayload: 'must-not-be-in-inventory' });
  tx.objectStore('metadata').add({ createdAt: Date.now() });
  tx.oncomplete = () => { document.querySelector('#ready').textContent = 'ready'; db.close(); };
};
</script>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end(HTML);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const driver = new GenericPlaywrightBrowserDriver({
  url: `http://127.0.0.1:${server.address().port}/`,
  indexedDBMode: "auto-metadata",
  timeoutMs: 3_000,
});
try {
  const snapshot = await driver.reset();
  const inventory = snapshot.applicationState?.indexedDB;
  assert.ok(inventory);
  assert.equal(inventory.supported, true);
  assert.equal(inventory.databases.length, 1);
  const database = inventory.databases[0];
  assert.equal(database.name, "proped-fixture");
  assert.equal(database.nativeVersion, 3);
  assert.deepEqual(database.stores.map((store) => store.name), ["metadata", "todos"]);
  const todos = database.stores.find((store) => store.name === "todos");
  assert.equal(todos.keyPath, "id");
  assert.equal(todos.autoIncrement, false);
  assert.equal(todos.count, 2);
  assert.deepEqual(todos.indexes, [
    { name: "byDone", keyPath: "done", unique: false, multiEntry: false },
    { name: "byTitle", keyPath: "title", unique: true, multiEntry: false },
  ]);
  const serialized = JSON.stringify(inventory);
  assert.equal(serialized.includes("secretPayload"), false);
  assert.equal(serialized.includes("alpha"), false);
  assert.equal(serialized.includes("beta"), false);

  const second = await driver.snapshot();
  assert.equal(second.applicationState.indexedDB.semanticHash, inventory.semanticHash);

  console.log(JSON.stringify({
    ok: true,
    runtime: "indexeddb-inventory-test",
    databaseCount: inventory.databases.length,
    storeCount: database.stores.length,
    todoCount: todos.count,
    valuePayloadCaptured: false,
    semanticHash: inventory.semanticHash,
  }));
} finally {
  await driver.dispose();
  await new Promise((resolve) => server.close(resolve));
}
