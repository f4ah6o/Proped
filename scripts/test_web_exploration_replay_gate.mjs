#!/usr/bin/env node
import assert from "node:assert/strict";
import { classifyWebFinding, groupWebFindings } from "../protocol/web-finding-group.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import {
  replayWebExplorationFailureCampaign,
  runWebExplorationReplayGate,
} from "../protocol/web-exploration-replay-gate.mjs";

class ReplayDriver {
  constructor({ flaky = false, diagnosticProvenance = null, violationCode = "browser_uncaught_exception" } = {}) {
    this.flaky = flaky;
    this.diagnosticProvenance = diagnosticProvenance;
    this.violationCode = violationCode;
    this.run = 0;
    this.state = "home";
  }
  snapshot() {
    return {
      fingerprint: semanticHash({ state: this.state, run: this.flaky ? this.run : 0 }),
      url: this.state === "open" ? "http://127.0.0.1:43123/items/98765" : "http://127.0.0.1:43123/",
    };
  }
  async reset() { this.run += 1; this.state = "home"; return this.snapshot(); }
  async actions() {
    return { actions: [
      { id: "open", kind: "click", target: { role: "button", name: "Open", within: [] } },
      { id: "crash", kind: "click", target: { role: "button", name: "Crash", within: [] } },
    ] };
  }
  async execute(action) {
    if (action.id === "open") this.state = "open";
    const violations = [];
    if (action.id === "crash" && (!this.flaky || this.run % 2 === 1)) {
      violations.push({
        code: this.violationCode,
        message: "TypeError: synthetic item 98765",
        evidence: { errors: ["TypeError: synthetic item 98765"] },
        ...(this.diagnosticProvenance ? { diagnosticProvenance: this.diagnosticProvenance } : {}),
      });
    }
    return { snapshot: this.snapshot(), violations };
  }
}

const failure = {
  code: "browser_uncaught_exception",
  message: "synthetic",
  evidence: { errors: ["TypeError"] },
  trace: ["open", "crash"],
};
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

const strongProvenance = {
  name: "TypeError",
  message: "TypeError: synthetic item 12345",
  topProjectFrame: { sourcePath: "src/items.js", function: "openItem", line: 42, column: 7 },
};
const equivalentProvenance = {
  name: "TypeError",
  message: "TypeError: synthetic item 98765",
  topProjectFrame: { sourcePath: "src/items.js", function: "openItem", line: 42, column: 7 },
};
const differentProvenance = {
  name: "TypeError",
  message: "TypeError: synthetic item 98765",
  topProjectFrame: { sourcePath: "src/other.js", function: "openItem", line: 42, column: 7 },
};
const strongFailure = {
  code: "browser_uncaught_exception",
  message: "TypeError: synthetic item 12345",
  route: "/items/12345",
  diagnosticProvenance: strongProvenance,
  trace: ["open", "crash"],
};
const equivalentFinding = {
  code: "unhandled_exception",
  message: "TypeError: synthetic item 98765",
  route: "/items/98765",
  diagnosticProvenance: equivalentProvenance,
  trace: ["crash"],
};
const differentFinding = {
  ...equivalentFinding,
  diagnosticProvenance: differentProvenance,
};
const strongA = classifyWebFinding(strongFailure);
const strongB = classifyWebFinding(equivalentFinding);
const strongDifferent = classifyWebFinding(differentFinding);
assert.equal(strongA.grouping, "strong");
assert.equal(strongA.id, strongB.id);
assert.notEqual(strongA.canonicalFailureClassId, strongB.canonicalFailureClassId);
assert.notEqual(strongA.id, strongDifferent.id);

const grouped = groupWebFindings([strongFailure, equivalentFinding, differentFinding]);
assert.equal(grouped.groupCount, 2);
assert.equal(grouped.strongGroupCount, 2);
assert.equal(grouped.singletonGroupCount, 0);
assert.equal(grouped.groups.find((group) => group.id === strongA.id).count, 2);

const unsafeAbsolutePath = classifyWebFinding({
  ...strongFailure,
  diagnosticProvenance: {
    ...strongProvenance,
    topProjectFrame: { ...strongProvenance.topProjectFrame, sourcePath: "/Users/alice/project/src/items.js" },
  },
});
assert.equal(unsafeAbsolutePath.grouping, "singleton");

const sameFindingReplay = await replayWebExplorationFailureCampaign(
  new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  [strongFailure],
);
assert.equal(sameFindingReplay.failures.length, 1);

const differentFindingReplay = await replayWebExplorationFailureCampaign(
  new ReplayDriver({ diagnosticProvenance: differentProvenance }),
  [strongFailure],
);
assert.equal(differentFindingReplay.failures.length, 0);
assert.equal(differentFindingReplay.diagnostics[0].findingGroupId, strongA.id);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-exploration-replay-gate-test",
  stableFailureCount: stable.stableFailureCount,
  flakyPromoted: flaky.stableFailureCount,
  attempts: stable.attempts,
  findingGroupCount: grouped.groupCount,
  sameFindingReplay: sameFindingReplay.failures.length,
  differentFindingReplay: differentFindingReplay.failures.length,
}));
