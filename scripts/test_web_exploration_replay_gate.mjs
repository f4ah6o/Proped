#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  classifyWebFinding,
  groupWebFindings,
  selectWebFindingRepresentative,
} from "../protocol/web-finding-group.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { analyzeWebActionableFindings } from "../protocol/web-actionable-finding.mjs";
import {
  replayWebExplorationFailureCampaign,
  runWebExplorationReplayGate,
  shrinkWebExplorationFailureTrace,
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
    if (action.id === "open" || action.id === "crash") this.state = "open";
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
  topProjectFrame: { sourcePath: "src/items.js", projectOwned: true, function: "openItem", line: 42, column: 7 },
};
const equivalentProvenance = {
  name: "TypeError",
  message: "TypeError: synthetic item 98765",
  topProjectFrame: { sourcePath: "src/items.js", projectOwned: true, function: "openItem", line: 42, column: 7 },
};
const differentProvenance = {
  name: "TypeError",
  message: "TypeError: synthetic item 98765",
  topProjectFrame: { sourcePath: "src/other.js", projectOwned: true, function: "openItem", line: 42, column: 7 },
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
assert.deepEqual(grouped.groups.find((group) => group.id === strongA.id).representative.trace, ["crash"]);

const representative = selectWebFindingRepresentative([strongFailure, equivalentFinding]);
assert.equal(representative.findingGroupId, strongA.id);
assert.deepEqual(representative.trace, ["crash"]);
assert.equal(representative.traceLength, 1);

const unownedFrame = classifyWebFinding({
  ...strongFailure,
  diagnosticProvenance: {
    ...strongProvenance,
    topProjectFrame: { ...strongProvenance.topProjectFrame, projectOwned: false },
  },
});
assert.equal(unownedFrame.grouping, "singleton");

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

const shrunk = await shrinkWebExplorationFailureTrace(
  new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  strongFailure,
  { budget: 16 },
);
assert.deepEqual(shrunk.trace, ["crash"]);
assert.equal(shrunk.originalLength, 2);
assert.equal(shrunk.length, 1);
assert.equal(shrunk.minimality, "one-minimal");
assert.equal(shrunk.findingGroupId, strongA.id);

const exhaustedShrink = await shrinkWebExplorationFailureTrace(
  new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  strongFailure,
  { budget: 1 },
);
assert.deepEqual(exhaustedShrink.trace, ["crash"]);
assert.equal(exhaustedShrink.minimality, "budget-exhausted");
assert.equal(exhaustedShrink.evaluations, 1);

const actionableExploration = { failures: [strongFailure, equivalentFinding], semanticHash: "actionable" };
const actionableGate = await runWebExplorationReplayGate({
  driver: new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  exploration: actionableExploration,
  attempts: 3,
});
const actionableAnalysis = await analyzeWebActionableFindings({
  driver: new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  exploration: actionableExploration,
  explorationReplayGate: actionableGate,
  shrinkBudget: 16,
});
assert.equal(actionableAnalysis.eligibleFindingGroupCount, 1);
assert.equal(actionableAnalysis.metrics.deterministicFindingGroups, 1);
assert.equal(actionableAnalysis.metrics.actionableFindingGroups, 1);
assert.equal(actionableAnalysis.metrics.actionableFindingRate, 1);
assert.equal(actionableAnalysis.metrics.oneMinimalFindingGroups, 1);
assert.equal(actionableAnalysis.findings[0].actionable, true);
assert.equal(actionableAnalysis.findings[0].occurrenceCount, 2);
assert.equal(actionableAnalysis.findings[0].representativeReplay.minimality, "one-minimal");
assert.deepEqual(actionableAnalysis.findings[0].representativeReplay.trace, ["crash"]);

const scopedAnalysis = await analyzeWebActionableFindings({
  driver: new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  exploration: {
    failures: [
      ...actionableExploration.failures,
      { code: "reload_persistence_storage_drift", message: "not a browser-exception finding", trace: ["open"] },
    ],
    semanticHash: "actionable-plus-out-of-scope",
  },
  explorationReplayGate: actionableGate,
  shrinkBudget: 16,
});
assert.equal(scopedAnalysis.eligibleFindingGroupCount, 1);
assert.equal(scopedAnalysis.metrics.actionableFindingRate, 1);

const budgetAnalysis = await analyzeWebActionableFindings({
  driver: new ReplayDriver({ diagnosticProvenance: equivalentProvenance, violationCode: "unhandled_exception" }),
  exploration: actionableExploration,
  explorationReplayGate: actionableGate,
  shrinkBudget: 1,
});
assert.equal(budgetAnalysis.findings[0].actionable, false);
assert.equal(budgetAnalysis.findings[0].representativeReplay.minimality, "budget-exhausted");
assert.ok(budgetAnalysis.findings[0].qualificationReasons.includes("budget-exhausted"));

const weakExploration = { failures: [failure], semanticHash: "weak" };
const weakGate = await runWebExplorationReplayGate({ driver: new ReplayDriver(), exploration: weakExploration, attempts: 3 });
const weakAnalysis = await analyzeWebActionableFindings({ driver: new ReplayDriver(), exploration: weakExploration, explorationReplayGate: weakGate });
assert.equal(weakAnalysis.findings[0].singleton, true);
assert.equal(weakAnalysis.findings[0].actionable, false);
assert.ok(weakAnalysis.findings[0].provenanceRejectionReasons.includes("diagnostic-missing"));
assert.equal(weakAnalysis.metrics.privacyProvenanceRejections["diagnostic-missing"], 1);

const flakyAnalysis = await analyzeWebActionableFindings({
  driver: new ReplayDriver({ flaky: true }),
  exploration: weakExploration,
  explorationReplayGate: flaky,
});
assert.equal(flakyAnalysis.metrics.deterministicFindingGroups, 0);
assert.equal(flakyAnalysis.metrics.actionableFindingGroups, 0);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-exploration-replay-gate-test",
  stableFailureCount: stable.stableFailureCount,
  flakyPromoted: flaky.stableFailureCount,
  attempts: stable.attempts,
  findingGroupCount: grouped.groupCount,
  representativeTraceLength: representative.traceLength,
  sameFindingReplay: sameFindingReplay.failures.length,
  differentFindingReplay: differentFindingReplay.failures.length,
  minimizedTraceLength: shrunk.length,
  minimality: shrunk.minimality,
  actionableFindingGroups: actionableAnalysis.metrics.actionableFindingGroups,
  budgetStatus: budgetAnalysis.findings[0].representativeReplay.minimality,
  weakSingleton: weakAnalysis.findings[0].singleton,
}));
