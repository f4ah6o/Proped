#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebProjectBenchmarkBaseline } from "../protocol/web-project-baseline.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";
import { evaluatePromotionContract, evaluateReleaseGate } from "../protocol/release-gate.mjs";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promotedCorpus = resolveWebProjectCorpus("promoted");
const baseline = loadWebProjectBenchmarkBaseline(path.join(ROOT, "protocol/fixtures/promoted-production-baseline.json"));
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, "protocol/fixtures/frontier-7of7-promotion-evidence.json"), "utf8"));
const nextFrontier = JSON.parse(fs.readFileSync(path.join(ROOT, "protocol/fixtures/external-next-frontier-corpus.json"), "utf8"));

const promotion = evaluatePromotionContract({ promotedCorpus, baseline, evidence, nextFrontier });
assert.equal(promotion.ok, true, JSON.stringify(promotion));
assert.equal(promotion.promotedTopologyIds.length, 7);
assert.ok(promotion.nextTopologyIds.length >= 7);

const weakened = structuredClone(promotedCorpus);
weakened.gate.minAutoOnboardingRate = 0.99;
const weakenedResult = evaluatePromotionContract({ promotedCorpus: weakened, baseline, evidence, nextFrontier });
assert.equal(weakenedResult.ok, false);
assert.equal(weakenedResult.checks.find((entry) => entry.id === "promoted-auto-onboarding-threshold").pass, false);

const overlapping = structuredClone(nextFrontier);
overlapping.topologies[0].id = promotedCorpus.targets[0].topology.id;
const overlapResult = evaluatePromotionContract({ promotedCorpus, baseline, evidence, nextFrontier: overlapping });
assert.equal(overlapResult.ok, false);
assert.equal(overlapResult.checks.find((entry) => entry.id === "next-frontier-no-promotion-overlap").pass, false);

const result = evaluateReleaseGate({ root: ROOT });
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.schemaVersion, 1);
assert.equal(result.runtime, "proped-release-gate");
assert.deepEqual(result.summary.failed, []);

console.log(JSON.stringify({
  ok: true,
  runtime: "release-gate-test",
  checks: result.summary.passed,
  promotedTopologies: result.summary.promotedTopologies.length,
  nextFrontierTopologies: result.summary.nextFrontierTopologies.length,
}));
