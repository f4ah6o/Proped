#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWebProjectManifest,
  runWebProject,
  runWebProjectConcurrent,
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
    ...(options.exclusiveResources !== undefined ? { exclusiveResources: options.exclusiveResources } : {}),
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
assert.ok(sample.stages.every((item) => Array.isArray(item.exclusiveResources)));

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
    stage("resource-escape", [process.execPath, "-e", "0"], { exclusiveResources: ["../outside"] }),
  ]), ROOT),
  /exclusiveResources.*escapes repository root/,
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

  const parallelStages = [
    stage("parallel-a", [process.execPath, "-e", "setTimeout(()=>console.log(JSON.stringify({ok:true,semanticHash:'pa'})),300)"], { exclusiveResources: [] }),
    stage("parallel-b", [process.execPath, "-e", "setTimeout(()=>console.log(JSON.stringify({ok:true,semanticHash:'pb'})),300)"], { exclusiveResources: [] }),
    stage("parallel-join", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'pj'}))"], {
      dependsOn: ["parallel-a", "parallel-b"],
      exclusiveResources: [],
    }),
  ];
  const parallelStarted = performance.now();
  const parallel = await runWebProjectConcurrent(
    ROOT,
    manifest(parallelStages, ".tmp/web-project-runner-test/parallel"),
    { writeArtifacts: false, maxConcurrency: 4 },
  );
  const parallelElapsed = performance.now() - parallelStarted;
  assert.equal(parallel.ok, true);
  assert.deepEqual(parallel.stages.map((item) => item.id), ["parallel-a", "parallel-b", "parallel-join"]);
  assert.ok(parallelElapsed < 560, `safe independent stages should overlap, observed ${parallelElapsed}ms`);
  const parallelReplay = await runWebProjectConcurrent(
    ROOT,
    manifest(parallelStages, ".tmp/web-project-runner-test/parallel-replay"),
    { writeArtifacts: false, maxConcurrency: 4 },
  );
  assert.equal(parallelReplay.semanticHash, parallel.semanticHash);

  const resourceLock = path.join(TMP, "resource.lock");
  const lockProgram = `const fs=require('node:fs');const p=${JSON.stringify(resourceLock)};try{fs.writeFileSync(p,'locked',{flag:'wx'});}catch{process.exit(9);}setTimeout(()=>{fs.rmSync(p,{force:true});console.log(JSON.stringify({ok:true,semanticHash:'lock'}));},120);`;
  const locked = await runWebProjectConcurrent(
    ROOT,
    manifest([
      stage("locked-a", [process.execPath, "-e", lockProgram], { exclusiveResources: [".tmp/web-project-runner-test/shared"] }),
      stage("locked-b", [process.execPath, "-e", lockProgram], { exclusiveResources: [".tmp/web-project-runner-test/shared"] }),
    ], ".tmp/web-project-runner-test/locked"),
    { writeArtifacts: false, maxConcurrency: 4 },
  );
  assert.equal(locked.ok, true, "stages sharing an exclusive resource must be serialized");

  const unknownLock = path.join(TMP, "unknown-resource.lock");
  const unknownLockProgram = `const fs=require('node:fs');const p=${JSON.stringify(unknownLock)};try{fs.writeFileSync(p,'locked',{flag:'wx'});}catch{process.exit(9);}setTimeout(()=>{fs.rmSync(p,{force:true});console.log(JSON.stringify({ok:true,semanticHash:'unknown'}));},80);`;
  const conservative = await runWebProjectConcurrent(
    ROOT,
    manifest([
      stage("unknown-a", [process.execPath, "-e", unknownLockProgram]),
      stage("unknown-b", [process.execPath, "-e", unknownLockProgram]),
    ], ".tmp/web-project-runner-test/conservative"),
    { writeArtifacts: false, maxConcurrency: 4 },
  );
  assert.equal(conservative.ok, true, "undeclared resource stages must retain conservative serial behavior");

  const concurrentFailure = await runWebProjectConcurrent(
    ROOT,
    manifest([
      stage("parallel-fail", [process.execPath, "-e", "process.exit(1)"], { exclusiveResources: [] }),
      stage("parallel-independent", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'independent'}))"], { exclusiveResources: [] }),
      stage("parallel-blocked", [process.execPath, "-e", "process.exit(99)"], {
        dependsOn: ["parallel-fail"],
        exclusiveResources: [],
      }),
    ], ".tmp/web-project-runner-test/concurrent-failure"),
    { writeArtifacts: false, maxConcurrency: 4 },
  );
  assert.equal(concurrentFailure.ok, false);
  assert.deepEqual(concurrentFailure.stages.map((item) => item.status), ["quality_gate_failed", "pass", "blocked"]);
  assert.deepEqual(concurrentFailure.stages[2].blockedBy, ["parallel-fail"]);

  const targetBin = path.join(TMP, "target-node-bin");
  fs.mkdirSync(targetBin, { recursive: true });
  const targetNode = path.join(targetBin, "node");
  fs.writeFileSync(targetNode, "#!/bin/sh\nprintf '%s\n' 'v22.22.3'\n");
  fs.chmodSync(targetNode, 0o755);
  const targetEnvironment = { ...process.env, PATH: `${targetBin}${path.delimiter}${process.env.PATH ?? ""}` };
  const targetRuntimeRun = runWebProject(
    ROOT,
    manifest([stage("target-node", ["node", "--version"])] , ".tmp/web-project-runner-test/target-runtime"),
    { sourceEnvironment: targetEnvironment, writeArtifacts: false },
  );
  assert.equal(targetRuntimeRun.ok, true);
  assert.match(targetRuntimeRun.stages[0].stdoutTail, /v22\.22\.3/);

  if (process.platform !== "win32") {
    const lingeringPidFile = path.join(TMP, "lingering-child.pid");
    const lingering = runWebProject(
      ROOT,
      manifest([stage("isolated-process-tree", [
        process.execPath,
        "-e",
        `const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});c.unref();fs.writeFileSync(${JSON.stringify(lingeringPidFile)},String(c.pid));`,
      ])], ".tmp/web-project-runner-test/isolated"),
      { writeArtifacts: false },
    );
    assert.equal(lingering.ok, true);
    const lingeringPid = fs.readFileSync(lingeringPidFile, "utf8").trim();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const lingeringCheck = spawnSync("ps", ["-p", lingeringPid, "-o", "pid="], { encoding: "utf8", shell: false });
    assert.equal(lingeringCheck.stdout.trim(), "", "successful stage cleanup must terminate background descendants");
  }

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
  assert.deepEqual(failed.stages[0].payload.qualityFailureCodes, ["mutation_score_below_minimum"]);

  const genericQuality = runWebProject(
    ROOT,
    manifest([
      stage(
        "generic-quality-fail",
        [process.execPath, "-e", "console.log(JSON.stringify({ok:false,semanticHash:'real-app',failureCount:2,failures:[{property:'reload_persists_todos'},{failureClass:'escape_cancels_edit'}]}));process.exit(1)"],
        { kind: "quality" },
      ),
    ], ".tmp/web-project-runner-test/generic-quality-out"),
  );
  assert.equal(genericQuality.ok, false);
  assert.deepEqual(
    genericQuality.stages[0].payload.qualityFailureCodes,
    ["reload_persists_todos", "escape_cancels_edit"],
  );
  assert.equal(genericQuality.stages[0].payload.canonicalFailureClusterCount, 2);
  assert.equal(genericQuality.stages[0].payload.canonicalFailureClassIds.length, 2);
  const genericAtlas = JSON.parse(fs.readFileSync(path.join(TMP, "generic-quality-out/atlas.json"), "utf8"));
  assert.deepEqual(
    genericAtlas.stages[0].qualityFailureCodes,
    ["reload_persists_todos", "escape_cancels_edit"],
  );
  assert.equal(genericAtlas.stages[0].canonicalFailureClassIds.length, 2);

  const custom = runWebProject(
    ROOT,
    manifest([stage("pass", [process.execPath, "-e", "console.log(JSON.stringify({ok:true,semanticHash:'eee'}))"])]),
    { output: ".tmp/web-project-runner-test/custom" },
  );
  assert.equal(custom.ok, true);
  assert.equal(fs.existsSync(path.join(TMP, "custom/summary.json")), true);

  const corepackEnvironment = runWebProject(
    ROOT,
    manifest([stage("corepack-env", [process.execPath, "-e", "if(process.env.COREPACK_ENABLE_NETWORK!=='0')process.exit(7);console.log(JSON.stringify({ok:true,semanticHash:'corepack'}))"])]),
    { writeArtifacts: false, sourceEnvironment: { ...process.env, COREPACK_ENABLE_NETWORK: "0" } },
  );
  assert.equal(corepackEnvironment.ok, true);

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

  const sandboxOnValidate = cli(["validate", SAMPLE, "--strict-sandbox"]);
  assert.equal(sandboxOnValidate.status, 2);
  assert.equal(JSON.parse(sandboxOnValidate.stderr).error, "invalid_arguments");

  const writableOnValidate = cli(["validate", SAMPLE, "--writable", ".tmp/build"]);
  assert.equal(writableOnValidate.status, 2);
  assert.equal(JSON.parse(writableOnValidate.stderr).error, "invalid_arguments");
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
  targetRuntimeEnvironment: true,
  isolatedProcessTreeCleanup: process.platform !== "win32",
  concurrentScheduler: true,
  explicitResourceLocks: true,
}));
