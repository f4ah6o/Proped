#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { exploreWebCoverageGuided } from "../protocol/web-coverage-guided-exploration.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import {
  CONTENT_BLIND_OPAQUE_PROFILE,
  OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
  buildOpaqueWebReplayV1,
  opaqueCandidateOrderFixtureVector,
  replayOpaqueWebReplayV1,
  validateOpaqueWebReplayV1,
} from "../protocol/opaque-web-replay-v1.mjs";
import { managedBrowserRuntimeReadiness } from "../web/playwright-browser/managed-browser-runtime.mjs";
import { validateOpaqueLoopbackUrl } from "./web_explore_url_opaque.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_STRINGS = [
  "PRIVATE_TITLE_Q7M4",
  "PRIVATE_NOOP_A1",
  "PRIVATE_ARM_B2",
  "PRIVATE_NOOP_C3",
  "PRIVATE_FINISH_D4",
  "PRIVATE_ARIA_E5",
  "PRIVATE_STORAGE_VALUE_F6",
  "PRIVATE_CONSOLE_G7",
  "PRIVATE_SOURCE_H8",
  "/permit-private-route",
];

class RuntimeSaltReplayDriver {
  constructor(runtimeSalt) {
    this.runtimeSalt = runtimeSalt;
    this.browserEngine = "chromium";
    this.state = 0;
  }
  snapshot() {
    return {
      fingerprint: semanticHash({ runtimeSalt: this.runtimeSalt, state: this.state }),
      opaqueState: { domActivateCount: this.state >= 2 ? 0 : 2 },
    };
  }
  async reset() { this.state = 0; return this.snapshot(); }
  async actions() {
    return {
      actions: this.state >= 2 ? [] : [
        { id: "dom_activate:000", kind: "dom_activate", ordinal: 0, portableAction: true },
        { id: "dom_activate:001", kind: "dom_activate", ordinal: 1, portableAction: true },
      ],
      diagnostics: [],
      metrics: {},
    };
  }
  async execute(action) {
    if (action.id !== "dom_activate:001") throw new Error("synthetic unexpected action");
    this.state += 1;
    return { snapshot: this.snapshot(), violations: [] };
  }
}

const fixtureVector = JSON.parse(fs.readFileSync(path.join(ROOT, "protocol/fixtures/opaque-web-candidate-order-v1.json"), "utf8"));
assert.deepEqual(fixtureVector, opaqueCandidateOrderFixtureVector(), "checked-in consumer vector must pin candidateOrderVersion semantics");
assert.equal(fixtureVector.candidateOrderVersion, OPAQUE_WEB_CANDIDATE_ORDER_VERSION);
assert.equal(validateOpaqueLoopbackUrl("http://127.0.0.1:8080/example"), "http://127.0.0.1:8080/example");
assert.equal(validateOpaqueLoopbackUrl("https://localhost:8443/example"), "https://localhost:8443/example");
assert.throws(() => validateOpaqueLoopbackUrl("https://example.com/private"), /loopback host/);
assert.throws(() => validateOpaqueLoopbackUrl("file:///tmp/private.html"), /HTTP\(S\)/);

let externalState = 0;
let checkpointSequence = 0;
const checkpoints = new Map();
const restoreLog = [];

const html = `<!doctype html>
<title>PRIVATE_TITLE_Q7M4</title>
<style>body{margin:0}main{width:120px}button{display:block;width:80px;height:24px}</style>
<main id="root"></main>
<script>
localStorage.setItem("opaque-fixture-key", "PRIVATE_STORAGE_VALUE_F6");
console.error("PRIVATE_CONSOLE_G7");
window.__opaque_private_source = "PRIVATE_SOURCE_H8";
let stage = 0;
const root = document.getElementById("root");
function button(text, action, aria) {
  const node = document.createElement("button");
  node.textContent = text;
  if (aria) node.setAttribute("aria-label", aria);
  node.addEventListener("click", action);
  return node;
}
function render() {
  root.replaceChildren();
  if (stage === 0) {
    root.append(button("PRIVATE_NOOP_A1", () => {}, "PRIVATE_ARIA_E5"));
    root.append(button("PRIVATE_ARM_B2", async () => {
      await fetch("/arm-private-route", { method: "POST" });
      stage = 1;
      render();
    }));
  } else if (stage === 1) {
    const section = document.createElement("section");
    section.append(button("PRIVATE_NOOP_C3", () => {}));
    section.append(button("PRIVATE_FINISH_D4", async () => {
      const response = await fetch("/permit-private-route");
      if (response.ok) {
        stage = 2;
        render();
      }
    }));
    root.append(section);
  } else {
    const section = document.createElement("section");
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    inner.append(document.createElement("span"));
    outer.append(inner);
    section.append(outer);
    root.append(section);
  }
}
render();
</script>`;

const server = http.createServer((request, response) => {
  if (request.url === "/arm-private-route" && request.method === "POST") {
    externalState = 1;
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/permit-private-route") {
    response.writeHead(externalState === 1 ? 204 : 409).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/private?query=PRIVATE_URL_J9#PRIVATE_FRAGMENT_K0`;

function environmentStateId() {
  return semanticHash({ opaqueExternalState: externalState });
}

const driver = new GenericPlaywrightBrowserDriver({
  url,
  profile: CONTENT_BLIND_OPAQUE_PROFILE,
  timeoutMs: 4_000,
  environmentCheckpoint: async () => {
    const checkpointId = `opaque-checkpoint-${++checkpointSequence}`;
    checkpoints.set(checkpointId, externalState);
    return { checkpointId, environmentStateId: environmentStateId() };
  },
  restoreEnvironmentCheckpoint: async (checkpointId) => {
    assert.ok(checkpoints.has(checkpointId), `unknown fixture checkpoint: ${checkpointId}`);
    externalState = checkpoints.get(checkpointId);
    const restored = environmentStateId();
    restoreLog.push({ checkpointId, environmentStateId: restored });
    return { environmentStateId: restored };
  },
});

let replay;
let exploration;
try {
  const initial = await driver.reset();
  assert.equal("url" in initial, false);
  assert.equal("dom" in initial, false);
  assert.equal("forms" in initial, false);
  assert.equal("storage" in initial, false);
  assert.equal("routes" in initial, false);
  assert.equal("console" in initial, false);
  assert.equal(initial.browser.name, "chromium");
  const initialInventory = await driver.actions();
  assert.deepEqual(initialInventory.actions.slice(0, 2).map(({ kind, ordinal }) => ({ kind, ordinal })), [
    { kind: "dom_activate", ordinal: 0 },
    { kind: "dom_activate", ordinal: 1 },
  ]);
  assert.ok(initialInventory.actions.some((action) => action.kind === "pointer_point"));
  const boundaryJson = JSON.stringify({ initial, initialInventory });
  for (const secret of PRIVATE_STRINGS) assert.equal(boundaryJson.includes(secret), false, `opaque browser boundary leaked ${secret}`);

  exploration = await exploreWebCoverageGuided(driver, {
    maxStates: 8,
    maxTransitions: 16,
    maxDepth: 4,
    actionFilter: (action) => action.portableAction === true,
  });
  assert.equal(exploration.checkpointAware, true);
  assert.ok(exploration.stateTraces.some((state) => state.depth >= 2), "coverage-guided exploration must find the non-default progressing branch");
  assert.ok(exploration.transitionGraph.some((edge) => edge.actionId === "dom_activate:000" && edge.from === edge.to), "fixture must include a legitimate no-op candidate");
  assert.ok(restoreLog.length >= 2, "checkpoint-aware exploration must restore sibling state rather than sharing mutations");
  const explorationJson = JSON.stringify(exploration);
  for (const secret of PRIVATE_STRINGS) assert.equal(explorationJson.includes(secret), false, `opaque exploration evidence leaked ${secret}`);

  const target = [...exploration.stateTraces]
    .filter((state) => state.depth >= 2)
    .sort((a, b) => b.depth - a.depth)[0];
  assert.ok(target);
  replay = await buildOpaqueWebReplayV1(driver, {
    trace: target.trace,
    targetFingerprint: target.fingerprint,
    targetEnvironmentStateId: target.environmentStateId,
    initialCheckpoint: exploration.checkpointProvenance,
    browserEngine: "chromium",
    budget: 64,
    freshReplayAttempts: 2,
  });
  validateOpaqueWebReplayV1(replay);
  assert.equal(replay.version, "OpaqueWebReplayV1");
  assert.equal(replay.candidateOrderVersion, "1");
  assert.equal(replay.browserEngine, "chromium");
  assert.equal(replay.minimality.status, "one-minimal");
  assert.equal(replay.minimality.deterministic, true);
  assert.deepEqual(replay.steps.map(({ kind, ordinal }) => ({ kind, ordinal })), [
    { kind: "dom_activate", ordinal: 1 },
    { kind: "dom_activate", ordinal: 1 },
  ]);
  assert.deepEqual(replay.steps.map((step) => step.expectedTransition), ["changed", "terminal"]);

  const budgetExhausted = await buildOpaqueWebReplayV1(driver, {
    trace: target.trace,
    targetFingerprint: target.fingerprint,
    targetEnvironmentStateId: target.environmentStateId,
    initialCheckpoint: exploration.checkpointProvenance,
    browserEngine: "chromium",
    budget: 1,
    freshReplayAttempts: 2,
  });
  assert.equal(budgetExhausted.minimality.status, "budget-exhausted");
  assert.notEqual(budgetExhausted.minimality.status, "one-minimal");

  const replayJson = JSON.stringify(replay);
  for (const secret of PRIVATE_STRINGS) assert.equal(replayJson.includes(secret), false, `portable replay leaked ${secret}`);
  for (const forbiddenKey of ["text", "selector", "url", "accessibility", "screenshot", "pixels", "console", "error", "stack", "source", "storage", "href", "label", "name"]) {
    assert.equal(Object.keys(replay).includes(forbiddenKey), false);
    assert.equal(replay.steps.some((step) => Object.hasOwn(step, forbiddenKey)), false);
  }
  assert.throws(() => validateOpaqueWebReplayV1({ ...replay, url }), /unsupported field/);
  assert.throws(() => validateOpaqueWebReplayV1({ ...replay, steps: [{ ...replay.steps[0], selector: "button" }] }), /unsupported field/);

  const chromiumReplay = await replayOpaqueWebReplayV1(driver, replay, { attempts: 2 });
  assert.equal(chromiumReplay.ok, true);

  const runtimeA = new RuntimeSaltReplayDriver("runtime-a");
  const runtimeB = new RuntimeSaltReplayDriver("runtime-b");
  assert.notEqual((await runtimeA.reset()).fingerprint, (await runtimeB.reset()).fingerprint);
  assert.equal((await replayOpaqueWebReplayV1(runtimeA, replay, { attempts: 2 })).ok, true);
  assert.equal((await replayOpaqueWebReplayV1(runtimeB, replay, { attempts: 2 })).ok, true);

  const webkitReadiness = await managedBrowserRuntimeReadiness({ engine: "webkit" });
  if (webkitReadiness.executableReady) {
    const webkitDriver = new GenericPlaywrightBrowserDriver({
      url,
      profile: CONTENT_BLIND_OPAQUE_PROFILE,
      browserEngine: "webkit",
      timeoutMs: 4_000,
      beforeReset: async () => { externalState = 0; },
    });
    try {
      const webkitReplay = await replayOpaqueWebReplayV1(webkitDriver, replay, { attempts: 2 });
      assert.equal(webkitReplay.ok, true, JSON.stringify(webkitReplay));
      assert.equal(webkitReplay.browserEngine, "webkit");
    } finally {
      await webkitDriver.dispose();
    }
  } else {
    assert.equal(webkitReadiness.diagnostic, "managed_webkit_launch_failed");
  }

  externalState = 0;
  const child = spawn(process.execPath, [
    path.join(ROOT, "scripts/proped.mjs"),
    "web", "explore-url", url,
    "--profile", CONTENT_BLIND_OPAQUE_PROFILE,
    "--engine", "chromium",
    "--max-transitions", "16",
    "--minimize-budget", "64",
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, stderr);
  const cliReplay = JSON.parse(stdout.trim());
  validateOpaqueWebReplayV1(cliReplay);
  assert.equal(JSON.stringify(cliReplay).includes(url), false, "CLI result must not persist the raw loopback URL");
  for (const secret of PRIVATE_STRINGS) assert.equal(JSON.stringify(cliReplay).includes(secret), false, `CLI portable replay leaked ${secret}`);

  const rejectedUrl = "https://example.com/PRIVATE_REMOTE_URL_L1";
  const rejected = spawn(process.execPath, [
    path.join(ROOT, "scripts/proped.mjs"),
    "web", "explore-url", rejectedUrl,
    "--profile", CONTENT_BLIND_OPAQUE_PROFILE,
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let rejectedStdout = "";
  let rejectedStderr = "";
  rejected.stdout.setEncoding("utf8");
  rejected.stderr.setEncoding("utf8");
  rejected.stdout.on("data", (chunk) => { rejectedStdout += chunk; });
  rejected.stderr.on("data", (chunk) => { rejectedStderr += chunk; });
  const rejectedExit = await new Promise((resolve) => rejected.on("close", resolve));
  assert.equal(rejectedExit, 2);
  const rejectedEvidence = `${rejectedStdout}${rejectedStderr}`;
  assert.equal(rejectedEvidence.includes(rejectedUrl), false);
  assert.equal(rejectedEvidence.includes("PRIVATE_REMOTE_URL_L1"), false);
  assert.match(rejectedEvidence, /opaque_url_mode_invalid_arguments/);
} finally {
  await driver.dispose();
  await new Promise((resolve) => server.close(resolve));
}

console.log(JSON.stringify({
  ok: true,
  runtime: "content-blind-opaque-web-replay-test",
  candidateOrderVersion: replay.candidateOrderVersion,
  steps: replay.steps,
  minimality: replay.minimality.status,
  deterministic: replay.minimality.deterministic,
  checkpointAware: exploration.checkpointAware,
  siblingRestoreCount: restoreLog.length,
}));
