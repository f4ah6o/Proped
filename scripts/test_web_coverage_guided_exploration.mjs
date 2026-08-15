#!/usr/bin/env node
import assert from "node:assert/strict";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { exploreWebCoverageGuided } from "../protocol/web-coverage-guided-exploration.mjs";

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
}));
