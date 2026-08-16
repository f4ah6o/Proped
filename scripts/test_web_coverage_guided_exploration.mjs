#!/usr/bin/env node
import assert from "node:assert/strict";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { exploreWebCoverageGuided, replayWebCheckpointedTrace } from "../protocol/web-coverage-guided-exploration.mjs";
import { runWebExplorationReplayGate } from "../protocol/web-exploration-replay-gate.mjs";

class SyntheticCoverageDriver {
  constructor() { this.state = "home"; this.resetCount = 0; this.actionsCount = 0; }
  snapshot() {
    const route = this.state === "admin" || this.state === "crashed" ? "/admin" : "/";
    return {
      fingerprint: semanticHash({ state: this.state }),
      url: `http://app.local${route}`,
      storage: { local: {}, session: {} },
      applicationState: null,
    };
  }
  async reset() { this.resetCount += 1; this.state = "home"; return this.snapshot(); }
  async actions() {
    this.actionsCount += 1;
    const action = (id, kind, role, name) => ({ id, kind, target: { role, name, within: [] } });
    const actions = {
      home: [
        action("a-noise", "click", "button", "Increment"),
        action("z-admin", "click", "link", "Admin"),
      ],
      noise: [action("a-noise", "click", "button", "Increment")],
      admin: [action("m-crash", "click", "button", "Crash")],
      crashed: [],
    }[this.state];
    return { actions, diagnostics: [], metrics: {} };
  }
  async execute(action) {
    const violations = [];
    if (this.state === "home" && action.id === "a-noise") this.state = "noise";
    else if (this.state === "home" && action.id === "z-admin") this.state = "admin";
    else if (this.state === "noise" && action.id === "a-noise") this.state = "noise";
    else if (this.state === "admin" && action.id === "m-crash") {
      this.state = "crashed";
      violations.push({ property: "browser_uncaught_exception", message: "TypeError: synthetic crash" });
    } else throw new Error(`unexpected transition ${this.state} / ${action.id}`);
    return { snapshot: this.snapshot(), violations };
  }
}

const firstDriver = new SyntheticCoverageDriver();
const first = await exploreWebCoverageGuided(firstDriver, { maxStates: 10, maxTransitions: 3, maxDepth: 4 });
assert.equal(first.states, 3);
assert.equal(first.transitions, 3);
assert.deepEqual(first.transitionGraph.map((edge) => edge.actionId), ["a-noise", "z-admin", "m-crash"]);
assert.equal(first.routeFamilies.length, 2);
assert.equal(first.failureCount, 1);
assert.equal(first.failures[0].property, "browser_uncaught_exception");
assert.equal(first.frontierExhausted, false);
assert.equal(first.truncatedByTransitionLimit, true);
assert.equal(firstDriver.resetCount, 2, "the initial frontier and directly reached admin frontier must reuse the live trace instead of resetting again");
assert.equal(firstDriver.actionsCount, 5, "live frontier reuse must carry forward the action inventory already observed for the current state");

const second = await exploreWebCoverageGuided(new SyntheticCoverageDriver(), { maxStates: 10, maxTransitions: 3, maxDepth: 4 });
assert.equal(second.semanticHash, first.semanticHash);
assert.deepEqual(second.transitionGraph, first.transitionGraph);

class SyntheticDriftDriver extends SyntheticCoverageDriver {
  constructor() { super(); this.driftPending = false; }
  snapshot() {
    const stable = super.snapshot();
    if (this.driftPending && this.state === "admin") {
      this.driftPending = false;
      return { ...stable, fingerprint: semanticHash({ state: this.state, delayedDrift: true }) };
    }
    if (this.driftPending && this.state !== "admin") this.driftPending = false;
    return stable;
  }
  async execute(action) {
    const result = await super.execute(action);
    if (action.id === "z-admin") this.driftPending = true;
    return result;
  }
}

const driftDriver = new SyntheticDriftDriver();
const drift = await exploreWebCoverageGuided(driftDriver, { maxStates: 10, maxTransitions: 3, maxDepth: 4 });
assert.equal(drift.semanticHash, first.semanticHash, "a drifted live snapshot must fall back to deterministic reset/replay instead of changing the graph");
assert.deepEqual(drift.transitionGraph, first.transitionGraph);
assert.equal(driftDriver.resetCount, 3, "live fingerprint drift must force one additional reset/replay before the admin frontier action");

class SyntheticSafetyDriver {
  constructor() { this.state = "home"; }
  snapshot() { return { fingerprint: semanticHash({ state: this.state }), url: "http://app.local/", storage: { local: {}, session: {} }, applicationState: null }; }
  async reset() { this.state = "home"; return this.snapshot(); }
  async actions() {
    return { actions: [
      { id: "safe-open", kind: "click", target: { role: "button", name: "Open", within: [] }, destructiveRisk: "safe" },
      { id: "delete-account", kind: "click", target: { role: "button", name: "Delete account", within: [] }, destructiveRisk: "destructive" },
    ], diagnostics: [], metrics: {} };
  }
  async execute(action) {
    if (action.id === "delete-account") throw new Error("destructive action must never execute");
    this.state = "opened";
    return { snapshot: this.snapshot(), violations: [] };
  }
}

const safety = await exploreWebCoverageGuided(new SyntheticSafetyDriver(), {
  maxStates: 4, maxTransitions: 2, maxDepth: 2,
  actionFilter: (action) => action.destructiveRisk === "safe",
});
assert.ok(safety.transitionGraph.length >= 1);
assert.ok(safety.transitionGraph.every((edge) => edge.actionId !== "delete-account"));

const bounded = await exploreWebCoverageGuided(new SyntheticCoverageDriver(), { maxStates: 10, maxTransitions: 2, maxDepth: 4 });
assert.equal(bounded.failureCount, 0);
assert.equal(bounded.truncatedByTransitionLimit, true);

class SyntheticExecutionFailureDriver {
  constructor() { this.state = "home"; }
  snapshot() { return { fingerprint: semanticHash({ state: this.state }), url: "http://app.local/", storage: { local: {}, session: {} }, applicationState: null }; }
  async reset() { this.state = "home"; return this.snapshot(); }
  async actions() {
    return { actions: [{ id: "unstable-check", kind: "check", target: { role: "checkbox", name: "Done", within: [] }, destructiveRisk: "bounded-mutation" }], diagnostics: [], metrics: {} };
  }
  async execute() { throw new Error("synthetic action execution timeout"); }
}

const executionFailure = await exploreWebCoverageGuided(new SyntheticExecutionFailureDriver(), { maxStates: 4, maxTransitions: 2, maxDepth: 2 });
assert.equal(executionFailure.failureCount, 0, "driver execution errors are exploration diagnostics, not application failures");
assert.ok(executionFailure.diagnostics.some((item) => item.code === "frontier_action_execution_failed"));

class SyntheticCheckpointDriver {
  constructor(checkpointPrefix = "checkpoint") {
    this.checkpointPrefix = checkpointPrefix;
    this.runtime = "shared";
    this.environment = { value: 0 };
    this.checkpoints = new Map();
    this.checkpointSerial = 0;
    this.restoreLog = [];
  }
  environmentStateId() { return semanticHash(this.environment); }
  snapshot() {
    return {
      fingerprint: semanticHash({ runtime: this.runtime }),
      url: "http://stateful.local/",
      storage: { local: {}, session: {} },
      applicationState: null,
    };
  }
  action(id, name) {
    return { id, kind: "click", target: { role: "button", name, within: [] }, destructiveRisk: "bounded-mutation" };
  }
  async reset() {
    // Runtime reset is deliberately separate from the external environment.
    this.runtime = "shared";
    return this.snapshot();
  }
  async checkpoint() {
    const checkpointId = `${this.checkpointPrefix}:${++this.checkpointSerial}`;
    this.checkpoints.set(checkpointId, structuredClone(this.environment));
    return { checkpointId, environmentStateId: this.environmentStateId() };
  }
  async restoreCheckpoint(checkpointId) {
    const saved = this.checkpoints.get(checkpointId);
    if (!saved) throw new Error(`unknown checkpoint ${checkpointId}`);
    this.environment = structuredClone(saved);
    const environmentStateId = this.environmentStateId();
    this.restoreLog.push({ checkpointId, environmentStateId });
    return { environmentStateId };
  }
  async actions() {
    let actions = [];
    if (this.runtime === "shared") {
      actions = this.environment.value === 0
        ? [this.action("a-write", "Write"), this.action("b-read", "Read")]
        : [this.action("b-read", "Read")];
    } else if (this.runtime === "one") {
      actions = [this.action("c-recover", "Recover")];
    }
    return { actions, diagnostics: [], metrics: {} };
  }
  async execute(action) {
    const violations = [];
    if (this.runtime === "shared" && action.id === "a-write" && this.environment.value === 0) {
      this.environment = { value: 1 };
    } else if (this.runtime === "shared" && action.id === "b-read") {
      this.runtime = this.environment.value === 0 ? "zero" : "one";
    } else if (this.runtime === "one" && action.id === "c-recover" && this.environment.value === 1) {
      this.runtime = "shared";
      violations.push({
        code: "synthetic_stateful_recovery",
        message: "synthetic checkpoint recovery evidence",
        evidence: { condition: "recovered" },
      });
    } else {
      throw new Error(`unexpected stateful transition ${this.runtime}/${this.environment.value}/${action.id}`);
    }
    return { snapshot: this.snapshot(), violations };
  }
}

const checkpointDriver = new SyntheticCheckpointDriver("first-run");
const checkpointRun = await exploreWebCoverageGuided(checkpointDriver, { maxStates: 8, maxTransitions: 8, maxDepth: 4 });
assert.equal(checkpointRun.checkpointAware, true);
assert.equal(checkpointRun.checkpointVersion, "1");
assert.equal(checkpointRun.failureCount, 1);
assert.equal(checkpointRun.failures[0].code, "synthetic_stateful_recovery");
assert.equal(checkpointRun.diagnostics.length, 0);
const sharedFingerprint = semanticHash({ runtime: "shared" });
const sharedStates = checkpointRun.stateTraces.filter((state) => state.fingerprint === sharedFingerprint);
assert.equal(sharedStates.length, 2, "identical runtime fingerprints with distinct environment versions must remain distinct states");
assert.notEqual(sharedStates[0].environmentStateId, sharedStates[1].environmentStateId);
assert.notEqual(sharedStates[0].identity, sharedStates[1].identity);
const readTransitions = checkpointRun.transitionGraph.filter((edge) => edge.actionId === "b-read");
assert.equal(readTransitions.length, 2);
assert.equal(new Set(readTransitions.map((edge) => edge.runtimeFrom)).size, 1, "both reads start from the same runtime fingerprint");
assert.equal(new Set(readTransitions.map((edge) => edge.environmentBefore)).size, 2, "reads must retain distinct environment identities");
assert.equal(new Set(readTransitions.map((edge) => edge.runtimeTo)).size, 2, "the same runtime/action pair must reach different successors under different environment states");
const initialState = checkpointRun.stateTraces.find((state) => state.trace.length === 0);
const initialRead = readTransitions.find((edge) => edge.from === initialState.identity);
assert.equal(initialRead.runtimeTo, semanticHash({ runtime: "zero" }), "sibling read must start from the unmodified parent checkpoint");
const writeTransition = checkpointRun.transitionGraph.find((edge) => edge.actionId === "a-write");
assert.equal(writeTransition.environmentEffect, "environment_changed");
assert.ok(readTransitions.every((edge) => edge.environmentEffect === "unchanged"));
const environmentOneShared = sharedStates.find((state) => state.environmentStateId === writeTransition.environmentAfter);
const recovery = checkpointRun.transitionGraph.find((edge) => edge.actionId === "c-recover");
assert.equal(recovery.to, environmentOneShared.identity, "persisted environment state must support a deterministic jump to a known earlier runtime state");
assert.equal(recovery.environmentEffect, "unchanged");
assert.ok(checkpointDriver.restoreLog.length >= 4, "candidate exploration must restore checkpoints rather than sharing branch mutation");
const checkpointEvidenceJson = JSON.stringify({
  checkpointProvenance: checkpointRun.checkpointProvenance,
  transitionGraph: checkpointRun.transitionGraph,
  stateTraces: checkpointRun.stateTraces,
  checkpointReplay: checkpointRun.failures[0].checkpointReplay,
});
assert.equal(checkpointEvidenceJson.includes('"value"'), false, "checkpoint evidence must not expose external-state contents");

const replayedRecovery = await replayWebCheckpointedTrace(checkpointDriver, {
  initialCheckpoint: checkpointRun.checkpointProvenance,
  trace: checkpointRun.failures[0].trace,
  expectedTransitions: checkpointRun.failures[0].checkpointReplay.transitions,
  expectedFinalIdentity: recovery.to,
});
assert.equal(replayedRecovery.ok, true, JSON.stringify(replayedRecovery.diagnostic ?? null));
assert.deepEqual(replayedRecovery.transitionEvidence, checkpointRun.failures[0].checkpointReplay.transitions);

const checkpointReplayGate = await runWebExplorationReplayGate({ driver: checkpointDriver, exploration: checkpointRun, attempts: 2 });
assert.equal(checkpointReplayGate.stableFailureCount, 1);
assert.equal(checkpointReplayGate.deterministic, true);
assert.equal(checkpointReplayGate.replayProjectionDeterministic, true, "checkpoint-aware replay must reproduce the same extended-state transitions");

const secondCheckpointRun = await exploreWebCoverageGuided(new SyntheticCheckpointDriver("different-opaque-handles"), { maxStates: 8, maxTransitions: 8, maxDepth: 4 });
assert.equal(secondCheckpointRun.semanticHash, checkpointRun.semanticHash, "opaque checkpoint handles must not affect deterministic exploration evidence");
assert.notEqual(secondCheckpointRun.checkpointProvenance.checkpointId, checkpointRun.checkpointProvenance.checkpointId);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-coverage-guided-exploration-test",
  states: first.states,
  transitions: first.transitions,
  routeFamilies: first.routeFamilies,
  actionOrder: first.transitionGraph.map((edge) => edge.actionId),
  deterministic: second.semanticHash === first.semanticHash,
  failureProperty: first.failures[0].property,
  destructiveFiltered: safety.transitionGraph.every((edge) => edge.actionId !== "delete-account"),
  liveFrontierResetCount: firstDriver.resetCount,
  liveFrontierActionsCount: firstDriver.actionsCount,
  driftFallbackResetCount: driftDriver.resetCount,
  executionFailureDiagnostic: executionFailure.diagnostics.find((item) => item.code === "frontier_action_execution_failed")?.code ?? null,
  checkpointAwareStates: checkpointRun.states,
  checkpointReadSuccessors: readTransitions.map((edge) => edge.runtimeTo),
  checkpointReplayDeterministic: checkpointReplayGate.replayProjectionDeterministic,
}));
