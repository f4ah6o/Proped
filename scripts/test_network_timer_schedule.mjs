#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEDULE_PROPERTY_CODES,
  VirtualNetworkTimerRuntime,
  buildScheduleFailure,
  exploreSchedules,
  replaySchedule,
  shrinkSchedule,
} from "../protocol/network-timer-schedule.mjs";
import { ERROR_CODES, ProtocolError, semanticHash } from "../protocol/ui-driver-v1.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/network-timer-schedule-result.json");
const OUTPUT = path.join(ROOT, "protocol/out/network-timer-schedule");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");
const SEED = 41;
const FIXTURE_NAME = "network-timer-faults";

const allFaults = () => new VirtualNetworkTimerRuntime({
  faults: {
    commitStaleResponses: true,
    commitAbortedResponses: true,
    duplicateRetryTimers: true,
    duplicateCallbacks: true,
  },
});

function findAction(runtime, predicate, label) {
  const action = runtime.actions().find(predicate);
  assert.ok(action, `missing action: ${label}`);
  return action;
}

function verifyDeniedEffects() {
  const runtime = new VirtualNetworkTimerRuntime();
  for (const kind of ["network", "timer", "filesystem", "mail", "payment", "cloud"]) {
    assert.throws(
      () => runtime.attemptExternalEffect(kind, { fixture: FIXTURE_NAME }),
      (error) => error instanceof ProtocolError && error.code === ERROR_CODES.UNSUPPORTED_EFFECT,
    );
  }
}

function verifyCorrectRuntimeIgnoresLateEffects() {
  const runtime = new VirtualNetworkTimerRuntime();
  runtime.reset(SEED, FIXTURE_NAME);
  runtime.execute(findAction(runtime, (action) =>
    action.kind === "issue" && action.input.query === "a", "issue a"));
  runtime.execute(findAction(runtime, (action) =>
    action.kind === "issue" && action.input.query === "ab", "issue ab"));
  const beforeStale = runtime.snapshot();
  const stale = runtime.execute(findAction(runtime, (action) =>
    action.kind === "deliver" && action.input.requestId === "req-1", "deliver stale req-1"));
  assert.equal(stale.snapshot.applicationState.result, beforeStale.applicationState.result);
  assert.equal(stale.violations.length, 0);

  runtime.reset(SEED, FIXTURE_NAME);
  runtime.execute(findAction(runtime, (action) => action.kind === "issue", "issue request"));
  runtime.execute(findAction(runtime, (action) => action.kind === "abort", "abort request"));
  const beforeAborted = runtime.snapshot();
  const aborted = runtime.execute(findAction(runtime, (action) => action.kind === "deliver", "late delivery"));
  assert.equal(aborted.snapshot.applicationState.result, beforeAborted.applicationState.result);
  assert.equal(aborted.violations.length, 0);

  runtime.reset(SEED, FIXTURE_NAME);
  runtime.execute(findAction(runtime, (action) => action.kind === "issue", "issue retry request"));
  runtime.execute(findAction(runtime, (action) => action.kind === "fail", "reject retry request"));
  runtime.execute(findAction(runtime, (action) => action.kind === "advance", "advance fake clock"));
  const retry = runtime.execute(findAction(runtime, (action) => action.kind === "fire", "fire retry timer"));
  assert.equal(retry.snapshot.applicationState.retryCounts["search:1"], 1);
  assert.ok(!retry.violations.some((item) =>
    item.code === SCHEDULE_PROPERTY_CODES.RETRY_BUDGET_EXCEEDED));
}

function verifyMinimalFailure(property, trace) {
  const replay = replaySchedule({ createRuntime: allFaults, trace, seed: SEED, fixture: FIXTURE_NAME });
  assert.equal(replay.ok, true);
  const item = replay.violations.find((candidate) => candidate.code === property);
  assert.ok(item, `missing violation ${property}`);
  const minimized = shrinkSchedule({
    createRuntime: allFaults,
    trace,
    property,
    seed: SEED,
    fixture: FIXTURE_NAME,
  });
  assert.deepEqual(minimized, trace);
  const second = replaySchedule({ createRuntime: allFaults, trace, seed: SEED, fixture: FIXTURE_NAME });
  assert.equal(replay.snapshot.fingerprint, second.snapshot.fingerprint);
  return buildScheduleFailure({
    fixture: FIXTURE_NAME,
    trace: minimized,
    snapshot: replay.snapshot,
    violation: item,
    seed: SEED,
  });
}

function verifyKnownFailures() {
  const stale = verifyMinimalFailure(SCHEDULE_PROPERTY_CODES.STALE_RESPONSE, [
    'issue|network|search|query="a"',
    'issue|network|search|query="ab"',
    "deliver|network|req-1",
  ]);
  const aborted = verifyMinimalFailure(SCHEDULE_PROPERTY_CODES.ABORTED_RESPONSE_COMMIT, [
    'issue|network|search|query="a"',
    "abort|network|req-1",
    "deliver|network|req-1",
  ]);
  const retry = verifyMinimalFailure(SCHEDULE_PROPERTY_CODES.RETRY_BUDGET_EXCEEDED, [
    'issue|network|search|query="a"',
    "fail|network|req-1",
    "advance|timer|to=100",
    "fire|timer|timer-1",
    "fire|timer|timer-2",
  ]);
  const callback = verifyMinimalFailure(SCHEDULE_PROPERTY_CODES.CALLBACK_COUNT_EXCEEDED, [
    'issue|network|search|query="a"',
    "deliver|network|req-1",
  ]);
  return [aborted, callback, retry, stale].sort((left, right) =>
    left.property.localeCompare(right.property)
  );
}

function writeArtifacts(result) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "network-timer-schedule",
    states: result.exploration.states,
    transitions: result.exploration.transitions,
    failures: result.failures,
    diagnostics: result.diagnostics,
    semanticHash: result.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    'digraph network_timer { issue -> stale [label="response order"]; issue -> aborted [label="abort/deliver"]; fail -> retry [label="timer/timer"]; issue -> callback [label="deliver x2"]; }\n',
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="190"><rect width="100%" height="100%" fill="white"/><text x="24" y="38">Network / Timer Schedule</text><text x="24" y="74">${result.exploration.transitions} transitions / ${result.exploration.states} states</text><text x="24" y="110">${result.failures.map((failure) => failure.property).join(" · ")}</text><text x="24" y="146">real network denied · fake clock ${result.policy.retryDelayMs}ms</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Network Timer Atlas</title><body><h1>Network / Timer Schedule</h1><p>${result.exploration.transitions} transitions</p><pre>${JSON.stringify(result.failures, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

verifyDeniedEffects();
verifyCorrectRuntimeIgnoresLateEffects();
const failures = verifyKnownFailures();
const exploration = exploreSchedules({
  createRuntime: allFaults,
  seed: SEED,
  fixture: FIXTURE_NAME,
  maxDepth: 6,
  maxTransitions: 2_000,
});
assert.equal(exploration.truncated, true);
assert.equal(exploration.depthBoundReached, true);
assert.equal(exploration.transitionLimitReached, false);
assert.equal(exploration.transitions, 580);
for (const property of Object.values(SCHEDULE_PROPERTY_CODES)) {
  assert.ok(exploration.failures.some((failure) => failure.property === property),
    `exploration did not discover ${property}`);
}

const stable = {
  ok: true,
  runtime: "virtual-network-timer",
  fixture: FIXTURE_NAME,
  seed: SEED,
  policy: {
    realNetwork: "deny",
    realTimers: "deny",
    retryBudget: 1,
    retryDelayMs: 100,
  },
  bounds: {
    inputCorpus: ["a", "ab"],
    maxGenerations: 2,
    maxDepth: exploration.maxDepth,
    maxTransitions: exploration.maxTransitions,
  },
  exploration: {
    transitions: exploration.transitions,
    states: exploration.states,
    truncated: exploration.truncated,
    depthBoundReached: exploration.depthBoundReached,
    transitionLimitReached: exploration.transitionLimitReached,
  },
  failures,
  diagnostics: [],
};
stable.semanticHash = semanticHash(stable);
writeArtifacts(stable);

if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(stable, null, 2)}\n`);
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stable);
}
console.log(JSON.stringify(stable));
