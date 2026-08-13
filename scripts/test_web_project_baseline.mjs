#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareWebProjectBenchmarkBaseline,
  createWebProjectBenchmarkBaseline,
  evaluateWebProjectBenchmarkBaselineGate,
  loadWebProjectBenchmarkBaseline,
  validateWebProjectBenchmarkBaseline,
} from "../protocol/web-project-baseline.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "protocol/fixtures/production-campaign-baseline.json");
const corpus = resolveWebProjectCorpus("production");
const committed = loadWebProjectBenchmarkBaseline(BASELINE);
assert.equal(committed.corpus.id, corpus.id);
assert.equal(committed.corpus.semanticHash, corpus.semanticHash);
assert.equal(committed.projects.length, corpus.targets.length);
assert.equal(committed.projects.every((project) => project.autoOnboarded && project.deterministicReplay && project.humanInterventions === 0), true);

const current = {
  corpus: { id: corpus.id, semanticHash: corpus.semanticHash },
  projects: committed.projects.map((project) => ({ ...project })),
};
const recreated = createWebProjectBenchmarkBaseline(current);
assert.equal(recreated.semanticHash, committed.semanticHash);
assert.deepEqual(recreated.projects, committed.projects);

const regressed = structuredClone(current);
regressed.projects[0].autoOnboarded = false;
regressed.projects[1].deterministicReplay = false;
regressed.projects[2].humanInterventions = 1;
regressed.projects[3].failureClasses = ["new-finding"];
const diff = compareWebProjectBenchmarkBaseline(committed, regressed);
assert.deepEqual(diff.autoOnboardingRegressed, ["static-basic"]);
assert.deepEqual(diff.replayRegressed, ["static-form"]);
assert.deepEqual(diff.interventionIncreased, ["static-storage"]);
assert.deepEqual(diff.regressionTargets, ["static-basic", "static-form", "static-storage"]);
assert.equal(diff.regressionCount, 3);
assert.deepEqual(diff.findingDeltas, [{ id: "static-navigation", added: ["new-finding"], removed: [] }]);
const gate = evaluateWebProjectBenchmarkBaselineGate(committed, regressed, { maxRegressions: 0 });
assert.equal(gate.ok, false);
assert.equal(gate.checks.find((check) => check.id === "baseline-functional-regressions").observed, 3);

const changedCorpus = structuredClone(current);
changedCorpus.corpus.semanticHash = "0".repeat(64);
changedCorpus.projects.push({
  corpusEntryId: "added-target", repository: "f4ah6o/Proped", revision: "workspace:added", autoOnboarded: true,
  deterministicReplay: true, humanInterventions: 0, failureClasses: [],
});
const compatibility = compareWebProjectBenchmarkBaseline(committed, changedCorpus);
assert.equal(compatibility.corpusMatches, false);
assert.deepEqual(compatibility.addedTargets, ["added-target"]);
assert.ok(compatibility.compatibilityIssues.includes("corpus-content-changed"));
assert.ok(compatibility.compatibilityIssues.includes("targets-added"));
assert.equal(evaluateWebProjectBenchmarkBaselineGate(committed, changedCorpus).ok, false);

const tampered = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
tampered.projects[0].humanInterventions = 1;
assert.throws(() => validateWebProjectBenchmarkBaseline(tampered), /semanticHash does not match/);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-project-baseline-test",
  baselineSemanticHash: committed.semanticHash,
  projectCount: committed.projects.length,
  functionalRegressionDetection: diff.regressionTargets,
  findingDeltaIndependent: diff.findingDeltas.map((item) => item.id),
  compatibilityIssues: compatibility.compatibilityIssues,
}));
