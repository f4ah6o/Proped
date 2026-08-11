#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateFailureReplayCampaigns, runFailureReplayGate } from "../protocol/web-replay-gate.mjs";

const stable = (generatedId) => ({
  code: "browser_uncaught_exception",
  trace: [`click|button|Crash|generation=${generatedId}`],
  message: "TypeError: boom",
  evidence: { errors: ["TypeError: boom"] },
});
const flaky = (generatedId) => ({
  code: "reload_persistence_storage_drift",
  trace: [`click|button|Persist|generation=${generatedId}`, "browser:reload"],
  evidence: { before: "a", after: "b" },
});

const evaluated = evaluateFailureReplayCampaigns([
  { failures: [stable(1), flaky(1)], semanticHash: "one" },
  { failures: [stable(2)], semanticHash: "two" },
  { failures: [stable(3)], semanticHash: "three" },
]);
assert.equal(evaluated.attempts, 3);
assert.equal(evaluated.stableFailureCount, 1);
assert.equal(evaluated.stableFailureClassIds.length, 1);
assert.equal(evaluated.unstableFailureClassIds.length, 1);
assert.equal(evaluated.unstableCandidates[0].occurrenceCount, 1);
assert.equal(evaluated.unstableCandidates[0].requiredCount, 3);
assert.equal(evaluated.deterministic, false);
assert.equal(evaluated.ok, false);

let runs = 1;
const clean = await runFailureReplayGate({
  initialCampaign: { failures: [], semanticHash: "clean-1" },
  attempts: 3,
  runCampaign: async () => ({ failures: [], semanticHash: `clean-${++runs}` }),
});
assert.equal(runs, 3);
assert.equal(clean.stableFailureCount, 0);
assert.equal(clean.deterministic, true);
assert.equal(clean.ok, true);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-replay-gate-test",
  attempts: evaluated.attempts,
  stableFailureCount: evaluated.stableFailureCount,
  unstableCandidateCount: evaluated.unstableCandidates.length,
  cleanDeterministic: clean.deterministic,
}));
