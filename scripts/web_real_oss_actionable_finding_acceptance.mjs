#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveWebProjectCorpus, validateWebProjectCorpus, corpusProjectPaths } from "../protocol/web-project-corpus.mjs";
import { captureMaterializedWebProjectCorpusState, restoreMaterializedWebProjectCorpus, verifyMaterializedWebProjectCorpus } from "../protocol/web-project-corpus-materialize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROPED = path.join(ROOT, "scripts", "proped.mjs");
const ACCEPTANCE_FILE = path.join(ROOT, "protocol", "fixtures", "real-oss-actionable-finding-acceptance.json");

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_real_oss_actionable_finding_acceptance.mjs --checkout-root <dir> [--sandbox-mode <strict|constrained|caller-enforced>] [--prepare-timeout-ms <ms>] [--offline]");
  process.exit(message ? 2 : 0);
}

let checkoutRoot = null;
let sandboxMode = "strict";
let prepareTimeoutMs = 300_000;
let offline = false;
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--checkout-root") checkoutRoot = argv[++index] ?? null;
  else if (arg === "--sandbox-mode") sandboxMode = argv[++index] ?? null;
  else if (arg === "--prepare-timeout-ms") prepareTimeoutMs = Number(argv[++index]);
  else if (arg === "--offline") offline = true;
  else if (arg === "--help" || arg === "-h") usage();
  else usage(`unknown option: ${arg}`);
}
if (!checkoutRoot) usage("--checkout-root is required");
if (!["strict", "constrained", "caller-enforced"].includes(sandboxMode)) usage("--sandbox-mode is invalid");
if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs <= 0) usage("--prepare-timeout-ms must be a positive integer");
checkoutRoot = path.resolve(checkoutRoot);

const acceptance = JSON.parse(fs.readFileSync(ACCEPTANCE_FILE, "utf8"));
const sourceCorpus = resolveWebProjectCorpus(acceptance.corpus);
const target = sourceCorpus.targets.find((entry) => entry.id === acceptance.targetId);
assert.ok(target, `missing acceptance target ${acceptance.targetId}`);
assert.equal(target.repository, acceptance.repository);
assert.equal(target.revision, acceptance.revision);
assert.equal(target.project, acceptance.project);
assert.equal(target.adapterLoc, acceptance.adapterLoc);
assert.equal(target.adapterLoc, 0, "real OSS actionable-finding acceptance must not use project-specific executable adapter LOC");

const corpus = validateWebProjectCorpus({
  schemaVersion: 1,
  id: "real-oss-actionable-finding-acceptance",
  description: "Pinned real OSS actionable minimal finding acceptance target.",
  gate: {
    minAutoOnboardingRate: 1,
    maxInterventionProjectRate: 0,
    minDeterministicReplayRate: 1,
    maxAdapterLoc: 0,
    maxRegressions: 0,
  },
  targets: [target],
});
const verification = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot });
assert.equal(verification.ok, true, JSON.stringify(verification));
const project = corpusProjectPaths(corpus, { checkoutRoot })[0];

function selectFinding(result) {
  const finding = (result.actionableFindings ?? []).find((entry) => entry.findingGroupId === acceptance.expectedFindingGroupId);
  assert.ok(finding, `expected actionable finding ${acceptance.expectedFindingGroupId}: ${JSON.stringify(result.findingQuality)}`);
  assert.equal(finding.actionable, true);
  assert.equal(finding.grouping, "strong");
  assert.ok(finding.memberFailureCodes.includes(acceptance.expectedFailureCode), JSON.stringify(finding.memberFailureCodes));
  assert.equal(finding.provenance?.topProjectFrame?.projectOwned, true);
  assert.equal(finding.representativeReplay?.minimality, acceptance.expectedMinimality);
  assert.equal(finding.representativeReplay?.sameFindingReplay, true);
  assert.equal(finding.representativeReplay?.deterministic, true);
  assert.ok((finding.representativeReplay?.shrinkEvaluationCount ?? 0) <= acceptance.maxShrinkBudget);
  assert.ok((finding.representativeReplay?.minimizedActionCount ?? 0) > 0);
  return finding;
}

function assertPrivateSafe(value, projectRoot) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\b(?:localhost|127\.0\.0\.1|\[::1\]):\d+\b/i);
  assert.doesNotMatch(serialized, /\b(?:password|passwd|token|secret|authorization|cookie|api[-_]?key)=[^<\s]/i);
  assert.equal(serialized.includes(projectRoot), false, "absolute project path must not appear in finding incident output");
}

function runCampaign() {
  const args = [PROPED, "web", "campaign", project, "--sandbox-mode", sandboxMode, "--prepare-timeout-ms", String(prepareTimeoutMs)];
  if (offline) args.push("--offline");
  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: Math.max(prepareTimeoutMs * 2, 600_000),
    env: process.env,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const result = JSON.parse(child.stdout);
  assert.equal(result.ok, true, JSON.stringify(result.interventionReasons));
  assert.equal(result.autoOnboarded, true);
  assert.equal(result.humanInterventions, 0);
  assert.equal(result.deterministicReplay, true);
  const finding = selectFinding(result);
  const artifact = JSON.parse(fs.readFileSync(result.artifacts.summary, "utf8"));
  const artifactFinding = selectFinding(artifact);
  assert.deepEqual(artifactFinding.representativeReplay.trace, finding.representativeReplay.trace);
  const incident = (artifact.findingIncidents ?? []).find((entry) => entry.findingGroupId === finding.findingGroupId);
  assert.ok(incident, JSON.stringify(artifact.findingIncidents));
  assert.equal(incident.actionable, true);
  assert.equal(incident.minimalReplay.minimality, acceptance.expectedMinimality);
  const human = fs.readFileSync(result.artifacts.incidents, "utf8");
  assert.match(human, new RegExp(`Incident ${finding.findingGroupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(human, new RegExp(acceptance.expectedFailureCode));
  assert.match(human, /status: actionable/);
  assertPrivateSafe(finding, project);
  assertPrivateSafe(incident, project);
  assertPrivateSafe(human, project);
  return { result, finding, incident, human };
}

const baselineState = captureMaterializedWebProjectCorpusState(corpus, { checkoutRoot });
let first;
let second;
let firstCleanup;
let secondCleanup;
try {
  first = runCampaign();
} finally {
  firstCleanup = restoreMaterializedWebProjectCorpus(corpus, { checkoutRoot, baselineState });
}
assert.equal(firstCleanup.ok, true, JSON.stringify(firstCleanup));
const freshVerification = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot });
assert.equal(freshVerification.ok, true, JSON.stringify(freshVerification));
const secondBaselineState = captureMaterializedWebProjectCorpusState(corpus, { checkoutRoot });
try {
  second = runCampaign();
} finally {
  secondCleanup = restoreMaterializedWebProjectCorpus(corpus, { checkoutRoot, baselineState: secondBaselineState });
}
assert.equal(secondCleanup.ok, true, JSON.stringify(secondCleanup));
assert.equal(second.finding.findingGroupId, first.finding.findingGroupId);
assert.deepEqual(second.finding.representativeReplay.trace, first.finding.representativeReplay.trace);
assert.deepEqual(second.incident.minimalReplay.actions, first.incident.minimalReplay.actions);
assert.equal(second.finding.representativeReplay.minimality, "one-minimal");
const finalVerification = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot });
assert.equal(finalVerification.ok, true, JSON.stringify(finalVerification));

console.log(JSON.stringify({
  ok: true,
  runtime: "real-oss-actionable-finding-acceptance",
  targetId: target.id,
  repository: target.repository,
  revision: target.revision,
  project: target.project,
  adapterLoc: target.adapterLoc,
  findingGroupId: first.finding.findingGroupId,
  failureCodes: first.finding.memberFailureCodes,
  occurrenceCount: first.finding.occurrenceCount,
  minimality: first.finding.representativeReplay.minimality,
  representativeReplay: first.finding.representativeReplay.trace,
  repeatStable: true,
  privacySafe: true,
  checkoutCleanup: firstCleanup.ok && secondCleanup.ok,
}));
