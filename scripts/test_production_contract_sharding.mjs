#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  aggregateWebProjectCorpusShards,
  createWebProjectCorpusShardSummary,
  productionContractShardPlan,
  selectWebProjectCorpusShard,
} from "../protocol/web-project-benchmark-shard.mjs";
import { summarizeWebProjectBenchmark } from "../protocol/web-project-benchmark.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";

function syntheticBase(targets) {
  return summarizeWebProjectBenchmark(targets.map((target) => ({
    benchmarkEntry: target,
    id: target.id,
    status: "pass",
    autoOnboarded: true,
    qualityPassed: true,
    humanInterventions: 0,
    interventionReasons: [],
    failureClasses: [],
    deterministicReplay: true,
    viability: { status: "qualified", stage: "campaign", reason: "full_campaign_completed" },
    runtimeProfile: null,
    metrics: { states: 1, transitions: 1, actions: 1 },
    stages: [],
  })));
}

function syntheticShards(corpus) {
  return productionContractShardPlan(corpus).map((group) => {
    const shard = selectWebProjectCorpusShard(corpus, group.targetIds);
    return createWebProjectCorpusShardSummary(corpus, group.targetIds, syntheticBase(shard.targets));
  });
}

const promoted = resolveWebProjectCorpus("promoted-production");
const external = resolveWebProjectCorpus("external-production");

const promotedPlan = productionContractShardPlan(promoted);
assert.equal(promotedPlan.length, 7);
assert.equal(new Set(promotedPlan.flatMap((group) => group.targetIds)).size, 7);
assert.ok(promotedPlan.every((group) => group.targetIds.length === 1));

const externalPlan = productionContractShardPlan(external);
assert.equal(externalPlan.length, 6);
assert.deepEqual(externalPlan.map((group) => [group.shard, group.targetIds.length]), [
  ["todomvc", 2],
  ["drawdb", 1],
  ["external-isomorphic", 5],
  ["external-rabbita-xterm", 1],
  ["external-proton-demo", 1],
  ["external-ensenzu", 1],
]);
assert.equal(new Set(externalPlan.flatMap((group) => group.targetIds)).size, 11);

assert.throws(
  () => selectWebProjectCorpusShard(external, ["todomvc-react"]),
  (error) => error?.code === "incomplete_checkout_shard" && error?.checkoutKey === "todomvc",
);

for (const corpus of [promoted, external]) {
  const shards = syntheticShards(corpus);
  const aggregate = aggregateWebProjectCorpusShards(corpus, shards);
  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.projectCount, corpus.targets.length);
  assert.deepEqual(aggregate.projects.map((project) => project.corpusEntryId), corpus.targets.map((target) => target.id));
  assert.equal(aggregate.qualityGate.ok, true);
  assert.equal(aggregate.qualityGate.projectSpecificAdapterLoc, 0);
  assert.equal(aggregate.qualityGate.deterministicReplayRate, 1);

  assert.throws(
    () => aggregateWebProjectCorpusShards(corpus, shards.slice(1)),
    (error) => error?.code === "incomplete_shard_coverage",
  );

  assert.throws(
    () => aggregateWebProjectCorpusShards(corpus, [...shards, shards[0]]),
    (error) => error?.code === "duplicate_shard_target",
  );
}

const promotedAggregate = aggregateWebProjectCorpusShards(promoted, syntheticShards(promoted), {
  baseline: "protocol/fixtures/promoted-production-baseline.json",
});
assert.equal(promotedAggregate.ok, true);
assert.equal(promotedAggregate.baselineGate.ok, true);

console.log(JSON.stringify({
  ok: true,
  runtime: "production-contract-sharding-test",
  promotedShards: promotedPlan.length,
  externalShards: externalPlan.length,
}));
