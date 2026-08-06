#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import {
  DEFAULT_BENCHMARK_ITERATIONS,
  WEB_MUTATION_SCENARIOS,
  evaluateMutationCatalog,
  measureMutationThroughput,
  runMutationScenario,
} from "../protocol/web-mutation-benchmark.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/web-mutation-benchmark-result.json");
const OUTPUT = path.join(ROOT, "protocol/out/web-mutation-benchmark");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");

function writeArtifacts(stable, performance) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  const report = { ...stable, performance };
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "web-mutation-benchmark",
    mutationScore: stable.metrics.mutationScore,
    falsePositiveRate: stable.metrics.falsePositiveRate,
    mutations: stable.mutations,
    controls: stable.controls,
    performance,
    semanticHash: stable.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  const edges = stable.mutations.map((mutation) =>
    `  "${mutation.operator}" -> "${mutation.property}" [label="${mutation.minimalTraceLength} actions"];`,
  ).join("\n");
  fs.writeFileSync(path.join(OUTPUT, "atlas.dot"), `digraph mutations {\n${edges}\n}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="200"><rect width="100%" height="100%" fill="white"/><text x="24" y="42">Web mutation benchmark</text><text x="24" y="82">Mutation score: ${(stable.metrics.mutationScore * 100).toFixed(0)}% / false positives: ${stable.metrics.falsePositiveCount}</text><text x="24" y="122">${stable.metrics.minimalTraceActions} minimized actions / ${performance.transitionCount} measured transitions</text><text x="24" y="162">${Math.round(performance.transitionsPerSecond)} transitions/second</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Web mutation benchmark</title><body><h1>Web mutation benchmark</h1><pre>${JSON.stringify(atlas, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const catalog = evaluateMutationCatalog();
assert.equal(catalog.mutationCount, 8);
assert.equal(catalog.killedCount, 8);
assert.equal(catalog.survivedCount, 0);
assert.equal(catalog.mutationScore, 1);
assert.equal(catalog.falsePositiveCount, 0);
assert.equal(catalog.falsePositiveRate, 0);
assert.deepEqual(
  catalog.mutations.map((mutation) => mutation.property).sort(),
  [
    "deterministic_replay",
    "duplicate_submit",
    "entity_consistency",
    "focus_integrity",
    "hydration_warning",
    "pending_effect_leak",
    "stale_response",
    "unhandled_exception",
  ],
);
for (const mutation of catalog.mutations) {
  assert.equal(mutation.minimalTraceLength, mutation.expectedMinimalLength, mutation.operator);
  assert.equal(mutation.deterministicReplay, true, mutation.operator);
  assert.ok(mutation.signature, mutation.operator);
  const scenario = WEB_MUTATION_SCENARIOS.find((candidate) => candidate.id === mutation.operator);
  assert.equal(runMutationScenario(scenario, { mutant: false }).violations.length, 0);
}

const stable = {
  ok: true,
  runtime: "framework-neutral-web-mutation-benchmark",
  benchmarkVersion: catalog.benchmarkVersion,
  seed: catalog.seed,
  scope: {
    sourceOfTruth: "protocol/web-property-pack.mjs",
    externalRepositories: "read-only",
    realNetwork: "deny",
    filesystemMutation: "deny-except-generated-local-report",
    mailPaymentCloudNative: "deny",
  },
  metrics: {
    mutationCount: catalog.mutationCount,
    killedCount: catalog.killedCount,
    survivedCount: catalog.survivedCount,
    mutationScore: catalog.mutationScore,
    falsePositiveControlCount: catalog.falsePositiveControlCount,
    falsePositiveCount: catalog.falsePositiveCount,
    falsePositiveRate: catalog.falsePositiveRate,
    originalTraceActions: catalog.originalTraceActions,
    minimalTraceActions: catalog.minimalTraceActions,
  },
  performanceContract: {
    iterations: DEFAULT_BENCHMARK_ITERATIONS,
    minimumTransitionsPerSecond: 5_000,
    maximumElapsedMs: 10_000,
    measuredFieldsExcludedFromSemanticHash: ["elapsedMs", "transitionsPerSecond"],
  },
  mutations: catalog.mutations,
  controls: catalog.controls,
};
stable.semanticHash = semanticHash(stable);

const performance = measureMutationThroughput({ iterations: DEFAULT_BENCHMARK_ITERATIONS });
assert.ok(performance.transitionsPerSecond >= stable.performanceContract.minimumTransitionsPerSecond, JSON.stringify(performance));
assert.ok(performance.elapsedMs <= stable.performanceContract.maximumElapsedMs, JSON.stringify(performance));
writeArtifacts(stable, performance);

if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(stable, null, 2)}\n`);
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stable);
}
console.log(JSON.stringify({ ...stable, performance }));
