#!/usr/bin/env node
import assert from "node:assert/strict";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { runWebExplorationReplayGate } from "../protocol/web-exploration-replay-gate.mjs";

class ReplayDriver {
  constructor({ flaky = false } = {}) { this.flaky = flaky; this.run = 0; this.state = "home"; }
  snapshot() { return { fingerprint: semanticHash({ state: this.state, run: this.flaky ? this.run : 0 }) }; }
  async reset() { this.run += 1; this.state = "home"; return this.snapshot(); }
  async actions() { return { actions: [{ id: "open", kind: "click", target: { role: "button", name: "Open", within: [] } }, { id: "crash", kind: "click", target: { role: "button", name: "Crash", within: [] } }] }; }
  async execute(action) {
    if (action.id === "open") this.state = "open";
    const violations = [];
    if (action.id === "crash" && (!this.flaky || this.run % 2 === 1)) violations.push({ code: "browser_uncaught_exception", message: "synthetic", evidence: { errors: ["TypeError"] } });
    return { snapshot: this.snapshot(), violations };
  }
}

const failure = { code: "browser_uncaught_exception", message: "synthetic", evidence: { errors: ["TypeError"] }, trace: ["open", "crash"] };
const stable = await runWebExplorationReplayGate({ driver: new ReplayDriver(), exploration: { failures: [failure], semanticHash: "initial" }, attempts: 3 });
assert.equal(stable.stableFailureCount, 1);
assert.equal(stable.unstableCandidates.length, 0);
assert.equal(stable.attempts, 3);

const flaky = await runWebExplorationReplayGate({ driver: new ReplayDriver({ flaky: true }), exploration: { failures: [failure], semanticHash: "initial" }, attempts: 3 });
assert.equal(flaky.stableFailureCount, 0);
assert.equal(flaky.unstableCandidates.length, 1);
assert.equal(flaky.ok, true);

const clean = await runWebExplorationReplayGate({ driver: new ReplayDriver(), exploration: { failures: [], semanticHash: "clean" }, attempts: 3 });
assert.equal(clean.stableFailureCount, 0);
assert.equal(clean.deterministic, true);

console.log(JSON.stringify({ ok: true, runtime: "web-exploration-replay-gate-test", stableFailureCount: stable.stableFailureCount, flakyPromoted: flaky.stableFailureCount, attempts: stable.attempts }));
