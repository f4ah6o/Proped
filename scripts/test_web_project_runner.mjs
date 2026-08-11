#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWebProjectManifest,
  runWebProject,
  validateWebProjectManifest,
} from "../protocol/web-project-runner.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "web_project_runner.mjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = "web/project-manifests/proped-web-quality.json";
const TMP = path.join(ROOT, ".tmp/web-project-runner-test");

function stage(id, command, options = {}) {
  return {
    id,
    kind: options.kind ?? "check",
    cwd: options.cwd ?? ".",
    command,
    timeoutMs: options.timeoutMs ?? 5000,
    dependsOn: options.dependsOn ?? [],
    required: options.required ?? true,
  };
}

function manifest(stages, output = ".tmp/web-project-runner-test/out") {
  return {
    schemaVersion: 1,
    id: "runner-test",
    projectRoot: ".",
    safety: {
      network: "caller-enforced-deny",
      filesystemWrites: "caller-enforced-artifacts-and-build-output",
      upstreamWrites: "caller-enforced-deny",
      credentials: "caller-enforced-deny",
    },
    stages,
    artifacts: { output },
  };
}

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10000,
  });
}

const sample = loadWebProjectManifest(ROOT, SAMPLE);
assert.equal(sample.id, "proped-web-quality");
assert.equal(sample.stages.length, 13);
assert.equal(sample.stages.find((item) => item.id === "cross-mode-replay").dependsOn.length, 3);

assert.throws(
  () => validateWebProjectManifest({ ...sample, unexpected: true }, ROOT),
  /unknown field unexpected/,
);
assert.throws(
  () => validateWebProjectManifest({ ...sample, projectRoot: ".." }, ROOT),
  /escapes repository root/,
);
assert.throws(
  () => validateWebProjectManifest(manifest([stage("escape", [process.execPath, "-e", "0"], { cwd: ".." })]), ROOT),
  /escapes repository root/,
);
assert.throws(
  () => validateWebProjectManifest(manifest([
    stage("same", [process.execPath, "-e", "0"]),
    stage("same", [process.execPath, "-e", "0"]),
  ]), ROOT),
  /duplicate stage id same/,
);
assert.throws(
  () => validateWebProjectManifest(manifest([
    stage("first", [process.execPath, "-e", "0"], { dependsOn: ["later"] }),
    stage("later", [process.execPath, "-e", "0"]),
  ]), ROOT),
  /unknown or later stage later/,
);

fs.rmSync(TMP, { recursive: true, force: true });
try {
  fs.mkdirSync(TMP, { recursive: true });
  const outsideLink = path.join(TMP, "outside-link");
  fs.symlinkSync("/tmp", outsideLink);
  assert.throws(
    () => validateWebProjectManifest(manifest([
      stage("symlink-escape", [process.execPath, "-e", "0"], { cwd: path.relative(ROOT, outsideLink) }),
    ]), ROOT),
    /escapes repository root through a symlink/,
  );
  assert.throws(
    () => runWebProject(ROOT, manifest([
      stage("pass", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'link'}))"]),
    ], `${path.relative(ROOT, outsideLink)}/artifacts`)),
    /escapes repository root through a symlink/,
  );

  process.env.PROPED_RUNNER_TEST_SECRET = "sensitive";
  const success = runWebProject(ROOT, manifest([
    stage("first", [process.execPath, "-e", "if(process.env.PROPED_RUNNER_TEST_SECRET)process.exit(7);console.log(JSON.stringify({ok:true,semanticHash:'aaa'}))"]),
    stage("second", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'bbb',qualityGate:{ok:true,failures:[]}}))"], {
      kind: "quality",
      dependsOn: ["first"],
    }),
  ]));
  assert.equal(success.ok, true);
  assert.equal(success.passedStageCount, 2);
  assert.equal(success.requiredFailureCount, 0);
  assert.equal(success.stages[1].payload.semanticHash, "bbb");
  assert.deepEqual(
    fs.readdirSync(path.join(TMP, "out")).sort(),
    ["atlas.dot", "atlas.html", "atlas.json", "atlas.svg", "summary.json"],
  );

  const suppressedPath = ".tmp/web-project-runner-test/suppressed";
  const suppressed = runWebProject(
    ROOT,
    manifest([stage("pass", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'ccc'}))"])], suppressedPath),
    { writeArtifacts: false },
  );
  assert.equal(suppressed.ok, true);
  assert.equal(suppressed.output, null);
  assert.equal(fs.existsSync(path.join(ROOT, suppressedPath)), false);

  const failed = runWebProject(ROOT, manifest([
    stage("quality-fail", [process.execPath, "-e", "console.error(JSON.stringify({ok:false,semanticHash:'ddd',qualityGate:{ok:false,failures:[{code:'mutation_score_below_minimum'}]}}));process.exit(1)"], { kind: "quality" }),
    stage("blocked", [process.execPath, "-e", "process.exit(99)"], { dependsOn: ["quality-fail"] }),
    stage("usage", [process.execPath, "-e", "process.exit(2)"]),
    stage("execution", [process.execPath, "-e", "process.exit(7)"]),
    stage("timeout", [process.execPath, "-e", "setTimeout(()=>{},1000)"], { timeoutMs: 50 }),
  ], ".tmp/web-project-runner-test/fail-out"));
  assert.equal(failed.ok, false);
  assert.equal(failed.requiredFailureCount, 5);
  assert.deepEqual(
    failed.stages.map((item) => item.status),
    ["quality_gate_failed", "blocked", "usage_error", "execution_failed", "timeout"],
  );
  assert.deepEqual(failed.stages[1].blockedBy, ["quality-fail"]);
  assert.deepEqual(
    failed.stages[0].payload.qualityGate.failures.map((failure) => failure.code),
    ["mutation_score_below_minimum"],
  );

  const custom = runWebProject(
    ROOT,
    manifest([stage("pass", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'eee'}))"])]),
    { output: ".tmp/web-project-runner-test/custom" },
  );
  assert.equal(custom.ok, true);
  assert.equal(fs.existsSync(path.join(TMP, "custom/summary.json")), true);

  const tempManifest = path.join(TMP, "cli-manifest.json");
  fs.writeFileSync(tempManifest, `${JSON.stringify(manifest([
    stage("cli-pass", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'fff'}))"]),
  ]), null, 2)}\n`);
  const relativeManifest = path.relative(ROOT, tempManifest);

  const validated = cli(["validate", SAMPLE]);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).stageCount, 13);

  const cliRun = cli(["run", relativeManifest, "--no-artifacts"]);
  assert.equal(cliRun.status, 0, cliRun.stderr);
  assert.equal(JSON.parse(cliRun.stdout).output, null);

  const badCli = cli(["unknown", SAMPLE]);
  assert.equal(badCli.status, 2);
  assert.equal(JSON.parse(badCli.stderr).error, "invalid_arguments");
} finally {
  delete process.env.PROPED_RUNNER_TEST_SECRET;
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  runtime: "web-project-runner-test",
  sampleManifest: sample.id,
  sampleStageCount: sample.stages.length,
  classifications: ["pass", "quality_gate_failed", "blocked", "usage_error", "execution_failed", "timeout"],
}));
