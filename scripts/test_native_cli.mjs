#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const suffix = process.platform === "win32" ? ".exe" : "";
const CLI = path.join(ROOT, "target", "debug", `proped${suffix}`);
const NODE_CLI = path.join(ROOT, "scripts", "proped.mjs");
const cargoManifest = fs.readFileSync(path.join(ROOT, "crates", "proped-cli", "Cargo.toml"), "utf8");
const expectedVersion = cargoManifest.match(/^version = "([^"]+)"$/m)?.[1];
assert.ok(expectedVersion, "Cargo package version not found");

assert.equal(fs.existsSync(CLI), true, `native CLI not built: ${CLI}`);

function runNative(args, cwd = ROOT, env = {}) {
  return spawnSync(CLI, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
}

function runNode(args, cwd = ROOT) {
  return spawnSync(process.execPath, [NODE_CLI, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 60_000,
  });
}

const version = runNative(["-V"]);
assert.equal(version.status, 0, version.stderr);
const versionText = version.stdout.trim();
assert.equal(versionText.startsWith(`proped ${expectedVersion} (`), true);
assert.match(versionText.slice(`proped ${expectedVersion} (`.length, -1), /^(?:dev|[0-9a-fA-F]{7})$/);
assert.equal(versionText.endsWith(")"), true);

const doctor = runNative(["doctor", "--json"]);
assert.equal(doctor.status, 0, doctor.stderr);
const doctorReport = JSON.parse(doctor.stdout);
assert.equal(doctorReport.ok, true);
assert.equal(doctorReport.version, expectedVersion);
assert.equal(doctorReport.webRuntime.dispatcher.ready, true);
assert.equal(doctorReport.webRuntime.node.ready, true);
assert.equal(doctorReport.webRuntime.managedBrowser.executableReady, true);
assert.equal(typeof doctorReport.managedPaths.runtimeRoot, "string");
assert.equal(typeof doctorReport.managedPaths.cacheRoot, "string");
assert.equal(typeof doctorReport.managedPaths.nodeRoot, "string");
assert.equal(typeof doctorReport.managedPaths.jsRuntimeRoot, "string");
assert.equal(typeof doctorReport.managedPaths.browserRoot, "string");

const setupHelp = runNative(["setup", "--help"]);
assert.equal(setupHelp.status, 0, setupHelp.stderr);
assert.match(setupHelp.stdout, /proped setup \[--json\]/);
const setupInvalid = runNative(["setup", "--unknown"]);
assert.equal(setupInvalid.status, 2);
assert.equal(JSON.parse(setupInvalid.stderr).error, "invalid_arguments");

const invalid = runNative(["unknown"]);
assert.equal(invalid.status, 2);
assert.equal(JSON.parse(invalid.stderr).error, "invalid_arguments");

const nativeWebHelp = runNative(["web", "--help"]);
const nodeWebHelp = runNode(["web", "--help"]);
assert.equal(nativeWebHelp.status, nodeWebHelp.status);
assert.equal(nativeWebHelp.stdout, nodeWebHelp.stdout);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proped-native-cli-"));
try {
  fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    `${JSON.stringify(
      {
        name: "proped-native-cli-fixture",
        packageManager: "npm@11.0.0",
        scripts: { build: "vite build", preview: "vite preview" },
        dependencies: { vite: "8.0.0" },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(tmp, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(tmp, "src", "app.js"), "localStorage.setItem('boot','yes');\n");

  const nativeInspect = runNative(["web", "inspect", tmp, "--json"]);
  const nodeInspect = runNode(["web", "inspect", tmp, "--json"]);
  assert.equal(nativeInspect.status, nodeInspect.status, nativeInspect.stderr);
  assert.deepEqual(JSON.parse(nativeInspect.stdout), JSON.parse(nodeInspect.stdout));

  const manifest = path.join(tmp, "proped.web.json");
  const nativeInit = runNative(["web", "init", tmp, "--output", manifest]);
  assert.equal(nativeInit.status, 0, nativeInit.stderr);
  assert.equal(fs.existsSync(manifest), true);

  const nativeDoctor = runNative(["web", "doctor", manifest, "--repository-root", tmp]);
  const nodeDoctor = runNode(["web", "doctor", manifest, "--repository-root", tmp]);
  assert.equal(nativeDoctor.status, nodeDoctor.status);
  assert.deepEqual(JSON.parse(nativeDoctor.stdout), JSON.parse(nodeDoctor.stdout));

  const nativeRun = runNative(["web", "run", manifest, "--repository-root", tmp]);
  const nodeRun = runNode(["web", "run", manifest, "--repository-root", tmp]);
  assert.equal(nativeRun.status, nodeRun.status);
  const nativeRunEnvelope = JSON.parse(nativeRun.stderr || nativeRun.stdout);
  const nodeRunEnvelope = JSON.parse(nodeRun.stderr || nodeRun.stdout);
  assert.equal(nativeRunEnvelope.error, nodeRunEnvelope.error);
  assert.equal(nativeRunEnvelope.code, nodeRunEnvelope.code);

  const nativeUnknown = runNative(["web", "unknown"]);
  const nodeUnknown = runNode(["web", "unknown"]);
  assert.equal(nativeUnknown.status, 2);
  assert.equal(nativeUnknown.status, nodeUnknown.status);
  assert.deepEqual(JSON.parse(nativeUnknown.stderr), JSON.parse(nodeUnknown.stderr));

  console.log(
    JSON.stringify({
      ok: true,
      runtime: "native-proped-cli-test",
      version: doctorReport.version,
      provenance: doctorReport.provenance,
      webInspectParity: true,
      webDoctorParity: true,
      webRunExitCodeParity: true,
      exitCodeParity: true,
      shell: false,
    }),
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
