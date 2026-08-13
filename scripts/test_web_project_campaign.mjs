#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyCampaignStageIntervention, classifyCampaignTargetViability, resolveCampaignSandboxMode, runUnknownWebProjectCampaign } from "../protocol/web-project-campaign.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-campaign-test");
const PROJECT = path.join(TMP, "unknown-static-app");
const SINGLE_HTML_PROJECT = path.join(TMP, "single-html-static-app");
const MULTI_HTML_PROJECT = path.join(TMP, "multi-html-static-app");
const CLI = path.join(ROOT, "scripts/proped.mjs");

function writeProject() {
  fs.mkdirSync(path.join(PROJECT, "vendor", "vite"), { recursive: true });
  fs.writeFileSync(path.join(PROJECT, "index.html"), "<!doctype html><main><h1>Campaign</h1><button>Add item</button></main>\n");
  fs.writeFileSync(path.join(PROJECT, "build.mjs"), "import fs from 'node:fs'; fs.mkdirSync('dist/client/assets', { recursive: true }); fs.writeFileSync('dist/client/index.html', '<!doctype html><main><h1>Campaign</h1><button>Add item</button><script src=\"/assets/app.js\"></script></main>\\n'); fs.writeFileSync('dist/client/assets/app.js', 'document.body.dataset.nested=\"ready\";\\n'); fs.writeFileSync('dist/.build-ok', 'ok\\n');\n");
  fs.writeFileSync(path.join(PROJECT, "vendor", "vite", "package.json"), `${JSON.stringify({
    name: "vite",
    version: "1.0.0",
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(PROJECT, "package.json"), `${JSON.stringify({
    name: "unknown-static-campaign-app",
    version: "1.0.0",
    scripts: { build: "node build.mjs" },
    dependencies: { vite: "file:vendor/vite" },
  }, null, 2)}\n`);
  const lock = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline"], {
    cwd: PROJECT,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(lock.status, 0, lock.stderr);
  fs.rmSync(path.join(PROJECT, "node_modules"), { recursive: true, force: true });
}

fs.rmSync(TMP, { recursive: true, force: true });
assert.equal(resolveCampaignSandboxMode("auto", "strict", "darwin"), "constrained");
assert.equal(resolveCampaignSandboxMode("auto", "strict", "linux"), "strict");
assert.equal(resolveCampaignSandboxMode("auto", "strict", "win32"), "strict");
assert.equal(resolveCampaignSandboxMode("manifest", "strict", "darwin"), "strict");
assert.equal(resolveCampaignSandboxMode("caller-enforced", "strict", "darwin"), "caller-enforced");
assert.equal(classifyCampaignStageIntervention([{ id: "project-build", kind: "check", required: true, status: "execution_failed", diagnostic: "build failed" }]).code, "project_build_failed");
assert.equal(classifyCampaignStageIntervention([{ id: "generic-browser", kind: "browser", required: true, status: "usage_error", diagnostic: "server readiness timeout after 30000ms" }]).code, "server_readiness_failed");
assert.equal(classifyCampaignStageIntervention([{ id: "generic-browser", kind: "browser", required: true, status: "timeout", diagnostic: null }]).code, "campaign_stage_timeout");
assert.equal(classifyCampaignStageIntervention([{ id: "generic-browser", kind: "browser", required: true, status: "usage_error", diagnostic: "static output missing" }]).code, "browser_stage_failed");
assert.deepEqual(classifyCampaignTargetViability({ autoOnboarded: true }), { status: "qualified", stage: "campaign", reason: "full_campaign_completed" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "prepare_failed" }] }), { status: "failed", stage: "dependency-install", reason: "declared_dependency_install_failed" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "prepare_timeout" }] }), { status: "unknown", stage: "dependency-install", reason: "dependency_install_timeout" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "workspace_prepare_failed" }], details: { workspacePreparation: { descriptor: "package.json#workspaces" } } }), { status: "failed", stage: "workspace-build", reason: "declared_workspace_build_failed" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "project_build_failed" }], inspection: { commands: { build: { source: "scripts.build" } } } }), { status: "failed", stage: "project-build", reason: "declared_project_build_failed" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "server_readiness_failed" }], inspection: { commands: { serve: { source: "scripts.start" } } } }), { status: "failed", stage: "managed-start", reason: "declared_server_unhealthy" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "browser_stage_failed" }], stages: [{ id: "generic-browser", status: "usage_error", exitCode: 2 }] }), { status: "qualified", stage: "browser", reason: "lifecycle_reached_browser" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "browser_stage_failed" }], stages: [{ id: "project-build", status: "quality_gate_failed", exitCode: 1 }, { id: "generic-browser", status: "blocked", exitCode: null }], inspection: { commands: { build: { source: "scripts.build" } } } }), { status: "failed", stage: "project-build", reason: "declared_project_build_failed" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "browser_stage_failed" }], stages: [{ id: "generic-browser", status: "blocked", exitCode: null }] }), { status: "unknown", stage: "browser", reason: "browser_lifecycle_not_reached" });
assert.deepEqual(classifyCampaignTargetViability({ interventionReasons: [{ code: "campaign_stage_timeout" }], stages: [{ id: "generic-browser", status: "timeout", exitCode: 2 }] }), { status: "qualified", stage: "browser", reason: "lifecycle_reached_browser" });
try {
  writeProject();

  const blocked = runUnknownWebProjectCampaign(PROJECT, {
    prepare: false,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.autoOnboarded, false);
  assert.equal(blocked.humanInterventions, 1);
  assert.equal(blocked.interventionReasons[0].code, "prepare_required");
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules")), false);

  fs.mkdirSync(SINGLE_HTML_PROJECT, { recursive: true });
  fs.writeFileSync(path.join(SINGLE_HTML_PROJECT, "calculator.html"), "<!doctype html><main><button>Calculate</button></main>\n");
  const singleHtml = runUnknownWebProjectCampaign(SINGLE_HTML_PROJECT, {
    prepare: false,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(singleHtml.ok, true, JSON.stringify(singleHtml));
  assert.equal(singleHtml.autoOnboarded, true);
  assert.equal(singleHtml.humanInterventions, 0);
  assert.equal(singleHtml.deterministicReplay, true);

  fs.mkdirSync(MULTI_HTML_PROJECT, { recursive: true });
  fs.writeFileSync(path.join(MULTI_HTML_PROJECT, "one.html"), "<!doctype html><main>One</main>\n");
  fs.writeFileSync(path.join(MULTI_HTML_PROJECT, "two.html"), "<!doctype html><main>Two</main>\n");
  const multiHtml = runUnknownWebProjectCampaign(MULTI_HTML_PROJECT, {
    prepare: false,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(multiHtml.ok, false);
  assert.equal(multiHtml.autoOnboarded, false);
  assert.equal(multiHtml.interventionReasons[0].code, "server_review_required");

  const result = runUnknownWebProjectCampaign(PROJECT, {
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.status, "completed");
  assert.equal(result.autoOnboarded, true);
  assert.equal(result.humanInterventions, 0);
  assert.deepEqual(result.interventionReasons, []);
  assert.equal(result.preparation.status, "prepared");
  assert.equal(result.preparation.credentials, "environment-allowlist-deny");
  assert.equal(result.preparation.shell, false);
  assert.equal(result.packageManagerRuntime.status, "ready");
  assert.equal(result.runtimeProfile.framework, "vite");
  assert.equal(result.runtimeProfile.projectMode, "spa");
  assert.equal(result.runtimeProfile.packageManager, "npm");
  assert.equal(singleHtml.runtimeProfile.framework, "static");
  assert.equal(singleHtml.runtimeProfile.serverMode, "static-output");
  assert.equal(result.deterministicReplay, true);
  assert.ok(result.metrics.actions > 0, JSON.stringify(result.metrics));
  assert.ok(result.metrics.transitions > 0, JSON.stringify(result.metrics));
  assert.ok(result.stages.some((stage) => stage.id === "project-build" && stage.status === "pass"));
  assert.ok(result.stages.some((stage) => stage.id === "generic-browser" && stage.status === "pass"));
  assert.equal(fs.readFileSync(path.join(PROJECT, "dist", ".build-ok"), "utf8"), "ok\n");

  if (process.platform === "darwin") {
    const hostSafe = runUnknownWebProjectCampaign(PROJECT, { writeArtifacts: false });
    assert.equal(hostSafe.ok, true, JSON.stringify(hostSafe));
    assert.equal(hostSafe.sandboxRequested, "constrained");
  }

  fs.rmSync(path.join(PROJECT, ".proped"), { recursive: true, force: true });
  const cli = spawnSync(process.execPath, [CLI, "web", "campaign", PROJECT, "--sandbox-mode", "caller-enforced"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(cli.status, 0, cli.stderr);
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.autoOnboarded, true);
  assert.equal(cliResult.humanInterventions, 0);
  assert.equal(cliResult.deterministicReplay, true);
  assert.equal(fs.existsSync(path.join(PROJECT, ".proped", "campaign", "summary.json")), true);
  assert.equal(fs.existsSync(path.join(PROJECT, ".proped", "campaign", "inferred-manifest.json")), true);
  const persisted = JSON.parse(fs.readFileSync(path.join(PROJECT, ".proped", "campaign", "summary.json"), "utf8"));
  assert.equal(persisted.autoOnboarded, true);
  assert.equal(persisted.humanInterventions, 0);

  const help = spawnSync(process.execPath, [CLI, "--help"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /web campaign <project>/);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-campaign-test",
    autoOnboarded: result.autoOnboarded,
    humanInterventions: result.humanInterventions,
    preparation: result.preparation.status,
    deterministicReplay: result.deterministicReplay,
    metrics: result.metrics,
    stages: result.stages,
    singleHtmlAutoOnboarded: singleHtml.autoOnboarded,
    multiHtmlFailClosed: multiHtml.interventionReasons[0].code,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
