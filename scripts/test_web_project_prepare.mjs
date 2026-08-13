#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { createWebProjectManifestV2FromInspection } from "../protocol/web-project-manifest-v2.mjs";
import { webProjectDependencyReadiness } from "../protocol/web-project-bootstrap.mjs";
import { diagnoseWebProjectManifestV2 } from "../protocol/web-project-doctor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-prepare-test");
const PROJECT = path.join(TMP, "fixture");
const CONFLICT_PROJECT = path.join(TMP, "conflicting-node-fixture");
const ZERO_DEP_PROJECT = path.join(TMP, "zero-dependency-fixture");
const DECLARED_READY_PROJECT = path.join(TMP, "declared-dependencies-ready-fixture");
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
      corepackNetwork: process.env.COREPACK_ENABLE_NETWORK ?? null,
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

  fs.mkdirSync(ZERO_DEP_PROJECT, { recursive: true });
  fs.writeFileSync(path.join(ZERO_DEP_PROJECT, "index.html"), "<!doctype html><main>zero deps</main>\n");
  fs.writeFileSync(path.join(ZERO_DEP_PROJECT, "package.json"), `${JSON.stringify({
    name: "zero-dependency-fixture",
    scripts: { build: "node -e \"\"" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(ZERO_DEP_PROJECT, "package-lock.json"), `${JSON.stringify({
    name: "zero-dependency-fixture",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "zero-dependency-fixture" } },
  }, null, 2)}\n`);
  const zeroInspection = inspectWebProject(ZERO_DEP_PROJECT);
  const zeroManifest = createWebProjectManifestV2FromInspection(zeroInspection, { projectRoot: ".", id: "zero-dependency-fixture" });
  const zeroReadiness = webProjectDependencyReadiness(ZERO_DEP_PROJECT, zeroManifest, { forRun: true });
  assert.equal(zeroReadiness.ready, true);
  assert.equal(zeroReadiness.reason, "npm-no-dependencies");
  assert.deepEqual(zeroReadiness.evidence, ["declared-dependencies:0"]);

  fs.mkdirSync(path.join(DECLARED_READY_PROJECT, "node_modules", "vite"), { recursive: true });
  fs.mkdirSync(path.join(DECLARED_READY_PROJECT, "node_modules", "@vitejs", "plugin-vue"), { recursive: true });
  fs.writeFileSync(path.join(DECLARED_READY_PROJECT, "index.html"), "<!doctype html><main>declared ready</main>\n");
  fs.writeFileSync(path.join(DECLARED_READY_PROJECT, "package.json"), `${JSON.stringify({
    name: "declared-dependencies-ready-fixture",
    scripts: { build: "vite build" },
    dependencies: { vite: "1.0.0" },
    devDependencies: { "@vitejs/plugin-vue": "1.0.0" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(DECLARED_READY_PROJECT, "package-lock.json"), `${JSON.stringify({
    name: "declared-dependencies-ready-fixture",
    lockfileVersion: 3,
    requires: true,
    packages: {},
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(DECLARED_READY_PROJECT, "node_modules/.modules.yaml"), "packageManager: pnpm\n");
  const declaredReadyInspection = inspectWebProject(DECLARED_READY_PROJECT);
  const declaredReadyManifest = createWebProjectManifestV2FromInspection(declaredReadyInspection, { projectRoot: ".", id: "declared-dependencies-ready-fixture" });
  const declaredReady = webProjectDependencyReadiness(DECLARED_READY_PROJECT, declaredReadyManifest, { forRun: true });
  assert.equal(declaredReady.ready, true);
  assert.equal(declaredReady.reason, "declared-dependencies-present");
  assert.ok(declaredReady.evidence.includes("declared-dependencies-present:2"));

  fs.mkdirSync(CONFLICT_PROJECT, { recursive: true });
  fs.writeFileSync(path.join(CONFLICT_PROJECT, "package.json"), `${JSON.stringify({
    name: "conflicting-node-fixture",
    engines: { node: "^22.15.0" },
    volta: { node: "22.22.3" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(CONFLICT_PROJECT, ".nvmrc"), "20.20.0\n");
  fs.writeFileSync(path.join(CONFLICT_PROJECT, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(CONFLICT_PROJECT, "install-should-not-run.mjs"), `
    import fs from "node:fs";
    fs.writeFileSync("prepare-mutation-marker", "unexpected\\n");
  `);
  const conflictInspection = inspectWebProject(CONFLICT_PROJECT);
  assert.equal(conflictInspection.nodeRequirementResolution.status, "ambiguous");
  assert.ok(conflictInspection.ambiguities.some((item) => item.code === "node-requirement-source-conflict" && item.severity === "error"));
  const conflictManifest = createWebProjectManifestV2FromInspection(conflictInspection, { projectRoot: ".", id: "conflicting-node-fixture" });
  conflictManifest.bootstrap.install = [process.execPath, "install-should-not-run.mjs"];
  conflictManifest.server = {
    mode: "external",
    outputDir: null,
    start: null,
    url: "http://127.0.0.1:9/",
    readiness: { strategy: "semantic-quiescence", timeoutMs: 1000 },
    hooks: { reset: null, readOnly: [] },
  };
  const conflictFile = path.join(CONFLICT_PROJECT, "proped.web.json");
  fs.writeFileSync(conflictFile, `${JSON.stringify(conflictManifest, null, 2)}\n`);

  const conflictDoctor = run(["web", "doctor", conflictFile, "--repository-root", CONFLICT_PROJECT]);
  assert.equal(conflictDoctor.status, 1, conflictDoctor.stderr || conflictDoctor.stdout);
  const conflictDoctorReport = JSON.parse(conflictDoctor.stderr.trim());
  assert.equal(conflictDoctorReport.ok, false);
  assert.ok(conflictDoctorReport.checks.some((item) => item.id === "inference" && item.status === "fail" && item.ambiguities.some((ambiguity) => ambiguity.code === "node-requirement-source-conflict")));

  const conflictPrepare = run(["web", "prepare", conflictFile, "--repository-root", CONFLICT_PROJECT]);
  assert.equal(conflictPrepare.status, 2, conflictPrepare.stderr || conflictPrepare.stdout);
  const conflictPrepareReport = JSON.parse(conflictPrepare.stderr.trim());
  assert.equal(conflictPrepareReport.error, "inference_review_required");
  assert.ok(conflictPrepareReport.ambiguities.some((item) => item.code === "node-requirement-source-conflict"));

  const conflictRun = run(["web", "run", conflictFile, "--repository-root", CONFLICT_PROJECT, "--sandbox-mode", "caller-enforced", "--no-artifacts"]);
  assert.equal(conflictRun.status, 2, conflictRun.stderr || conflictRun.stdout);
  const conflictRunReport = JSON.parse(conflictRun.stderr.trim());
  assert.equal(conflictRunReport.error, "inference_review_required");
  assert.ok(conflictRunReport.ambiguities.some((item) => item.code === "node-requirement-source-conflict"));
  assert.equal(fs.existsSync(path.join(CONFLICT_PROJECT, "prepare-mutation-marker")), false, "conflicting source fixture must fail closed before prepare mutates the target");
  assert.equal(fs.existsSync(path.join(CONFLICT_PROJECT, "node_modules")), false, "conflicting source fixture must fail closed before dependency acquisition");

  const ambiguousManifest = structuredClone(manifest);
  ambiguousManifest.inference.ambiguities.push({ code: "node-requirement-source-conflict", message: "fixture conflict", severity: "error" });
  const ambiguousFile = path.join(PROJECT, "proped.ambiguous.web.json");
  fs.writeFileSync(ambiguousFile, `${JSON.stringify(ambiguousManifest, null, 2)}\n`);
  const ambiguousPrepare = run(["web", "prepare", ambiguousFile, "--repository-root", PROJECT]);
  assert.equal(ambiguousPrepare.status, 2, ambiguousPrepare.stderr || ambiguousPrepare.stdout);
  assert.equal(JSON.parse(ambiguousPrepare.stderr.trim()).error, "inference_review_required");
  const ambiguousRun = run(["web", "run", ambiguousFile, "--repository-root", PROJECT, "--sandbox-mode", "caller-enforced", "--no-artifacts"]);
  assert.equal(ambiguousRun.status, 2, ambiguousRun.stderr || ambiguousRun.stdout);
  assert.equal(JSON.parse(ambiguousRun.stderr.trim()).error, "inference_review_required");
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules")), false, "critical inference ambiguity must block install before target mutation");

  const incompatibleManifest = structuredClone(manifest);
  incompatibleManifest.project.nodeRequirement = "^1.0.0";
  const incompatibleFile = path.join(PROJECT, "proped.incompatible.web.json");
  fs.writeFileSync(incompatibleFile, `${JSON.stringify(incompatibleManifest, null, 2)}\n`);
  const incompatiblePrepare = run(["web", "prepare", incompatibleFile, "--repository-root", PROJECT]);
  assert.equal(incompatiblePrepare.status, 2, incompatiblePrepare.stderr || incompatiblePrepare.stdout);
  assert.equal(JSON.parse(incompatiblePrepare.stderr.trim()).error, "node_runtime_required");
  const incompatibleRun = run(["web", "run", incompatibleFile, "--repository-root", PROJECT, "--sandbox-mode", "caller-enforced", "--no-artifacts"]);
  assert.equal(incompatibleRun.status, 2, incompatibleRun.stderr || incompatibleRun.stdout);
  assert.equal(JSON.parse(incompatibleRun.stderr.trim()).error, "node_runtime_required");
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules")), false, "engine preflight must run before any install");

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
  assert.equal(prepareReport.packageManagerRuntime.status, "ready");
  assert.equal(fs.existsSync(path.join(PROJECT, "node_modules/.prepared")), true);
  const childEnvironment = JSON.parse(fs.readFileSync(path.join(PROJECT, "prepared-env.json"), "utf8"));
  assert.equal(childEnvironment.secretSeen, false);
  assert.equal(childEnvironment.networkPolicy, "explicit-bootstrap-network-allowed");
  assert.equal(childEnvironment.credentialPolicy, "environment-allowlist-deny");
  assert.equal(childEnvironment.corepackNetwork, "1");

  fs.rmSync(path.join(PROJECT, "node_modules"), { recursive: true, force: true });
  fs.rmSync(path.join(PROJECT, "prepared-env.json"), { force: true });
  const offline = run(["web", "prepare", MANIFEST, "--repository-root", PROJECT, "--offline"]);
  assert.equal(offline.status, 0, offline.stderr || offline.stdout);
  const offlineReport = JSON.parse(offline.stdout.trim());
  assert.equal(offlineReport.networkPolicy, "offline-requested");
  const offlineEnvironment = JSON.parse(fs.readFileSync(path.join(PROJECT, "prepared-env.json"), "utf8"));
  assert.equal(offlineEnvironment.networkPolicy, "bootstrap-offline-requested");
  assert.equal(offlineEnvironment.corepackNetwork, "0");

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-prepare-test",
    implicitInstallDenied: true,
    explicitPrepare: true,
    credentialEnvironmentDenied: true,
    offlineMode: true,
    nodeRuntimePreflight: true,
    criticalInferencePreflight: true,
    ambiguousNodeRequirementDenied: true,
    conflictingNodeFixtureFailClosed: { doctor: true, prepare: true, run: true },
    readinessAfter: offlineReport.readinessAfter.ready,
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
