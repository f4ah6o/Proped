#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { compileWebProjectManifestV2, createWebProjectManifestV2FromInspection } from "../protocol/web-project-manifest-v2.mjs";
import {
  diffWebProjectBenchmark,
  evaluateWebProjectBenchmarkGate,
  resolveWebProjectCorpus,
  validateWebProjectCorpus,
} from "../protocol/web-project-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/proped.mjs");
const CORPUS_ROOT = path.join(ROOT, "protocol/fixtures/production-campaign-targets");
const BASELINE = path.join(ROOT, "protocol/fixtures/production-campaign-baseline.json");

function cleanup() {
  for (const name of ["static-basic", "static-form", "static-storage", "static-navigation", "local-build"]) {
    fs.rmSync(path.join(CORPUS_ROOT, name, ".proped"), { recursive: true, force: true });
  }
  fs.rmSync(path.join(CORPUS_ROOT, "local-build", "node_modules"), { recursive: true, force: true });
  fs.rmSync(path.join(CORPUS_ROOT, "local-build", "dist"), { recursive: true, force: true });
}

cleanup();
try {
  const corpus = resolveWebProjectCorpus("production");
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.id, "production");
  assert.equal(corpus.targets.length, 5);
  assert.equal(corpus.targets.every((target) => target.adapterLoc === 0), true);
  assert.equal(corpus.gate.minAutoOnboardingRate, 0.8);
  assert.equal(corpus.gate.minDeterministicReplayRate, 1);

  const staticInspection = inspectWebProject(path.join(CORPUS_ROOT, "static-basic"));
  const staticManifest = createWebProjectManifestV2FromInspection(staticInspection, { projectRoot: ".", id: "static-basic" });
  const staticCompiled = compileWebProjectManifestV2(staticManifest, path.join(CORPUS_ROOT, "static-basic"));
  assert.deepEqual(staticCompiled.execution.writablePaths, [], "read-only static output must not make the project root writable");

  assert.throws(() => validateWebProjectCorpus({ ...corpus, targets: [{ ...corpus.targets[0], id: "UPPER" }] }), /id is invalid/);

  const cli = spawnSync(process.execPath, [
    CLI, "web", "benchmark", "--corpus", "production",
    "--offline", "--no-artifacts", "--sandbox-mode", "caller-enforced", "--baseline", BASELINE,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const result = JSON.parse(cli.stdout);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.corpus.id, "production");
  assert.equal(result.projectCount, 5);
  assert.equal(result.autoOnboardedCount, 5);
  assert.equal(result.autoOnboardingRate, 1);
  assert.equal(result.humanInterventions, 0);
  assert.equal(result.qualityGate.ok, true);
  assert.equal(result.qualityGate.projectSpecificAdapterLoc, 0);
  assert.equal(result.qualityGate.deterministicReplayRate, 1);
  assert.equal(result.baselineGate.ok, true);
  assert.deepEqual(result.baselineGate.diff.regressionTargets, []);
  assert.deepEqual(result.baselineGate.diff.findingDeltas, []);
  assert.equal(result.projects.every((project) => project.corpusEntryId), true);
  assert.equal(result.projects.every((project) => project.adapterLoc === 0), true);
  assert.ok(result.metrics.states > 0);
  assert.ok(result.metrics.transitions > 0);

  const regressed = structuredClone(result);
  regressed.projects[0].autoOnboarded = false;
  regressed.projects[0].status = "intervention-required";
  regressed.autoOnboardedCount = 4;
  regressed.autoOnboardingRate = 0.8;
  regressed.interventionProjectCount = 1;
  regressed.humanInterventions = 1;
  const diff = diffWebProjectBenchmark(result, regressed);
  assert.deepEqual(diff.regressed, ["static-basic"]);
  assert.equal(diff.regressionCount, 1);
  const regressionGate = evaluateWebProjectBenchmarkGate(regressed, corpus, result);
  assert.equal(regressionGate.ok, false);
  assert.equal(regressionGate.checks.find((check) => check.id === "onboarding-regressions").pass, false);

  const adapterCorpus = structuredClone(corpus);
  adapterCorpus.targets[0].adapterLoc = 1;
  const adapterGate = evaluateWebProjectBenchmarkGate(result, adapterCorpus);
  assert.equal(adapterGate.ok, false);
  assert.equal(adapterGate.checks.find((check) => check.id === "project-specific-adapter-loc").pass, false);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-corpus-test",
    corpus: result.corpus.id,
    projectCount: result.projectCount,
    autoOnboardingRate: result.autoOnboardingRate,
    deterministicReplayRate: result.qualityGate.deterministicReplayRate,
    projectSpecificAdapterLoc: result.qualityGate.projectSpecificAdapterLoc,
    regressionDetection: diff.regressed,
  }));
} finally {
  cleanup();
}
