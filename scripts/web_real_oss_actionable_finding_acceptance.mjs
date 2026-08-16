#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { resolveWebProjectCorpus, validateWebProjectCorpus, corpusProjectPaths } from "../protocol/web-project-corpus.mjs";
import { captureMaterializedWebProjectCorpusState, restoreMaterializedWebProjectCorpus, verifyMaterializedWebProjectCorpus } from "../protocol/web-project-corpus-materialize.mjs";
import { WEB_PROJECT_RUNNER_VERSION } from "../protocol/web-project-runner.mjs";
import {
  WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME,
  WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION,
  assertRealOssAcceptancePrivateSafe,
  compareRealOssActionableFindingEvidence,
  validateRealOssActionableFindingEvidence,
} from "../protocol/web-real-oss-actionable-finding-acceptance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROPED = path.join(ROOT, "scripts", "proped.mjs");
const ACCEPTANCE_FILE = path.join(ROOT, "protocol", "fixtures", "real-oss-actionable-finding-acceptance.json");
const acceptanceStartedAt = performance.now();
const phaseTimings = [];

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function measurePhase(phase, operation) {
  const startedAt = performance.now();
  try {
    return operation();
  } finally {
    phaseTimings.push({ phase, durationMs: roundMs(performance.now() - startedAt) });
  }
}

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(`Usage:
  node scripts/web_real_oss_actionable_finding_acceptance.mjs --checkout-root <dir> [--sandbox-mode <strict|constrained|caller-enforced>] [--prepare-timeout-ms <ms>] [--offline]
  node scripts/web_real_oss_actionable_finding_acceptance.mjs --checkout-root <dir> --campaign-id <id> --output <evidence.json> [--sandbox-mode <strict|constrained|caller-enforced>] [--prepare-timeout-ms <ms>] [--offline]
  node scripts/web_real_oss_actionable_finding_acceptance.mjs --compare-evidence <first.json> <second.json> [--output <summary.json>]`);
  process.exit(message ? 2 : 0);
}

let checkoutRoot = null;
let sandboxMode = "strict";
let prepareTimeoutMs = 300_000;
let offline = false;
let campaignId = null;
let output = null;
let compareEvidenceFiles = null;
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--checkout-root") checkoutRoot = argv[++index] ?? null;
  else if (arg === "--sandbox-mode") sandboxMode = argv[++index] ?? null;
  else if (arg === "--prepare-timeout-ms") prepareTimeoutMs = Number(argv[++index]);
  else if (arg === "--offline") offline = true;
  else if (arg === "--campaign-id") campaignId = argv[++index] ?? null;
  else if (arg === "--output") output = argv[++index] ?? null;
  else if (arg === "--compare-evidence") compareEvidenceFiles = [argv[++index] ?? null, argv[++index] ?? null];
  else if (arg === "--help" || arg === "-h") usage();
  else usage(`unknown option: ${arg}`);
}
if (!["strict", "constrained", "caller-enforced"].includes(sandboxMode)) usage("--sandbox-mode is invalid");
if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs <= 0) usage("--prepare-timeout-ms must be a positive integer");
if (output) output = path.resolve(output);

const acceptance = JSON.parse(fs.readFileSync(ACCEPTANCE_FILE, "utf8"));
const sourceCorpus = resolveWebProjectCorpus(acceptance.corpus);
const acceptanceContract = { ...acceptance, corpusSemanticHash: sourceCorpus.semanticHash };

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (compareEvidenceFiles) {
  if (checkoutRoot || campaignId || offline || sandboxMode !== "strict" || prepareTimeoutMs !== 300_000) {
    usage("--compare-evidence accepts only --output in addition to the two evidence files");
  }
  if (compareEvidenceFiles.some((file) => !file)) usage("--compare-evidence requires two files");
  const [first, second] = compareEvidenceFiles.map((file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8")));
  const summary = compareRealOssActionableFindingEvidence(first, second, acceptanceContract);
  if (output) writeJson(output, summary);
  console.log(JSON.stringify(summary));
  process.exit(0);
}

if (!checkoutRoot) usage("--checkout-root is required");
if ((campaignId && !output) || (!campaignId && output)) usage("--campaign-id and --output must be used together for single-campaign evidence mode");
checkoutRoot = path.resolve(checkoutRoot);

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

function runCampaign(label) {
  const startedAt = performance.now();
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
  assert.equal(result.sandboxRequested, sandboxMode);
  const finding = selectFinding(result);
  const artifact = JSON.parse(fs.readFileSync(result.artifacts.summary, "utf8"));
  const artifactFinding = selectFinding(artifact);
  assert.deepEqual(artifactFinding.representativeReplay.trace, finding.representativeReplay.trace);
  const incident = (artifact.findingIncidents ?? []).find((entry) => entry.findingGroupId === finding.findingGroupId);
  assert.ok(incident, JSON.stringify(artifact.findingIncidents));
  assert.equal(incident.actionable, true);
  assert.equal(incident.minimalReplay.minimality, acceptance.expectedMinimality);
  assert.deepEqual(incident.minimalReplay.actions, finding.representativeReplay.trace);
  const human = fs.readFileSync(result.artifacts.incidents, "utf8");
  assert.match(human, new RegExp(`Incident ${finding.findingGroupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(human, new RegExp(acceptance.expectedFailureCode));
  assert.match(human, /status: actionable/);
  assertRealOssAcceptancePrivateSafe(finding, project);
  assertRealOssAcceptancePrivateSafe(incident, project);
  assertRealOssAcceptancePrivateSafe(human, project);
  const totalMs = roundMs(performance.now() - startedAt);
  const stageTimings = (result.stages ?? []).map((stage) => ({
    id: stage.id,
    kind: stage.kind,
    durationMs: typeof stage.durationMs === "number" ? stage.durationMs : null,
  }));
  const measuredStageMs = roundMs(stageTimings.reduce((total, stage) => total + (stage.durationMs ?? 0), 0));
  return {
    result,
    finding,
    incident,
    human,
    timing: {
      campaign: label,
      totalMs,
      measuredStageMs,
      outsideMeasuredStagesMs: roundMs(Math.max(0, totalMs - measuredStageMs)),
      campaignPhases: result.timing?.phases ?? [],
      stages: stageTimings,
    },
  };
}

function runFreshCampaignEvidence(label) {
  const wrapperStartedAt = performance.now();
  const phaseStartIndex = phaseTimings.length;
  const initialVerification = measurePhase(`${label}-initial-checkout-verification`, () => verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot }));
  assert.equal(initialVerification.ok, true, JSON.stringify(initialVerification));
  const baselineState = measurePhase(`${label}-capture-baseline`, () => captureMaterializedWebProjectCorpusState(corpus, { checkoutRoot }));
  let campaign;
  let cleanup;
  try {
    campaign = measurePhase(label, () => runCampaign(label));
  } finally {
    cleanup = measurePhase(`${label}-checkout-cleanup`, () => restoreMaterializedWebProjectCorpus(corpus, { checkoutRoot, baselineState }));
  }
  assert.equal(cleanup.ok, true, JSON.stringify(cleanup));
  const finalVerification = measurePhase(`${label}-final-checkout-verification`, () => verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot }));
  assert.equal(finalVerification.ok, true, JSON.stringify(finalVerification));

  const evidence = {
    schemaVersion: WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION,
    runtime: WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME,
    campaignId: label,
    target: {
      corpus: acceptance.corpus,
      corpusSemanticHash: sourceCorpus.semanticHash,
      targetId: target.id,
      repository: target.repository,
      revision: target.revision,
      project: target.project,
      adapterLoc: target.adapterLoc,
    },
    execution: {
      sandboxMode,
      prepareTimeoutMs,
      offline,
      campaignRuntime: campaign.result.runtime,
      campaignSchemaVersion: campaign.result.schemaVersion,
      runnerVersion: WEB_PROJECT_RUNNER_VERSION,
      sandboxRequested: campaign.result.sandboxRequested,
      status: campaign.result.status,
      autoOnboarded: campaign.result.autoOnboarded,
      humanInterventions: campaign.result.humanInterventions,
      deterministicReplay: campaign.result.deterministicReplay,
      semanticHash: campaign.result.semanticHash,
      runtimeProfile: campaign.result.runtimeProfile,
    },
    checkout: {
      initialVerified: initialVerification.ok,
      baselineCaptured: baselineState.checkoutCount === 1,
      cleanupOk: cleanup.ok,
      finalVerified: finalVerification.ok,
    },
    artifacts: {
      summaryFindingMatched: true,
      humanIncidentValidated: true,
    },
    finding: campaign.finding,
    incident: campaign.incident,
    humanIncident: campaign.human,
    privacySafe: true,
    timing: {
      ...campaign.timing,
      acceptanceWrapperMs: roundMs(performance.now() - wrapperStartedAt),
      acceptanceWrapperPhases: phaseTimings.slice(phaseStartIndex),
    },
  };
  validateRealOssActionableFindingEvidence(evidence, acceptanceContract);
  return evidence;
}

if (campaignId) {
  const evidence = runFreshCampaignEvidence(campaignId);
  writeJson(output, evidence);
  console.log(JSON.stringify({
    ok: true,
    runtime: evidence.runtime,
    campaignId: evidence.campaignId,
    targetId: evidence.target.targetId,
    findingGroupId: evidence.finding.findingGroupId,
    minimality: evidence.finding.representativeReplay.minimality,
    privacySafe: evidence.privacySafe,
    checkoutCleanup: evidence.checkout.cleanupOk,
    timing: evidence.timing,
  }));
  process.exit(0);
}

const first = runFreshCampaignEvidence("first-fresh-campaign");
const second = runFreshCampaignEvidence("second-fresh-campaign");
const summary = compareRealOssActionableFindingEvidence(first, second, acceptanceContract);
summary.timing.totalMs = roundMs(performance.now() - acceptanceStartedAt);
summary.timing.phases = phaseTimings;
console.log(JSON.stringify(summary));
