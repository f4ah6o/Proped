#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { PROTOCOL_VERSION, semanticHash } from "../protocol/ui-driver-v1.mjs";
import { ENVIRONMENT_CHECKPOINT_VERSION } from "../protocol/environment-checkpoints.mjs";
import { WEB_COVERAGE_GUIDED_EXPLORATION_VERSION } from "../protocol/web-coverage-guided-exploration.mjs";
import { WEB_EXPLORATION_REPLAY_GATE_VERSION } from "../protocol/web-exploration-replay-gate.mjs";
import { WEB_FINDING_GROUP_VERSION } from "../protocol/web-finding-group.mjs";
import { WEB_ACTIONABLE_FINDING_VERSION } from "../protocol/web-actionable-finding.mjs";
import { WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION } from "../protocol/web-real-oss-actionable-finding-acceptance.mjs";
import {
  OPAQUE_WEB_REPLAY_VERSION,
  OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
  opaqueCandidateOrderFixtureVector,
} from "../protocol/opaque-web-replay-v1.mjs";
import {
  OPAQUE_WEB_REAL_CONSUMER_EVIDENCE_VERSION,
  OPAQUE_WEB_REAL_CONSUMER_ACCEPTANCE_VERSION,
  buildOpaqueWebRealConsumerAcceptanceV1,
  validateOpaqueWebRealConsumerEvidenceV1,
} from "../protocol/opaque-web-real-consumer-acceptance-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_VERSION = "OpaqueWebLongitudinalContractBaselineV1";
const INITIAL_BASELINE_ENTRY_HASH = "4f7743f541b4a3197074da24dea809a358fb3e7196aa74f9296ee06a98f18ac3";
const BASELINE_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-longitudinal-contract-baseline-v1.json");
const CANDIDATE_ORDER_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-candidate-order-v1.json");
const PRIMARY_EVIDENCE_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-evidence-v1.json");
const PRIMARY_ACCEPTANCE_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-acceptance-v1.json");
const BREADTH_EVIDENCE_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-evidence-v1-breadth.json");
const BREADTH_ACCEPTANCE_PATH = path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-acceptance-v1-breadth.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function currentVersions() {
  return {
    uiDriverProtocol: PROTOCOL_VERSION,
    environmentCheckpoint: ENVIRONMENT_CHECKPOINT_VERSION,
    coverageGuidedExploration: WEB_COVERAGE_GUIDED_EXPLORATION_VERSION,
    explorationReplayGate: WEB_EXPLORATION_REPLAY_GATE_VERSION,
    findingGroup: WEB_FINDING_GROUP_VERSION,
    actionableFinding: WEB_ACTIONABLE_FINDING_VERSION,
    realOssActionableEvidence: WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION,
    opaqueWebReplay: OPAQUE_WEB_REPLAY_VERSION,
    candidateOrder: OPAQUE_WEB_CANDIDATE_ORDER_VERSION,
    realConsumerEvidence: OPAQUE_WEB_REAL_CONSUMER_EVIDENCE_VERSION,
    realConsumerAcceptance: OPAQUE_WEB_REAL_CONSUMER_ACCEPTANCE_VERSION,
  };
}

function currentSemanticHashes() {
  const candidateOrder = readJson(CANDIDATE_ORDER_PATH);
  const primaryEvidence = readJson(PRIMARY_EVIDENCE_PATH);
  const breadthEvidence = readJson(BREADTH_EVIDENCE_PATH);
  const primaryAcceptance = buildOpaqueWebRealConsumerAcceptanceV1(primaryEvidence);
  const breadthAcceptance = buildOpaqueWebRealConsumerAcceptanceV1(breadthEvidence);
  return {
    candidateOrder: semanticHash(candidateOrder),
    realConsumerEvidencePrimary: semanticHash(primaryEvidence),
    realConsumerAcceptancePrimary: semanticHash(primaryAcceptance),
    realConsumerEvidenceBreadth: semanticHash(breadthEvidence),
    realConsumerAcceptanceBreadth: semanticHash(breadthAcceptance),
  };
}

function changedKeys(left, right) {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  return [...keys].filter((key) => left?.[key] !== right?.[key]).sort();
}

function validateMigrationHistory(baseline) {
  assert.equal(baseline.version, BASELINE_VERSION);
  assert.ok(Array.isArray(baseline.history) && baseline.history.length >= 1, "longitudinal baseline history must not be empty");
  assert.equal(semanticHash(baseline.history[0]), INITIAL_BASELINE_ENTRY_HASH, "initial longitudinal baseline entry is immutable");

  const seenIds = new Set();
  for (const [index, entry] of baseline.history.entries()) {
    assert.equal(typeof entry.id, "string");
    assert.equal(seenIds.has(entry.id), false, `duplicate longitudinal baseline id: ${entry.id}`);
    seenIds.add(entry.id);
    assert.match(entry.revision, /^[0-9a-f]{40}$/);
    assert.ok(entry.contractVersions && typeof entry.contractVersions === "object");
    assert.ok(entry.semanticHashes && typeof entry.semanticHashes === "object");
    if (index === 0) {
      assert.equal(entry.migration, null, "initial baseline must not claim a migration");
      continue;
    }

    const previous = baseline.history[index - 1];
    const versionChanges = changedKeys(previous.contractVersions, entry.contractVersions);
    const hashChanges = changedKeys(previous.semanticHashes, entry.semanticHashes);
    assert.ok(hashChanges.length > 0 || versionChanges.length > 0, "migration entry must record an actual contract change");
    assert.ok(entry.migration && typeof entry.migration === "object" && !Array.isArray(entry.migration), "changed baseline requires explicit migration metadata");
    assert.equal(entry.migration.from, previous.id, "migration must name the immediately previous baseline id");
    assert.equal(typeof entry.migration.reason, "string");
    assert.ok(entry.migration.reason.trim().length >= 12, "migration reason must be explicit");
    assert.ok(Array.isArray(entry.migration.changedContracts) && entry.migration.changedContracts.length > 0, "migration must name changed contracts");
    if (hashChanges.length > 0) {
      assert.ok(versionChanges.length > 0, "semantic hash churn requires an owning contract version change");
    }
  }
}

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} schema surface drifted`);
}

function assertEvidenceShape(evidence, label) {
  exactKeys(evidence, ["version", "candidateOrderVersion", "consumerSpecificAdapterLoc", "source", "peer", "consumerBefore", "consumerAfter"], label);
  for (const reference of ["source", "peer"]) {
    exactKeys(evidence[reference], ["browserEngine", "steps", "attempts", "deterministic", "minimality"], `${label}.${reference}`);
  }
  for (const consumer of ["consumerBefore", "consumerAfter"]) {
    exactKeys(evidence[consumer], ["steps", "attempts", "deterministic", "freshContext", "mutableStateIsolation"], `${label}.${consumer}`);
  }
  for (const group of [evidence.source, evidence.peer, evidence.consumerBefore, evidence.consumerAfter]) {
    for (const [index, step] of group.steps.entries()) exactKeys(step, ["kind", "ordinal", "transition"], `${label}.steps[${index}]`);
  }
}

function portableVector(steps) {
  return steps.map(({ kind, ordinal }) => `${kind}:${ordinal}`);
}

function verifyConsumerEvidence(file, committedAcceptanceFile, label) {
  const evidence = readJson(file);
  const validated = validateOpaqueWebRealConsumerEvidenceV1(evidence);
  const acceptance = buildOpaqueWebRealConsumerAcceptanceV1(evidence);
  assert.deepEqual(acceptance, readJson(committedAcceptanceFile), `${label} transition classification drifted`);
  assertEvidenceShape(evidence, label);
  assert.equal(validated.consumerSpecificAdapterLoc, 0, `${label} adapter LOC drifted`);
  assert.deepEqual(portableVector(validated.source.steps), portableVector(validated.peer.steps), `${label} peer action vector drifted`);
  assert.deepEqual(portableVector(validated.source.steps), portableVector(validated.consumerAfter.steps), `${label} consumer action vector drifted`);
  assert.equal(validated.source.minimality, "one-minimal", `${label} source one-minimality drifted`);
  assert.equal(validated.peer.minimality, "not-one-minimal", `${label} peer inherited source minimality`);
  assert.equal(validated.source.deterministic, true, `${label} source determinism drifted`);
  assert.ok(validated.source.attempts >= 2, `${label} source fresh replay evidence weakened`);
  assert.equal(validated.peer.deterministic, true, `${label} peer determinism drifted`);
  assert.ok(validated.peer.attempts >= 2, `${label} peer fresh replay evidence weakened`);
  assert.notEqual(validated.source.browserEngine, validated.peer.browserEngine, `${label} cross-engine boundary collapsed`);
  assert.equal(validated.consumerAfter.deterministic, true, `${label} consumer determinism drifted`);
  assert.ok(validated.consumerAfter.attempts >= 2, `${label} consumer fresh replay evidence weakened`);
  assert.equal(validated.consumerAfter.freshContext, true, `${label} consumer fresh-context evidence weakened`);
  assert.notEqual(validated.consumerAfter.mutableStateIsolation, "unverified", `${label} consumer isolation evidence weakened`);
  assert.equal(acceptance.after.productionQualified, true, `${label} production qualification drifted`);
  return { evidence, acceptance };
}

function verifyPrivacyFailClosed(primaryEvidence) {
  const forbiddenFields = [
    "consumerName",
    "applicationName",
    "url",
    "selector",
    "text",
    "accessibilityName",
    "screenshot",
    "pixel",
    "console",
    "sourceCode",
    "storageValue",
    "applicationMetadata",
  ];
  const sentinel = "PRIVATE_LONGITUDINAL_SENTINEL";
  for (const field of forbiddenFields) {
    assert.throws(() => validateOpaqueWebRealConsumerEvidenceV1({ ...primaryEvidence, [field]: sentinel }), /unsupported field/);
    for (const section of ["source", "peer", "consumerBefore", "consumerAfter"]) {
      assert.throws(
        () => validateOpaqueWebRealConsumerEvidenceV1({ ...primaryEvidence, [section]: { ...primaryEvidence[section], [field]: sentinel } }),
        /unsupported field/,
      );
    }
  }
  assert.equal(JSON.stringify(primaryEvidence).includes(sentinel), false);
}

function runJsonTest(script) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

const baseline = readJson(BASELINE_PATH);
validateMigrationHistory(baseline);
const current = {
  contractVersions: currentVersions(),
  semanticHashes: currentSemanticHashes(),
};
const pinned = baseline.history.at(-1);
assert.deepEqual(current.contractVersions, pinned.contractVersions, "contract version drift requires an explicit longitudinal migration");
assert.deepEqual(current.semanticHashes, pinned.semanticHashes, "semantic contract drift requires a versioned longitudinal migration");

const committedCandidateOrder = readJson(CANDIDATE_ORDER_PATH);
assert.deepEqual(opaqueCandidateOrderFixtureVector(), committedCandidateOrder, "candidate ordering changed without candidateOrderVersion migration");

const primary = verifyConsumerEvidence(PRIMARY_EVIDENCE_PATH, PRIMARY_ACCEPTANCE_PATH, "primary");
const breadth = verifyConsumerEvidence(BREADTH_EVIDENCE_PATH, BREADTH_ACCEPTANCE_PATH, "breadth");
verifyPrivacyFailClosed(primary.evidence);

assert.deepEqual(portableVector(primary.evidence.source.steps), ["dom_activate:9"]);
assert.deepEqual(portableVector(breadth.evidence.source.steps), ["dom_activate:2"]);
assert.equal(primary.acceptance.before.classification, "consumer_boundary_divergence");
assert.equal(primary.acceptance.after.classification, "portable_replay_agrees");
assert.equal(breadth.acceptance.before.classification, "portable_replay_agrees");
assert.equal(breadth.acceptance.after.classification, "portable_replay_agrees");

const checkpointRegression = runJsonTest("scripts/test_web_coverage_guided_exploration.mjs");
assert.equal(checkpointRegression.checkpointReplayDeterministic, true, "checkpoint replay determinism regressed");
assert.ok(checkpointRegression.checkpointAwareStates >= 4, "checkpoint-aware state separation regressed");

const actionableRegression = runJsonTest("scripts/test_web_exploration_replay_gate.mjs");
assert.equal(actionableRegression.minimality, "one-minimal", "actionable one-minimal replay regressed");
assert.equal(actionableRegression.sameFindingReplay, 1, "same-finding replay qualification regressed");
assert.equal(actionableRegression.differentFindingReplay, 0, "same-code/different-finding replay was incorrectly accepted");
assert.equal(actionableRegression.budgetStatus, "budget-exhausted", "minimality budget exhaustion must remain explicit");

console.log(JSON.stringify({
  ok: true,
  runtime: "opaque-web-longitudinal-contract-stability-test",
  baselineVersion: baseline.version,
  baselineId: pinned.id,
  contractVersions: current.contractVersions,
  semanticHashes: current.semanticHashes,
  consumerEvidenceCount: 2,
  consumerSpecificAdapterLoc: 0,
  privacy: "fail-closed",
  deterministic: true,
  sourceMinimality: "one-minimal",
  peerMinimality: "not-one-minimal",
  checkpointIsolation: "deterministic",
  crossEngine: "source-peer-distinct",
  drift: false,
}));
