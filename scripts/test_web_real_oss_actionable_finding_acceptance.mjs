#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME,
  WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION,
  compareRealOssActionableFindingEvidence,
  validateRealOssActionableFindingEvidence,
} from "../protocol/web-real-oss-actionable-finding-acceptance.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";

const acceptance = JSON.parse(fs.readFileSync("protocol/fixtures/real-oss-actionable-finding-acceptance.json", "utf8"));
const sourceCorpus = resolveWebProjectCorpus(acceptance.corpus);
const acceptanceContract = { ...acceptance, corpusSemanticHash: sourceCorpus.semanticHash };
const workflow = fs.readFileSync(".github/workflows/production-contracts.yml", "utf8");
assert.match(workflow, /actionable-acceptance-campaign:/);
assert.match(workflow, /campaign:\s*\n\s*- fresh-a\s*\n\s*- fresh-b/);
assert.match(workflow, /actionable-acceptance-compare:/);
assert.match(workflow, /needs:\s*\n\s*- shard\s*\n\s*- actionable-acceptance-compare/);
assert.doesNotMatch(workflow, /Accept pinned real OSS actionable finding/);

function evidence(campaignId, overrides = {}) {
  const trace = ["click:button:Crash"];
  const finding = {
    findingGroupId: acceptance.expectedFindingGroupId,
    actionable: true,
    grouping: "strong",
    memberFailureCodes: [acceptance.expectedFailureCode],
    occurrenceCount: 2,
    provenance: {
      topProjectFrame: { projectOwned: true, sourcePath: "src/app.js", function: "crash", line: 7, column: 3 },
      messageTemplate: "controlled failure token=<redacted>",
    },
    deterministic: true,
    replayable: true,
    representativeReplay: {
      trace,
      minimality: acceptance.expectedMinimality,
      sameFindingReplay: true,
      deterministic: true,
      shrinkEvaluationCount: 1,
      minimizedActionCount: 1,
      originalActionCount: 1,
    },
  };
  const base = {
    schemaVersion: WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_VERSION,
    runtime: WEB_REAL_OSS_ACTIONABLE_FINDING_EVIDENCE_RUNTIME,
    campaignId,
    target: {
      corpus: acceptance.corpus,
      corpusSemanticHash: acceptanceContract.corpusSemanticHash,
      targetId: acceptance.targetId,
      repository: acceptance.repository,
      revision: acceptance.revision,
      project: acceptance.project,
      adapterLoc: acceptance.adapterLoc,
    },
    execution: {
      sandboxMode: "strict",
      prepareTimeoutMs: 300_000,
      offline: false,
      campaignRuntime: "unknown-web-project-campaign",
      campaignSchemaVersion: 2,
      runnerVersion: "2",
      sandboxRequested: "strict",
      status: "completed",
      autoOnboarded: true,
      humanInterventions: 0,
      deterministicReplay: true,
      semanticHash: "campaign-hash",
      runtimeProfile: { framework: "docusaurus", packageManager: "yarn" },
    },
    checkout: { initialVerified: true, baselineCaptured: true, cleanupOk: true, finalVerified: true },
    artifacts: { summaryFindingMatched: true, humanIncidentValidated: true },
    finding,
    incident: {
      findingGroupId: acceptance.expectedFindingGroupId,
      actionable: true,
      minimalReplay: {
        actions: trace,
        minimality: acceptance.expectedMinimality,
        sameFindingReplay: true,
        deterministic: true,
        replayable: true,
      },
    },
    humanIncident: `Incident ${acceptance.expectedFindingGroupId}\n  failure: ${acceptance.expectedFailureCode}\n  status: actionable\n`,
    privacySafe: true,
    timing: { campaign: campaignId, totalMs: 500_000 },
  };
  return { ...base, ...overrides };
}

const first = evidence("fresh-a");
const second = evidence("fresh-b", { execution: { ...evidence("fresh-b").execution, semanticHash: "campaign-hash-2" } });
assert.equal(validateRealOssActionableFindingEvidence(first, acceptanceContract), first);
const compared = compareRealOssActionableFindingEvidence(first, second, acceptanceContract);
assert.equal(compared.ok, true);
assert.deepEqual(compared.freshCampaigns, ["fresh-a", "fresh-b"]);
assert.equal(compared.timing.parallelizableCriticalMs, 500_000);

assert.throws(() => compareRealOssActionableFindingEvidence(first, evidence("fresh-a"), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  target: { ...first.target, revision: "wrong-revision" },
}), acceptanceContract));
assert.throws(() => compareRealOssActionableFindingEvidence(first, evidence("fresh-b", {
  target: { ...first.target, corpusSemanticHash: "other-corpus-hash" },
}), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  execution: { ...second.execution, sandboxMode: "caller-enforced", sandboxRequested: "caller-enforced" },
}), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  checkout: { ...second.checkout, cleanupOk: false },
}), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  finding: { ...second.finding, findingGroupId: "finding@wrong" },
}), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  finding: {
    ...second.finding,
    representativeReplay: { ...second.finding.representativeReplay, minimality: "bounded" },
  },
}), acceptanceContract));
assert.throws(() => validateRealOssActionableFindingEvidence(evidence("fresh-b", {
  humanIncident: `Incident ${acceptance.expectedFindingGroupId}\n token=leaked\n status: actionable\n`,
}), acceptanceContract));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proped-actionable-acceptance-"));
try {
  const firstFile = path.join(tempRoot, "fresh-a.json");
  const secondFile = path.join(tempRoot, "fresh-b.json");
  const summaryFile = path.join(tempRoot, "summary.json");
  fs.writeFileSync(firstFile, `${JSON.stringify(first)}\n`);
  fs.writeFileSync(secondFile, `${JSON.stringify(second)}\n`);
  const cli = spawnSync(process.execPath, [
    "scripts/web_real_oss_actionable_finding_acceptance.mjs",
    "--compare-evidence", firstFile, secondFile,
    "--output", summaryFile,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const cliSummary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  assert.deepEqual(cliSummary.freshCampaigns, ["fresh-a", "fresh-b"]);
  assert.equal(cliSummary.findingGroupId, acceptance.expectedFindingGroupId);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, runtime: "real-oss-actionable-finding-acceptance-contract-test" }));
