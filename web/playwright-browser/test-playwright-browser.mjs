#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildPropertyFailure } from "../../protocol/web-property-pack.mjs";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";
import { PlaywrightBrowserDriver } from "./playwright-browser-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUTPUT = path.join(HERE, "out");
const FIXTURE = path.join(ROOT, "protocol/fixtures/playwright-browser-mode-result.json");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");
const BENCHMARK_ONLY = process.argv.includes("--benchmark-only");
const require = createRequire(import.meta.url);
const PLAYWRIGHT_VERSION = require("playwright/package.json").version;

function findAction(result, predicate, label) {
  const action = result.actions.find(predicate);
  assert.ok(action, `missing action: ${label}`);
  return action;
}

async function findActionById(driver, id) {
  const result = await driver.actions();
  return result.actions.find((action) => action.id === id);
}

async function replayForViolation(driver, trace, code) {
  await driver.reset(17, "browser-fault-form");
  let found = null;
  for (const id of trace) {
    const action = await findActionById(driver, id);
    if (!action) return null;
    const result = await driver.execute(action);
    found = result.violations.find((item) => item.code === code) ?? found;
  }
  return found;
}

async function shrinkTrace(driver, trace, code) {
  let current = [...trace];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.length; index += 1) {
      const candidate = current.filter((_, itemIndex) => itemIndex !== index);
      if (await replayForViolation(driver, candidate, code)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

async function verifyBrowserBoundaries(driver) {
  const initial = await driver.reset(17, "browser-fault-form");
  assert.equal(initial.browser.name, "chromium");
  assert.equal(initial.browser.ephemeralProfile, true);
  assert.equal(initial.browser.serviceWorkers, "block");
  assert.equal(initial.browser.networkPolicy, "deny-except-memory-fixture");
  assert.deepEqual(initial.storage, { local: {}, session: {} });
  assert.equal(initial.routes.length, 1);
  assert.equal(initial.routes[0].decision, "fulfill");
  assert.equal(initial.routes[0].source, "memory-fixture");

  const initialContext = initial.browser.contextSequence;
  const actions = await driver.actions();
  assert.equal(actions.diagnostics.length, 0);

  const writeStorage = findAction(
    actions,
    (action) => action.kind === "click" && action.target.name === "Write storage",
    "Write storage",
  );
  const storageResult = await driver.execute(writeStorage);
  assert.deepEqual(storageResult.snapshot.storage, {
    local: { "fixture-mode": "browser" },
    session: { "fixture-seed": "17" },
  });

  const openDialog = findAction(
    await driver.actions(),
    (action) => action.kind === "click" && action.target.name === "Open details",
    "Open details",
  );
  const openResult = await driver.execute(openDialog);
  assert.equal(openResult.snapshot.focus?.role, "button");
  assert.equal(openResult.snapshot.focus?.name, "Close details");
  assert.deepEqual(openResult.snapshot.focus?.within, ["dialog:Details"]);

  const closeDialog = findAction(
    await driver.actions(),
    (action) => action.kind === "click" && action.target.name === "Close details",
    "Close details",
  );
  const closeResult = await driver.execute(closeDialog);
  assert.equal(closeResult.snapshot.focus?.name, "Open details");
  assert.deepEqual(closeResult.snapshot.focus?.within ?? [], []);

  const emitWarning = findAction(
    await driver.actions(),
    (action) => action.kind === "click" && action.target.name === "Emit warning",
    "Emit warning",
  );
  const warningResult = await driver.execute(emitWarning);
  assert.ok(warningResult.snapshot.console.some((entry) => entry.message === "fixture warning"));

  const attemptNetwork = findAction(
    await driver.actions(),
    (action) => action.kind === "click" && action.target.name === "Attempt network",
    "Attempt network",
  );
  const networkResult = await driver.execute(attemptNetwork);
  assert.equal(networkResult.snapshot.applicationState.lastNetwork, "denied");
  assert.ok(networkResult.snapshot.routes.some((entry) =>
    entry.url === "https://blocked.invalid/data" &&
    entry.decision === "abort" && entry.reason === "network_denied"
  ));
  assert.ok(networkResult.snapshot.console.some((entry) =>
    entry.message.startsWith("network denied:")
  ));
  assert.equal(networkResult.settle.networkIdleUsed, false);

  const reset = await driver.reset(17, "browser-fault-form");
  assert.ok(reset.browser.contextSequence > initialContext);
  assert.deepEqual(reset.storage, { local: {}, session: {} });
  assert.equal(reset.applicationState.blockedRouteCount, 0);
  assert.ok(!reset.console.some((entry) => entry.message === "fixture warning"));

  return {
    actionCount: actions.actions.length,
    routeSnapshot: true,
    focusSnapshot: true,
    storageSnapshot: true,
    consoleSnapshot: true,
    networkDenied: true,
    contextReset: true,
  };
}

async function verifyKnownFailures(driver) {
  await driver.reset(17, "browser-fault-form");
  const initialActions = await driver.actions();
  const typeSearchA = findAction(
    initialActions,
    (action) => action.kind === "type" && action.target.role === "searchbox" && action.input === "a",
    "type Search a",
  );
  const typeSearchAB = findAction(
    initialActions,
    (action) => action.kind === "type" && action.target.role === "searchbox" && action.input === "ab",
    "type Search ab",
  );
  const submit = findAction(
    initialActions,
    (action) => action.kind === "submit" && action.target.name === "Profile",
    "submit Profile",
  );

  await driver.execute(typeSearchA);
  await driver.execute(typeSearchAB);
  const staleDelivery = findAction(
    await driver.actions(),
    (action) => action.kind === "inject" &&
      action.target.name === "Search response" && action.input.generation === 1,
    "stale search response",
  );
  const staleResult = await driver.execute(staleDelivery);
  const staleViolation = staleResult.violations.find((item) => item.code === "stale_response");
  assert.ok(staleViolation);
  const staleTrace = [typeSearchA.id, typeSearchAB.id, staleDelivery.id];
  assert.deepEqual(await shrinkTrace(driver, staleTrace, "stale_response"), staleTrace);

  await driver.reset(17, "browser-fault-form");
  await driver.execute(await findActionById(driver, submit.id));
  const duplicateResult = await driver.execute(await findActionById(driver, submit.id));
  const duplicateViolation = duplicateResult.violations.find((item) => item.code === "duplicate_submit");
  assert.ok(duplicateViolation);
  const duplicateTrace = [submit.id, submit.id];
  assert.deepEqual(await shrinkTrace(driver, duplicateTrace, "duplicate_submit"), duplicateTrace);

  await driver.reset(17, "browser-fault-form");
  const invalidNumber = findAction(
    await driver.actions(),
    (action) => action.kind === "type" && action.target.role === "spinbutton" && action.input === "invalid",
    "invalid number",
  );
  const beforeInvalid = await driver.snapshot();
  const invalidResult = await driver.execute(invalidNumber);
  assert.equal(beforeInvalid.applicationState.numberResult, 4);
  assert.equal(invalidResult.snapshot.applicationState.numberResult, 0);

  const staleFailure = buildPropertyFailure({
    fixture: "browser-fault-form",
    trace: staleTrace,
    snapshot: staleResult.snapshot,
    violation: staleViolation,
    seed: 17,
  });
  const duplicateFailure = buildPropertyFailure({
    fixture: "browser-fault-form",
    trace: duplicateTrace,
    snapshot: duplicateResult.snapshot,
    violation: duplicateViolation,
    seed: 17,
  });
  const invalidFailure = {
    property: "invalid_input_preserves_previous_result",
    message: "invalid numeric input destroyed the previous valid result",
    trace: [invalidNumber.id],
    semanticHash: semanticHash({
      fixture: "browser-fault-form",
      property: "invalid_input_preserves_previous_result",
      trace: [invalidNumber.id],
      before: 4,
      after: 0,
    }),
  };

  await replayForViolation(driver, staleTrace, "stale_response");
  const firstHash = (await driver.snapshot()).fingerprint;
  await replayForViolation(driver, staleTrace, "stale_response");
  const secondHash = (await driver.snapshot()).fingerprint;
  assert.equal(firstHash, secondHash);

  return {
    failures: [staleFailure, duplicateFailure, invalidFailure],
    replayHash: firstHash,
  };
}

async function runBoundedTransitions(driver, transitions = 128) {
  const states = new Set();
  const violationCodes = new Set();
  let blockedRoutes = 0;
  let stable = null;
  const started = performance.now();

  for (let index = 0; index < transitions; index += 1) {
    if (index % 16 === 0) {
      const snapshot = await driver.reset(101, "browser-fault-form");
      states.add(snapshot.fingerprint);
      stable = await driver.actions();
    }
    const phase = index % 16;
    let action;
    if (phase === 0 || phase === 8) {
      action = findAction(stable, (candidate) =>
        candidate.kind === "type" && candidate.target.name === "Search" && candidate.input === "a",
      "bounded type a");
    } else if (phase === 1 || phase === 9) {
      action = findAction(stable, (candidate) =>
        candidate.kind === "type" && candidate.target.name === "Search" && candidate.input === "ab",
      "bounded type ab");
    } else if (phase === 2 || phase === 10) {
      action = findAction(await driver.actions(), (candidate) =>
        candidate.kind === "inject" && candidate.target.name === "Search response",
      "bounded deliver search");
    } else if (phase === 3 || phase === 4 || phase === 11 || phase === 12) {
      action = findAction(stable, (candidate) =>
        candidate.kind === "submit" && candidate.target.name === "Profile",
      "bounded submit");
    } else if (phase === 5 || phase === 13) {
      action = findAction(await driver.actions(), (candidate) =>
        candidate.kind === "inject" && candidate.target.name === "Submit response",
      "bounded complete submit");
    } else if (phase === 6 || phase === 14) {
      action = findAction(stable, (candidate) =>
        candidate.kind === "click" && candidate.target.name === "Write storage",
      "bounded storage");
    } else if (phase === 7) {
      action = findAction(stable, (candidate) =>
        candidate.kind === "click" && candidate.target.name === "Attempt network",
      "bounded network");
    } else {
      action = findAction(stable, (candidate) =>
        candidate.kind === "click" && candidate.target.name === "Emit warning",
      "bounded warning");
    }
    const result = await driver.execute(action);
    states.add(result.snapshot.fingerprint);
    blockedRoutes = Math.max(blockedRoutes, result.snapshot.applicationState.blockedRouteCount);
    for (const violation of result.violations) violationCodes.add(violation.code);
  }

  const elapsedMs = Math.round(performance.now() - started);
  assert.equal(transitions, 128);
  assert.ok(states.size >= 16, `expected at least 16 browser states, got ${states.size}`);
  assert.ok(violationCodes.has("stale_response"));
  assert.ok(violationCodes.has("duplicate_submit"));
  assert.ok(blockedRoutes >= 1);
  assert.ok(elapsedMs < 60_000, `browser fixture exceeded 60 seconds: ${elapsedMs}ms`);
  return {
    transitions,
    distinctStates: states.size,
    violationCodes: [...violationCodes].sort(),
    blockedRoutes,
    elapsedMs,
  };
}

function writeArtifacts(result) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "playwright-browser-mode",
    states: result.benchmark.distinctStates,
    transitions: result.benchmark.transitions,
    failures: result.failures,
    diagnostics: result.diagnostics,
    capabilities: result.capabilities,
    semanticHash: result.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    "digraph playwright_browser { initial -> stale [label=\"type/type/deliver\"]; initial -> duplicate [label=\"submit/submit\"]; initial -> denied [label=\"route abort\"]; }\n",
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="190"><rect width="100%" height="100%" fill="white"/><text x="24" y="38">Playwright Browser Mode</text><text x="24" y="72">${result.benchmark.transitions} transitions / ${result.benchmark.distinctStates} states</text><text x="24" y="106">network deny · ephemeral context · explicit readiness</text><text x="24" y="140">${result.failures.map((failure) => failure.property).join(" · ")}</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Playwright Browser Atlas</title><body><h1>Playwright Browser Mode</h1><p>${result.benchmark.transitions} transitions</p><pre>${JSON.stringify(result, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const driver = new PlaywrightBrowserDriver();
try {
  assert.equal(PLAYWRIGHT_VERSION, "1.62.0");
  const boundaries = BENCHMARK_ONLY ? null : await verifyBrowserBoundaries(driver);
  const known = BENCHMARK_ONLY
    ? { failures: [], replayHash: "" }
    : await verifyKnownFailures(driver);
  const benchmark = await runBoundedTransitions(driver);
  const stable = {
    ok: true,
    framework: "browser",
    runtime: "playwright-chromium",
    playwrightVersion: PLAYWRIGHT_VERSION,
    fixture: "browser-fault-form",
    capabilities: {
      chromium: true,
      ephemeralProfile: true,
      networkDeny: true,
      serviceWorkersBlocked: true,
      downloadsDenied: true,
      permissionsDenied: true,
      routeSnapshot: true,
      focusSnapshot: true,
      storageSnapshot: true,
      consoleSnapshot: true,
      explicitReadiness: true,
      freshReplay: true,
    },
    actionCount: boundaries?.actionCount ?? 0,
    benchmark: {
      transitions: benchmark.transitions,
      distinctStates: benchmark.distinctStates,
      violationCodes: benchmark.violationCodes,
      blockedRoutes: benchmark.blockedRoutes,
    },
    failures: known.failures,
    replayHash: known.replayHash,
    diagnostics: [],
  };
  stable.semanticHash = semanticHash(stable);
  const runtime = await driver.snapshot();
  const result = {
    ...stable,
    browserVersion: runtime.browser.version,
    contextSequence: runtime.browser.contextSequence,
    benchmark: { ...stable.benchmark, elapsedMs: benchmark.elapsedMs },
  };
  writeArtifacts(result);

  if (!BENCHMARK_ONLY) {
    if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(stable, null, 2)}\n`);
    } else {
      assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stable);
    }
  }
  console.log(JSON.stringify(result));
} finally {
  await driver.dispose();
}
