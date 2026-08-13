#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { discoverWebProjectWorkspacePrebuild, prepareWebProjectWorkspace } from "../protocol/web-project-workspace-prebuild.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-javascript-workspace-prebuild-test");
const WORKSPACE = path.join(TMP, "workspace");
const PROJECT = path.join(WORKSPACE, "packages/web");
const SHARED = path.join(WORKSPACE, "packages/shared");
const BIN = path.join(TMP, "bin");
const MARKER = path.join(SHARED, ".workspace-prebuild.json");

fs.rmSync(TMP, { recursive: true, force: true });
try {
  fs.mkdirSync(PROJECT, { recursive: true });
  fs.mkdirSync(SHARED, { recursive: true });
  fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE, "package.json"), `${JSON.stringify({
    name: "workspace-root",
    private: true,
    packageManager: "yarn@3.3.1",
    workspaces: ["packages/*"],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(WORKSPACE, "yarn.lock"), "__metadata:\n  version: 6\n");
  fs.writeFileSync(path.join(WORKSPACE, ".pnp.cjs"), "module.exports = {};\n");
  fs.writeFileSync(path.join(SHARED, "package.json"), `${JSON.stringify({
    name: "@workspace/shared",
    scripts: { build: "node build.js" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(PROJECT, "package.json"), `${JSON.stringify({
    name: "@workspace/web",
    scripts: { build: "vite build", preview: "vite preview" },
    dependencies: { "@workspace/shared": "workspace:*", vite: "4.0.0" },
  }, null, 2)}\n`);
  const gitInit = spawnSync("git", ["init", "-q"], { cwd: WORKSPACE, encoding: "utf8", shell: false });
  assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);

  const fakeCorepack = path.join(BIN, "corepack");
  fs.writeFileSync(fakeCorepack, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
if (process.argv.includes("--version")) {
  console.log("3.3.1");
  process.exit(0);
}
const cwd = process.cwd();
if (process.argv.includes("install")) {
  fs.mkdirSync(".yarn", { recursive: true });
  fs.writeFileSync(".yarn/install-state.gz", "fixture");
} else if (cwd.endsWith(path.join("packages", "shared"))) {
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/index.js", "export const value = 1;");
  fs.writeFileSync(".workspace-prebuild.json", JSON.stringify({ argv: process.argv.slice(2), cwd }));
} else if (cwd.endsWith(path.join("packages", "web"))) {
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/index.html", "<!doctype html><main><button>Workspace JS</button></main>");
}
`);
  fs.chmodSync(fakeCorepack, 0o755);
  const sourceEnvironment = {
    ...process.env,
    PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ""}`,
  };

  const inspection = inspectWebProject(PROJECT);
  assert.equal(inspection.packageManager.name, "yarn");
  assert.equal(inspection.packageManager.reference, "yarn@3.3.1");
  assert.equal(inspection.packageManager.referenceSource, "ancestor-packageManager");
  assert.equal(inspection.packageManager.installRoot, "../..");
  assert.equal(inspection.packageManager.installMode, "pnp");
  assert.deepEqual(inspection.commands.build.argv, ["corepack", "yarn", "run", "build"]);

  const prebuild = discoverWebProjectWorkspacePrebuild(PROJECT, WORKSPACE, { allowMoonBit: false });
  assert.equal(prebuild.kind, "javascript-workspace");
  assert.equal(prebuild.descriptor, "package.json#workspaces");
  assert.equal(prebuild.commands.length, 1);
  assert.equal(prebuild.commands[0].packageName, "@workspace/shared");
  assert.equal(prebuild.commands[0].cwd, fs.realpathSync(SHARED));
  assert.deepEqual(prebuild.commands[0].command, ["corepack", "yarn", "run", "build"]);

  const prepared = prepareWebProjectWorkspace(prebuild, { sourceEnvironment });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.status, "prepared");
  assert.equal(fs.existsSync(MARKER), true);
  const marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
  assert.deepEqual(marker.argv, ["yarn", "run", "build"]);
  assert.equal(marker.cwd, fs.realpathSync(SHARED));

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-javascript-workspace-prebuild-test",
    packageManager: inspection.packageManager.reference,
    installRoot: inspection.packageManager.installRoot,
    prebuiltPackage: prebuild.commands[0].packageName,
    dependencyGraphBuild: true,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
