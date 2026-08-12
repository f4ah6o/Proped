#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildPropertyFailure } from "../../protocol/web-property-pack.mjs";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";
import { ReactComponentDriver } from "./react-component-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUTPUT = path.join(HERE, "out");
const FIXTURE = path.join(
  ROOT,
  "protocol/fixtures/react-component-mode-result.json",
);
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");
const BENCHMARK_ONLY = process.argv.includes("--benchmark-only");
const BENCHMARK_MAX_MS = (() => {
  const raw = process.env.PROPED_COMPONENT_BENCHMARK_MAX_MS ?? "60000";
  const value = Number.parseInt(raw, 10);
  assert.ok(Number.isInteger(value) && value >= 60_000, `invalid PROPED_COMPONENT_BENCHMARK_MAX_MS: ${raw}`);
  return value;
})();

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
  await driver.reset(7, "react-fault-form");
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

async function verifyKnownFailures(driver) {
  await driver.reset(7, "react-fault-form");
  const initialActions = await driver.actions();
  assert.equal(initialActions.diagnostics.length, 0);

  const typeSearchA = findAction(
    initialActions,
    (action) => action.kind === "type" &&
      action.target.role === "searchbox" && action.input === "a",
    "type Search a",
  );
  const typeSearchAB = findAction(
    initialActions,
    (action) => action.kind === "type" &&
      action.target.role === "searchbox" && action.input === "ab",
    "type Search ab",
  );
  const submit = findAction(
    initialActions,
    (action) => action.kind === "submit" && action.target.name === "Profile",
    "submit Profile",
  );

  const corpus = initialActions.actions
    .filter((action) => action.kind === "type" && action.target.name === "Search")
    .map((action) => action.input);
  for (const expected of ["", " ", "invalid", "😀"]) {
    assert.ok(corpus.includes(expected), `input corpus missing ${JSON.stringify(expected)}`);
  }

  await driver.execute(typeSearchA);
  await driver.execute(typeSearchAB);
  const pendingActions = await driver.actions();
  const staleDelivery = findAction(
    pendingActions,
    (action) => action.kind === "inject" &&
      action.target.name === "Search response" && action.input.generation === 1,
    "stale search delivery",
  );
  const staleResult = await driver.execute(staleDelivery);
  const staleViolation = staleResult.violations.find(
    (item) => item.code === "stale_response",
  );
  assert.ok(staleViolation);

  const staleTrace = [typeSearchA.id, typeSearchAB.id, staleDelivery.id];
  const minimizedStale = await shrinkTrace(driver, staleTrace, "stale_response");
  assert.deepEqual(minimizedStale, staleTrace);

  await driver.reset(7, "react-fault-form");
  const submitAction = await findActionById(driver, submit.id);
  await driver.execute(submitAction);
  const duplicateResult = await driver.execute(
    await findActionById(driver, submit.id),
  );
  const duplicateViolation = duplicateResult.violations.find(
    (item) => item.code === "duplicate_submit",
  );
  assert.ok(duplicateViolation);
  const duplicateTrace = [submit.id, submit.id];
  const minimizedDuplicate = await shrinkTrace(
    driver,
    duplicateTrace,
    "duplicate_submit",
  );
  assert.deepEqual(minimizedDuplicate, duplicateTrace);

  await driver.reset(7, "react-fault-form");
  const invalidNumber = findAction(
    await driver.actions(),
    (action) => action.kind === "type" &&
      action.target.role === "spinbutton" && action.input === "invalid",
    "invalid number",
  );
  const beforeInvalid = driver.snapshot();
  const invalidResult = await driver.execute(invalidNumber);
  assert.equal(beforeInvalid.applicationState.numberResult, 4);
  assert.equal(invalidResult.snapshot.applicationState.numberResult, 0);

  const staleFailure = buildPropertyFailure({
    fixture: "react-fault-form",
    trace: minimizedStale,
    snapshot: staleResult.snapshot,
    violation: staleViolation,
    seed: 7,
  });
  const duplicateFailure = buildPropertyFailure({
    fixture: "react-fault-form",
    trace: minimizedDuplicate,
    snapshot: duplicateResult.snapshot,
    violation: duplicateViolation,
    seed: 7,
  });
  const invalidFailure = {
    property: "invalid_input_preserves_previous_result",
    message: "invalid numeric input destroyed the previous valid result",
    trace: [invalidNumber.id],
    semanticHash: semanticHash({
      fixture: "react-fault-form",
      property: "invalid_input_preserves_previous_result",
      trace: [invalidNumber.id],
      before: 4,
      after: 0,
    }),
  };

  const replayOne = await replayForViolation(driver, staleTrace, "stale_response");
  const firstHash = driver.snapshot().fingerprint;
  const replayTwo = await replayForViolation(driver, staleTrace, "stale_response");
  const secondHash = driver.snapshot().fingerprint;
  assert.ok(replayOne && replayTwo);
  assert.equal(firstHash, secondHash);

  return {
    actionCount: initialActions.actions.length,
    corpus,
    failures: [staleFailure, duplicateFailure, invalidFailure],
    replayHash: firstHash,
  };
}

async function runBenchmark(driver, transitions = 10_000) {
  await driver.reset(131, "react-fault-form");
  let stable = await driver.actions();
  let typeA = findAction(
    stable,
    (action) => action.kind === "type" && action.target.name === "Search" &&
      action.input === "a",
    "benchmark type a",
  );
  let typeAB = findAction(
    stable,
    (action) => action.kind === "type" && action.target.name === "Search" &&
      action.input === "ab",
    "benchmark type ab",
  );
  let submit = findAction(
    stable,
    (action) => action.kind === "submit" && action.target.name === "Profile",
    "benchmark submit",
  );
  const states = new Set([driver.snapshot().fingerprint]);
  const violationCodes = new Set();
  const started = performance.now();

  for (let index = 0; index < transitions; index += 1) {
    if (index > 0 && index % 500 === 0) {
      await driver.reset(131, "react-fault-form");
      stable = await driver.actions();
      typeA = findAction(stable, (action) => action.id === typeA.id, "reset type a");
      typeAB = findAction(stable, (action) => action.id === typeAB.id, "reset type ab");
      submit = findAction(stable, (action) => action.id === submit.id, "reset submit");
    }

    let action;
    if (index % 11 === 10) {
      const dynamic = await driver.actions();
      action = dynamic.actions.find((candidate) =>
        candidate.kind === "inject" && candidate.target.name === "Submit response"
      );
    }
    if (!action && index % 7 === 6) {
      const dynamic = await driver.actions();
      action = dynamic.actions.find((candidate) =>
        candidate.kind === "inject" && candidate.target.name === "Search response"
      );
    }
    if (!action && index % 5 === 4) action = submit;
    if (!action) action = index % 2 === 0 ? typeA : typeAB;

    const result = await driver.execute(action);
    states.add(result.snapshot.fingerprint);
    for (const violation of result.violations) violationCodes.add(violation.code);
  }

  const elapsedMs = Math.round(performance.now() - started);
  assert.equal(transitions, 10_000);
  assert.ok(elapsedMs < BENCHMARK_MAX_MS, `React benchmark exceeded ${BENCHMARK_MAX_MS}ms: ${elapsedMs}ms`);
  return {
    transitions,
    distinctStates: states.size,
    violationCodes: [...violationCodes].sort(),
    elapsedMs,
  };
}

function writeArtifacts(result) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUTPUT, "summary.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  const atlas = {
    schemaVersion: 2,
    strategy: "react-component-mode",
    states: result.benchmark.distinctStates,
    transitions: result.benchmark.transitions,
    failures: result.failures,
    diagnostics: result.diagnostics,
    semanticHash: result.semanticHash,
  };
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.json"),
    `${JSON.stringify(atlas, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    "digraph react_component { initial -> stale [label=\"type/type/deliver\"]; initial -> duplicate [label=\"submit/submit\"]; initial -> invalid [label=\"type invalid\"]; }\n",
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="180"><rect width="100%" height="100%" fill="white"/><text x="24" y="38">React Component Mode</text><text x="24" y="72">${result.benchmark.transitions} transitions / ${result.benchmark.distinctStates} states</text><text x="24" y="106">${result.failures.map((failure) => failure.property).join(" · ")}</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>React Component Atlas</title><body><h1>React Component Mode</h1><p>${result.benchmark.transitions} transitions</p><pre>${JSON.stringify(result.failures, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const driver = new ReactComponentDriver();
try {
  const known = BENCHMARK_ONLY
    ? { actionCount: 0, corpus: [], failures: [], replayHash: "" }
    : await verifyKnownFailures(driver);
  const benchmark = await runBenchmark(driver);
  const stable = {
    ok: true,
    framework: "react",
    runtime: "component",
    actionCount: known.actionCount,
    corpus: known.corpus,
    benchmark: {
      transitions: benchmark.transitions,
      distinctStates: benchmark.distinctStates,
      violationCodes: benchmark.violationCodes,
    },
    failures: known.failures,
    replayHash: known.replayHash,
    diagnostics: [],
  };
  stable.semanticHash = semanticHash(stable);
  const result = { ...stable, benchmark: { ...stable.benchmark, elapsedMs: benchmark.elapsedMs } };
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
