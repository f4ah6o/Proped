#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CLI = path.join(ROOT, "scripts/proped.mjs");
function run(args, cwd = ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", shell: false, timeout: 60_000 });
}

const help = run(["--help"]);
assert.equal(help.status, 0, help.stderr);
for (const command of ["inspect", "init", "doctor", "prepare", "compile", "review", "approve", "apply", "run", "campaign"]) {
  assert.match(help.stdout, new RegExp(`web ${command}`));
}
const invalid = run(["web", "unknown"]);
assert.equal(invalid.status, 2);
assert.equal(JSON.parse(invalid.stderr).error, "invalid_arguments");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proped-web-cli-"));
try {
  fs.mkdirSync(path.join(tmp, "dist"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "package.json"), `${JSON.stringify({
    name: "proped-cli-fixture", packageManager: "npm@11.0.0",
    scripts: { build: "vite build", preview: "vite preview" }, dependencies: { vite: "8.0.0" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(tmp, "src/app.js"), "localStorage.setItem('boot','yes');\n");
  fs.writeFileSync(path.join(tmp, "dist/index.html"), "<!doctype html><main><button>Open</button></main>");

  const inspect = run(["web", "inspect", tmp, "--json"]);
  assert.equal(inspect.status, 0, inspect.stderr);
  const inspection = JSON.parse(inspect.stdout);
  assert.equal(inspection.framework.name, "vite");

  const manifest = path.join(tmp, "proped.web.json");
  const init = run(["web", "init", tmp, "--output", manifest]);
  assert.equal(init.status, 0, init.stderr);
  assert.equal(fs.existsSync(manifest), true);
  assert.equal(JSON.parse(init.stdout).schemaVersion, 2);

  const doctor = run(["web", "doctor", manifest, "--repository-root", tmp]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);

  const compile = run(["web", "compile", manifest, "--repository-root", tmp]);
  assert.equal(compile.status, 0, compile.stderr);
  assert.equal(JSON.parse(compile.stdout).manifest.schemaVersion, 1);

  const review = run(["web", "review", tmp, "--json"]);
  assert.equal(review.status, 0, review.stderr);
  assert.equal(JSON.parse(review.stdout).runtime, "web-semantic-review-report");

  console.log(JSON.stringify({
    ok: true, runtime: "proped-web-cli-test", commands: Object.keys({ inspect:1, init:1, doctor:1, prepare:1, compile:1, review:1, approve:1, apply:1, run:1, campaign:1 }),
    dispatcherShell: false, exitCodePreserved: true, fixtureFramework: inspection.framework.name,
  }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
