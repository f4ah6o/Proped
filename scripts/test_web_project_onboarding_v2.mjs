#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import {
  compileWebProjectManifestV2,
  createWebProjectManifestV2FromInspection,
} from "../protocol/web-project-manifest-v2.mjs";
import { diagnoseWebProjectManifestV2 } from "../protocol/web-project-doctor.mjs";
import { runWebProject } from "../protocol/web-project-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-onboarding-v2-test");
const PROJECT = path.join(TMP, "unknown-vite-app");
const INIT = path.join(ROOT, "scripts/web_project_init.mjs");
const DOCTOR = path.join(ROOT, "scripts/web_project_doctor.mjs");
const COMPILE = path.join(ROOT, "scripts/web_project_compile.mjs");

function cli(script, args, cwd = ROOT) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
}

fs.rmSync(TMP, { recursive: true, force: true });
try {
  fs.mkdirSync(path.join(PROJECT, "src"), { recursive: true });
  fs.mkdirSync(path.join(PROJECT, "dist"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT, "package.json"), `${JSON.stringify({
    name: "unknown-vite-app",
    scripts: { build: "vite build", preview: "vite preview" },
    dependencies: { vite: "8.0.0" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(PROJECT, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(PROJECT, "src/app.js"), "localStorage.setItem('boot','yes');\n");
  fs.writeFileSync(path.join(PROJECT, "index.html"), "<!doctype html><main><button>Source</button></main>\n");
  fs.writeFileSync(path.join(PROJECT, "dist/index.html"), `<!doctype html><main><h1>Unknown Vite</h1><button>Add item</button><label><input type="checkbox"> Show archived</label><button>Delete account</button></main>`);

  const inspection = inspectWebProject(PROJECT);
  assert.equal(inspection.framework.name, "vite");
  assert.equal(inspection.project.mode, "spa");
  assert.equal(inspection.project.outputDir, "dist");
  assert.ok(inspection.runtime.stateSources.includes("localStorage"));

  const readOnlyInit = cli(INIT, [PROJECT]);
  assert.equal(readOnlyInit.status, 0, readOnlyInit.stderr);
  const generatedStdout = JSON.parse(readOnlyInit.stdout);
  assert.equal(generatedStdout.schemaVersion, 2);
  assert.equal(generatedStdout.project.root, ".");
  assert.equal(generatedStdout.server.mode, "static-output");
  assert.equal(generatedStdout.exploration.mode, "coverage-guided");
  assert.ok(generatedStdout.properties.packs.includes("reload-persistence"));
  assert.equal(fs.existsSync(path.join(PROJECT, "proped.web.json")), false);

  const manifestFile = path.join(PROJECT, "proped.web.json");
  const writeInit = cli(INIT, [PROJECT, "--output", manifestFile]);
  assert.equal(writeInit.status, 0, writeInit.stderr);
  assert.equal(fs.existsSync(manifestFile), true);
  const written = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  assert.deepEqual(written, JSON.parse(writeInit.stdout));

  const doctor = cli(DOCTOR, [manifestFile]);
  assert.equal(doctor.status, 0, doctor.stderr);
  const doctorReport = JSON.parse(doctor.stdout);
  assert.equal(doctorReport.ok, true);
  assert.equal(doctorReport.failureCount, 0);
  assert.ok(doctorReport.checks.some((check) => check.id === "v1-compile" && check.status === "pass"));

  const compiledCli = cli(COMPILE, [manifestFile]);
  assert.equal(compiledCli.status, 0, compiledCli.stderr);
  const compiledReport = JSON.parse(compiledCli.stdout);
  assert.equal(compiledReport.manifest.schemaVersion, 1);
  assert.deepEqual(compiledReport.manifest.stages.map((stage) => stage.id), ["project-build", "generic-browser"]);
  assert.equal(compiledReport.execution.sandboxMode, "strict");
  assert.equal(compiledReport.execution.strictSandbox, true);
  assert.deepEqual(compiledReport.execution.writablePaths, ["dist"]);

  // Run the same generated configuration without the build stage, using the
  // already prepared static output. This proves the v2 -> v1 -> managed browser
  // vertical slice without target-specific executable JS.
  const runnable = createWebProjectManifestV2FromInspection(inspection, {
    projectRoot: path.relative(ROOT, PROJECT),
    id: "unknown-vite-runnable",
  });
  runnable.bootstrap.build = null;
  runnable.sandbox.mode = "caller-enforced";
  runnable.artifacts.output = ".tmp/web-project-onboarding-v2-test/artifacts";
  const directDoctor = diagnoseWebProjectManifestV2(runnable, ROOT);
  assert.equal(directDoctor.ok, true);
  const compiled = compileWebProjectManifestV2(runnable, ROOT);
  assert.deepEqual(compiled.manifest.stages.map((stage) => stage.id), ["generic-browser"]);
  const report = runWebProject(ROOT, compiled.manifest, { writeArtifacts: false });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.passedStageCount, 1);
  assert.equal(report.stages[0].payload.runtime, "generic-web-browser-stage");
  assert.equal(report.stages[0].payload.metrics.locatorUniqueness, 1);
  assert.equal(report.stages[0].payload.replayGate.attempts, 3);
  assert.equal(report.stages[0].payload.replayGate.deterministic, true);
  assert.equal(report.stages[0].payload.replayGate.stableFailureCount, 0);
  assert.equal(report.stages[0].payload.exploration.runtime, "web-coverage-guided-exploration");
  assert.ok(report.stages[0].payload.exploration.transitions > 0);
  assert.ok(report.stages[0].payload.metrics.riskCounts.destructive >= 1);
  assert.ok(report.stages[0].payload.exploration.transitionGraph.every((edge) => !edge.actionId.includes("Delete account")));

  const runnableFile = path.join(TMP, "runnable.web.json");
  fs.writeFileSync(runnableFile, `${JSON.stringify(runnable, null, 2)}\n`);
  const v2Run = cli(path.join(ROOT, "scripts/web_project_run_v2.mjs"), [
    runnableFile,
    "--repository-root", ROOT,
    "--sandbox-mode", "caller-enforced",
    "--no-artifacts",
  ]);
  assert.equal(v2Run.status, 0, v2Run.stderr);
  const v2Report = JSON.parse(v2Run.stdout);
  assert.equal(v2Report.ok, true);
  assert.equal(v2Report.manifestVersion, 2);
  assert.equal(v2Report.sandboxRequested, "caller-enforced");
  assert.equal(v2Report.stages[0].payload.replayGate.attempts, 3);

  if (process.platform === "darwin") {
    const constrainedRun = cli(path.join(ROOT, "scripts/web_project_run_v2.mjs"), [
      runnableFile,
      "--repository-root", ROOT,
      "--sandbox-mode", "constrained",
      "--no-artifacts",
    ]);
    assert.equal(constrainedRun.status, 0, constrainedRun.stderr);
    const constrainedReport = JSON.parse(constrainedRun.stdout);
    assert.equal(constrainedReport.ok, true);
    assert.equal(constrainedReport.sandboxRequested, "constrained");
    assert.equal(constrainedReport.sandbox.mode, "constrained");
    assert.equal(constrainedReport.sandbox.backend, "sandbox-exec");
    assert.deepEqual(constrainedReport.sandbox.capabilities, {
      filesystem: "constrained",
      network: "constrained",
      process: "constrained",
    });
  }

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-onboarding-v2-test",
    framework: inspection.framework.name,
    generatedServerMode: written.server.mode,
    propertyPacks: written.properties.packs,
    compiledStages: compiledReport.manifest.stages.map((stage) => stage.id),
    verticalSliceStages: report.stages.map((stage) => stage.status),
    locatorUniqueness: report.stages[0].payload.metrics.locatorUniqueness,
    replayAttempts: report.stages[0].payload.replayGate.attempts,
    explorationTransitions: report.stages[0].payload.exploration.transitions,
    destructiveExplorationFiltered: report.stages[0].payload.exploration.transitionGraph.every((edge) => !edge.actionId.includes("Delete account")),
    v2RunnerCli: v2Report.ok,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
