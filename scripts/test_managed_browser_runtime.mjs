#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { managedBrowserRuntimeDetails } from "../web/playwright-browser/managed-browser-runtime.mjs";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";

const runtime = managedBrowserRuntimeDetails({ includePaths: true });
assert.equal(runtime.provider, "proped");
assert.equal(runtime.ownership, "managed");
assert.equal(runtime.targetProjectDependencyRequired, false);
assert.equal(runtime.playwrightVersion, "1.62.0");
assert.equal(runtime.chromiumRevision, "1234");
assert.equal(runtime.chromiumVersion, "151.0.7922.34");
assert.ok(runtime.playwrightPackageRoot.includes("playwright"));
assert.ok(fs.existsSync(runtime.browsersFile));

const target = fs.mkdtempSync(path.join(os.tmpdir(), "proped-managed-browser-target-"));
fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({
  name: "target-without-playwright",
  private: true,
  dependencies: {},
}, null, 2));
fs.writeFileSync(path.join(target, "index.html"), "<!doctype html><main><button>Ready</button></main>");
const targetPackage = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
assert.equal(Object.hasOwn(targetPackage.dependencies, "playwright"), false);
assert.equal(fs.existsSync(path.join(target, "node_modules", "playwright")), false);

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  fs.createReadStream(path.join(target, "index.html")).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const driver = new GenericPlaywrightBrowserDriver({ url, timeoutMs: 2_000 });
try {
  const snapshot = await driver.reset();
  assert.equal(snapshot.browser.managedRuntime.provider, "proped");
  assert.equal(snapshot.browser.managedRuntime.playwrightVersion, "1.62.0");
  assert.equal(snapshot.browser.managedRuntime.chromiumRevision, "1234");
  assert.equal(snapshot.browser.managedRuntime.targetProjectDependencyRequired, false);
  const inventory = await driver.actions();
  assert.ok(inventory.actions.some((action) => action.target.name === "Ready"));
} finally {
  await driver.dispose();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(target, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  runtime: "managed-browser-runtime-test",
  playwrightVersion: runtime.playwrightVersion,
  chromiumRevision: runtime.chromiumRevision,
  chromiumVersion: runtime.chromiumVersion,
  targetProjectDependencyRequired: false,
}));
