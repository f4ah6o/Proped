#!/usr/bin/env node
import assert from "node:assert/strict";
import { runHealthyTransitionBenchmark } from "../protocol/web-healthy-transition-benchmark.mjs";

const first = runHealthyTransitionBenchmark({ transitions: 10_000 });
assert.equal(first.ok, true);
assert.equal(first.transitions, 10_000);
assert.equal(first.falsePositiveCount, 0);
assert.equal(first.falsePositivesPerThousand, 0);
assert.equal(Object.keys(first.familyCounts).length, 10);
assert.ok(first.qualityGate.sensitivityControlViolationCodes.includes("entity_consistency"));
assert.ok(first.qualityGate.sensitivityControlViolationCodes.includes("duplicate_submit"));

const second = runHealthyTransitionBenchmark({ transitions: 10_000 });
assert.equal(second.semanticHash, first.semanticHash);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-healthy-transition-benchmark-test",
  transitions: first.transitions,
  falsePositiveCount: first.falsePositiveCount,
  falsePositivesPerThousand: first.falsePositivesPerThousand,
  target: first.qualityGate.target,
  sensitivityControls: first.qualityGate.sensitivityControlViolationCodes,
  deterministic: second.semanticHash === first.semanticHash,
}));
