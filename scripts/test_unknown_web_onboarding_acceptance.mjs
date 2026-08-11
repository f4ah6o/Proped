#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { runHealthyTransitionBenchmark } from "../protocol/web-healthy-transition-benchmark.mjs";

const dogfood = JSON.parse(fs.readFileSync(new URL("../protocol/fixtures/unknown-web-onboarding-real-dogfood.json", import.meta.url), "utf8"));
assert.equal(dogfood.schemaVersion, 1);
assert.equal(dogfood.targets.length, 2);
const expected = new Set([
  "toggle_all_reflects_all_todos",
  "escape_cancels_edit",
  "reload_persists_todos",
  "add_table_redo_preserves_order",
  "delete_table_undo_preserves_order",
  "sql_ui_import_rejects_valid_mysql",
]);
const observed = new Set(dogfood.targets.flatMap((target) => target.knownFailureClasses));
assert.equal(observed.size, 6);
for (const failure of expected) assert.ok(observed.has(failure), `missing known failure ${failure}`);
for (const target of dogfood.targets) {
  assert.equal(target.deterministicReplay, true);
  assert.match(target.revision, /^[0-9a-f]{40}$/);
  assert.match(target.semanticHash, /^[0-9a-f]{64}$/);
  assert.equal(target.knownFailureClasses.length, 3);
}
const healthy = runHealthyTransitionBenchmark({ transitions: 10_000 });
assert.equal(healthy.ok, true);
assert.equal(healthy.falsePositiveCount, 0);
assert.ok(healthy.falsePositivesPerThousand < 1);
console.log(JSON.stringify({
  ok: true,
  runtime: "unknown-web-onboarding-acceptance-test",
  knownFailureRecall: `${observed.size}/${expected.size}`,
  targetFailureRecall: Object.fromEntries(dogfood.targets.map((target) => [target.id, `${target.knownFailureClasses.length}/3`])),
  deterministicReplay: dogfood.targets.every((target) => target.deterministicReplay),
  healthyTransitions: healthy.transitions,
  falsePositiveCount: healthy.falsePositiveCount,
  falsePositivesPerThousand: healthy.falsePositivesPerThousand,
  falsePositiveTarget: healthy.qualityGate.target,
}));
