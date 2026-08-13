#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { summarizeWebProjectBenchmark } from "../protocol/web-project-benchmark.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-benchmark-test");
const PASS = path.join(TMP, "plain-static");
const BLOCKED = path.join(TMP, "unknown-project");
const CLI = path.join(ROOT, "scripts/proped.mjs");

fs.rmSync(TMP, { recursive: true, force: true });
try {
  const aggregate = summarizeWebProjectBenchmark([
    {
      id: "finding-project", status: "completed", autoOnboarded: true, qualityPassed: false,
      humanInterventions: 0, interventionReasons: [], failureClasses: ["stale-state"],
      deterministicReplay: true, runtimeProfile: { framework: "react-vite", projectMode: "spa", serverMode: "static-output", packageManager: "npm", stateSources: ["dom", "indexedDB"] }, metrics: { states: 3, transitions: 5, actions: 2 },
    },
    {
      id: "blocked-project", status: "intervention-required", autoOnboarded: false, qualityPassed: null,
      humanInterventions: 1, interventionReasons: [{ code: "server_review_required" }], failureClasses: [],
      deterministicReplay: null, runtimeProfile: { framework: "unknown", projectMode: "unknown", serverMode: "review-required", packageManager: null, stateSources: ["dom"] }, metrics: { states: 0, transitions: 0, actions: 0 },
    },
  ]);
  assert.equal(aggregate.ok, false);
  assert.equal(aggregate.projectCount, 2);
  assert.equal(aggregate.autoOnboardedCount, 1);
  assert.equal(aggregate.autoOnboardingRate, 0.5);
  assert.equal(aggregate.interventionProjectCount, 1);
  assert.equal(aggregate.humanInterventions, 1);
  assert.equal(aggregate.projectsWithFindings, 1);
  assert.deepEqual(aggregate.failureClasses, ["stale-state"]);
  assert.equal(aggregate.uniqueFailureClassCount, 1);
  assert.equal(aggregate.deterministicReplayProjectCount, 1);
  assert.equal(aggregate.replayObservedProjectCount, 1);
  assert.deepEqual(aggregate.metrics, { states: 3, transitions: 5, actions: 2 });
  assert.deepEqual(aggregate.runtimeDistribution.frameworks, { "react-vite": 1, unknown: 1 });
  assert.deepEqual(aggregate.runtimeDistribution.packageManagers, { none: 1, npm: 1 });
  assert.deepEqual(aggregate.runtimeDistribution.stateSources, { dom: 2, indexedDB: 1 });
  assert.equal(aggregate.projects[0].autoOnboarded, true);
  assert.equal(aggregate.projects[0].qualityPassed, false, "quality findings must not erase successful onboarding");

  fs.mkdirSync(PASS, { recursive: true });
  fs.writeFileSync(path.join(PASS, "index.html"), "<!doctype html><main><h1>Plain static</h1><button>Open</button></main>\n");
  fs.mkdirSync(BLOCKED, { recursive: true });
  fs.writeFileSync(path.join(BLOCKED, "README.txt"), "no runnable surface\n");

  const output = path.join(TMP, "out");
  const cli = spawnSync(process.execPath, [
    CLI, "web", "benchmark", PASS, BLOCKED,
    "--no-prepare", "--sandbox-mode", "caller-enforced", "--output", output,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  const result = JSON.parse(cli.stdout);
  assert.equal(result.projectCount, 2);
  assert.equal(result.autoOnboardedCount, 1, JSON.stringify(result));
  assert.equal(result.autoOnboardingRate, 0.5);
  assert.equal(result.interventionProjectCount, 1);
  assert.equal(result.humanInterventions, 1);
  assert.equal(result.projects[0].status, "completed");
  assert.equal(result.projects[1].status, "intervention-required");
  assert.ok(result.projects[1].interventionReasonCodes.includes("server_review_required"));
  assert.ok(result.metrics.states > 0);
  assert.ok(result.metrics.transitions > 0);
  assert.equal(fs.existsSync(path.join(output, "summary.json")), true);
  const persisted = JSON.parse(fs.readFileSync(path.join(output, "summary.json"), "utf8"));
  assert.equal(persisted.semanticHash, result.semanticHash);
  assert.equal(persisted.autoOnboardingRate, 0.5);

  const help = spawnSync(process.execPath, [CLI, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /web benchmark <project\.\.\.>/);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-benchmark-test",
    projectCount: result.projectCount,
    autoOnboardedCount: result.autoOnboardedCount,
    autoOnboardingRate: result.autoOnboardingRate,
    interventionProjectCount: result.interventionProjectCount,
    humanInterventions: result.humanInterventions,
    metrics: result.metrics,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
