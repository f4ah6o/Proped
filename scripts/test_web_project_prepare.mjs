#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { createWebProjectManifestV2FromInspection } from "../protocol/web-project-manifest-v2.mjs";
import { webProjectDependencyReadiness } from "../protocol/web-project-bootstrap.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-prepare-test");
const PROJECT = path.join(TMP, "fixture");
const MANIFEST = path.join(PROJECT, "proped.web.json");
const CLI = path.join(ROOT, "scripts/proped.mjs");

function run(args, env = process.env) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    env,
    timeout: 30_000,
  });
}

fs.rmSync(TMP, { recursive: true, force: true });
try {
  fs.mkdirSync(PROJECT, { recursive: true });
  fs.writeFileSync(path.join(PROJECT, "package.json"), `${JSON.stringify({
    name: "prepare-fixture",
    packageManager: "npm@11.0.0",
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(PROJECT, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(PROJECT, "install-fixture.mjs"), `
    import fs from "node:fs";
    fs.mkdirSync("node_modules", { recursive: true });
    fs.writeFileSync("node_modules/.prepared", "yes\\n");
    fs.writeFileSync("node_modules/.package-lock.json", "{}\\n");
    fs.writeFileSync("prepared-env.json", JSON.stringify({
      secretSeen: Boolean(process.env.PROPED_TEST_SECRET || process.env.NPM_TOKEN),
      networkPolicy: process.env.PROPED_NETWORK_POLICY ?? null,
      credentialPolicy: process.env.PROPED_CREDENTIAL_POLICY ?? null,
    }));
  `);

  const inspection = inspectWebProject(PROJECT);
  const manifest = createWebProjectManifestV2FromInspection(inspection, { projectRoot: ".", id: "prepare-fixture" });
  manifest.bootstrap.install = [process.execPath, "install-fixture.mjs"];
  fs.writeFileSync(path.join(PROJECT, "build-fixture.mjs"), "// build fixture\n");
  manifest.bootstrap.build = [process.execPath, "build-fixture.mjs"];
  manifest.server = {
    mode: "external",
    outputDir: null,
    start: null,
    url: "http://127.0.0.1:9/",
    readiness: { strategy: "semantic-quiescence", timeoutMs: 1000 },
    hooks: { reset: null, readOnly: [] },
  };
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  const before = webProjectDependencyReadiness(PROJECT, manifest);
  assert.equal(before.ready, false);
  assert.equal(before.reason, "npm-install-incomplete");

  const prematureRun = run(["web", "run", MANIFEST, "--repository-root", PROJECT, "--sandbox-mode", "caller-enforced", "--no-artifacts"]);
  assert.equal(prematureRun.status, 2, prematureRun.stderr || prematureRun.stdout);
  const prepareRequired = JSON.parse(prematureRun.stderr.trim());
  assert.equal(prepareRequired.error, "prepare_required");
  assert.deepEqual(prepareRequired.bootstrapInstall, manifest.bootstrap.install);
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules")), false, "web run must not install dependencies implicitly");

  const prepared = run(["web", "prepare", MANIFEST, "--repository-root", PROJECT], {
    ...process.env,
    PROPED_TEST_SECRET: "must-not-leak",
    NPM_TOKEN: "must-not-leak",
  });
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
  const prepareReport = JSON.parse(prepared.stdout.trim());
  assert.equal(prepareReport.ok, true);
  assert.equal(prepareReport.status, "prepared");
  assert.equal(prepareReport.shell, false);
  assert.equal(prepareReport.networkPolicy, "explicit-network-allowed");
  assert.equal(prepareReport.credentials, "environment-allowlist-deny");
  assert.equal(prepareReport.readinessAfter.ready, true);
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules/.prepared")), true);
  const childEnvironment = JSON.parse(fs.readFileSync(path.join(PROJECT, "prepared-env.json"), "utf8"));
  assert.equal(childEnvironment.secretSeen, false);
  assert.equal(childEnvironment.networkPolicy, "explicit-bootstrap-network-allowed");
  assert.equal(childEnvironment.credentialPolicy, "environment-allowlist-deny");

  fs.rmSync(path.join(PROJECT, "node_modules"), { recursive: true, force: true });
  fs.rmSync(path.join(PROJECT, "prepared-env.json"), { force: true });
  const offline = run(["web", "prepare", MANIFEST, "--repository-root", PROJECT, "--offline"]);
  assert.equal(offline.status, 0, offline.stderr || offline.stdout);
  const offlineReport = JSON.parse(offline.stdout.trim());
  assert.equal(offlineReport.networkPolicy, "offline-requested");
  const offlineEnvironment = JSON.parse(fs.readFileSync(path.join(PROJECT, "prepared-env.json"), "utf8"));
  assert.equal(offlineEnvironment.networkPolicy, "bootstrap-offline-requested");

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-prepare-test",
    implicitInstallDenied: true,
    explicitPrepare: true,
    credentialEnvironmentDenied: true,
    offlineMode: true,
    readinessAfter: offlineReport.readinessAfter.ready,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
