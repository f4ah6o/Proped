#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runUnknownWebProjectCampaign } from "../protocol/web-project-campaign.mjs";
import { runUnknownWebProjectBenchmark } from "../protocol/web-project-benchmark.mjs";
import { discoverWebProjectWorkspacePrebuild, prepareWebProjectWorkspace } from "../protocol/web-project-workspace-prebuild.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-workspace-prebuild-test");
const WORKSPACE = path.join(TMP, "workspace");
const PROJECT = path.join(WORKSPACE, "apps/web");
const BIN = path.join(TMP, "bin");
const MARKER = path.join(WORKSPACE, ".workspace-prebuild.json");

fs.rmSync(TMP, { recursive: true, force: true });
try {
  fs.mkdirSync(PROJECT, { recursive: true });
  fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE, "moon.work"), 'members = ["./modules/core"]\n');
  fs.writeFileSync(path.join(PROJECT, "index.html"), "<!doctype html><main><button>Workspace</button></main>\n");
  const fakeMoon = path.join(BIN, "moon");
  fs.writeFileSync(fakeMoon, `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.writeFileSync(".workspace-prebuild.json", JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n`);
  fs.chmodSync(fakeMoon, 0o755);

  const prebuild = discoverWebProjectWorkspacePrebuild(PROJECT, WORKSPACE);
  assert.equal(prebuild.kind, "moonbit-workspace");
  assert.equal(prebuild.root, fs.realpathSync(WORKSPACE));
  assert.equal(prebuild.descriptor, "moon.work");
  assert.deepEqual(prebuild.command, ["moon", "build", "--target", "js", "--release"]);
  assert.equal(prebuild.shell, false);

  const unavailable = prepareWebProjectWorkspace(prebuild, { sourceEnvironment: { ...process.env, PATH: "" } });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.status, "tool-unavailable");

  const sourceEnvironment = { ...process.env, PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ""}` };
  const blocked = runUnknownWebProjectCampaign(PROJECT, {
    prepare: false,
    workspaceRoot: WORKSPACE,
    sourceEnvironment,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.interventionReasons[0].code, "workspace_prepare_required");
  assert.equal(fs.existsSync(MARKER), false);

  const result = runUnknownWebProjectCampaign(PROJECT, {
    workspaceRoot: WORKSPACE,
    sourceEnvironment,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.autoOnboarded, true);
  assert.equal(result.humanInterventions, 0);
  assert.equal(result.workspacePreparation.status, "prepared");
  assert.equal(result.workspacePreparation.shell, false);
  assert.equal(result.workspacePreparation.credentials, "environment-allowlist-deny");
  assert.deepEqual(result.workspacePreparation.command, ["moon", "build", "--target", "js", "--release"]);
  const marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
  assert.deepEqual(marker.argv, ["build", "--target", "js", "--release"]);
  assert.equal(marker.cwd, fs.realpathSync(WORKSPACE));
  assert.equal(result.deterministicReplay, true);

  fs.rmSync(MARKER, { force: true });
  const benchmark = runUnknownWebProjectBenchmark([PROJECT], {
    workspaceRoots: [WORKSPACE],
    sourceEnvironment,
    writeArtifacts: false,
    sandboxMode: "caller-enforced",
  });
  assert.equal(benchmark.ok, true, JSON.stringify(benchmark));
  assert.equal(benchmark.autoOnboardedCount, 1);
  assert.equal(fs.existsSync(MARKER), true, "benchmark must pass the authorized workspace root into the campaign");

  const noDescriptorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proped-no-workspace-"));
  const noDescriptorProject = path.join(noDescriptorRoot, "app");
  fs.mkdirSync(noDescriptorProject);
  assert.equal(discoverWebProjectWorkspacePrebuild(noDescriptorProject, noDescriptorRoot), null);
  fs.rmSync(noDescriptorRoot, { recursive: true, force: true });

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "proped-outside-workspace-"));
  assert.throws(() => discoverWebProjectWorkspacePrebuild(outside, WORKSPACE), /does not contain/);
  fs.rmSync(outside, { recursive: true, force: true });

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-workspace-prebuild-test",
    kind: prebuild.kind,
    command: prebuild.command,
    blockedReason: blocked.interventionReasons[0].code,
    status: result.workspacePreparation.status,
    autoOnboarded: result.autoOnboarded,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
