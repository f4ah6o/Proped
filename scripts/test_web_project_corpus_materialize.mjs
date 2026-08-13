#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadWebProjectCorpus, resolveWebProjectCorpus, validateWebProjectCorpus } from "../protocol/web-project-corpus.mjs";
import { materializeWebProjectCorpus, verifyMaterializedWebProjectCorpus } from "../protocol/web-project-corpus-materialize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-project-corpus-materialize-test");
const UPSTREAM = path.join(TMP, "upstream");
const CHECKOUTS = path.join(TMP, "checkouts");
const CORPUS_FILE = path.join(TMP, "corpus.json");
const CLI = path.join(ROOT, "scripts/proped.mjs");

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(UPSTREAM, { recursive: true });
try {
  git(UPSTREAM, "init", "-b", "main");
  git(UPSTREAM, "config", "user.email", "proped-test@example.invalid");
  git(UPSTREAM, "config", "user.name", "Proped Test");
  fs.mkdirSync(path.join(UPSTREAM, "site"), { recursive: true });
  fs.writeFileSync(path.join(UPSTREAM, ".gitignore"), "site/node_modules/\nsite/.generated-cache/\nsite/.preexisting-cache/\n");
  fs.writeFileSync(path.join(UPSTREAM, "site/index.html"), "<!doctype html><main><button>One</button></main>\n");
  fs.mkdirSync(path.join(UPSTREAM, "site/vendor/demo"), { recursive: true });
  fs.writeFileSync(path.join(UPSTREAM, "site/vendor/demo/package.json"), `${JSON.stringify({ name: "materialize-demo", version: "1.0.0" }, null, 2)}\n`);
  fs.writeFileSync(path.join(UPSTREAM, "site/package.json"), `${JSON.stringify({
    name: "materialize-site",
    version: "1.0.0",
    scripts: { build: "node build.mjs" },
    dependencies: { "materialize-demo": "file:vendor/demo" },
  }, null, 2)}\n`);
  const lock = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline"], { cwd: path.join(UPSTREAM, "site"), encoding: "utf8", timeout: 30_000 });
  assert.equal(lock.status, 0, lock.stderr || lock.stdout);
  fs.rmSync(path.join(UPSTREAM, "site/node_modules"), { recursive: true, force: true });
  fs.writeFileSync(path.join(UPSTREAM, "site/build.mjs"), `import fs from "node:fs";\nfs.writeFileSync("index.html", "<!doctype html><main><button>Built</button></main>\\n");\nfs.writeFileSync("generated.txt", "generated\\n");\nfs.mkdirSync(".generated-cache", { recursive: true });\nfs.writeFileSync(".generated-cache/cache.txt", "generated-cache\\n");\n`);
  git(UPSTREAM, "add", ".");
  git(UPSTREAM, "commit", "-m", "first");
  const first = git(UPSTREAM, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(UPSTREAM, "site/about.html"), "<!doctype html><main>About</main>\n");
  git(UPSTREAM, "add", ".");
  git(UPSTREAM, "commit", "-m", "second");
  const revision = git(UPSTREAM, "rev-parse", "HEAD");
  assert.match(revision, /^[0-9a-f]{40}$/);
  fs.writeFileSync(path.join(UPSTREAM, ".gitattributes"), "*.txt filter=evil\n");
  git(UPSTREAM, "add", ".gitattributes");
  git(UPSTREAM, "commit", "-m", "filter fixture");
  const filterRevision = git(UPSTREAM, "rev-parse", "HEAD");

  const rawCorpus = {
    schemaVersion: 1,
    id: "materialize-test",
    description: "local git fixture",
    gate: {
      minAutoOnboardingRate: 1,
      maxInterventionProjectRate: 0,
      minDeterministicReplayRate: 1,
      maxAdapterLoc: 0,
      maxRegressions: 0,
    },
    targets: [{
      id: "site",
      project: "site",
      repository: "local/materialize-test",
      revision,
      adapterLoc: 0,
      tags: ["static"],
      source: { kind: "git", url: UPSTREAM, checkout: "sample" },
    }],
  };
  fs.writeFileSync(CORPUS_FILE, `${JSON.stringify(rawCorpus, null, 2)}\n`);
  const corpus = loadWebProjectCorpus(CORPUS_FILE);

  assert.throws(() => validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], revision: "workspace:not-external" }],
  }), /full commit SHA/);
  assert.throws(() => validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], project: "../escape" }],
  }), /stay within the checkout/);
  assert.throws(() => validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], source: { ...rawCorpus.targets[0].source, checkout: "../escape" } }],
  }), /source.checkout is invalid/);

  assert.throws(() => validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], source: { ...rawCorpus.targets[0].source, url: "ssh://example.invalid/repo.git" } }],
  }), /must use https:\/\/ or file:\/\//);
  assert.throws(() => validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], source: { ...rawCorpus.targets[0].source, url: "https://user:secret@example.invalid/repo.git" } }],
  }), /must not embed credentials/);

  const missingBenchmark = spawnSync(process.execPath, [
    CLI, "web", "benchmark", "--corpus", CORPUS_FILE,
    "--checkout-root", CHECKOUTS, "--no-artifacts", "--sandbox-mode", "caller-enforced",
  ], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(missingBenchmark.status, 2, missingBenchmark.stderr || missingBenchmark.stdout);
  assert.match(missingBenchmark.stderr, /checkout verification failed/);
  assert.equal(fs.existsSync(path.join(CHECKOUTS, "sample")), false, "benchmark must not materialize implicitly");

  const materializeCli = spawnSync(process.execPath, [
    CLI, "web", "corpus", "materialize", CORPUS_FILE, "--checkout-root", CHECKOUTS,
  ], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(materializeCli.status, 0, materializeCli.stderr || materializeCli.stdout);
  const materialized = JSON.parse(materializeCli.stdout);
  assert.equal(materialized.ok, true);
  assert.equal(materialized.runtime, "web-project-corpus-materialize");
  assert.deepEqual(materialized.materializedCheckouts, ["sample"]);
  assert.equal(materialized.targetCodeExecuted, false);
  assert.equal(materialized.upstreamWritesPerformed, false);
  assert.equal(materialized.checkouts[0].head, revision);
  assert.equal(materialized.projects[0].exists, true);

  const checkout = path.join(CHECKOUTS, "sample");
  assert.equal(git(checkout, "rev-parse", "HEAD"), revision);
  assert.equal(git(checkout, "remote", "get-url", "origin"), UPSTREAM);

  const verifyCli = spawnSync(process.execPath, [
    CLI, "web", "corpus", "verify", CORPUS_FILE, "--checkout-root", CHECKOUTS,
  ], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  assert.equal(verifyCli.status, 0, verifyCli.stderr || verifyCli.stdout);
  const verifiedCli = JSON.parse(verifyCli.stdout);
  assert.equal(verifiedCli.ok, true);
  assert.equal(verifiedCli.runtime, "web-project-corpus-verify");
  assert.equal(verifiedCli.checkouts[0].head, revision);

  const infoAttributes = path.join(checkout, ".git", "info", "attributes");
  fs.mkdirSync(path.dirname(infoAttributes), { recursive: true });
  fs.writeFileSync(infoAttributes, "*.html filter=evil\n");
  const infoFilterVerify = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS });
  assert.equal(infoFilterVerify.ok, false);
  assert.ok(infoFilterVerify.checkouts[0].errors.includes("checkout-filter-unsupported"));
  fs.rmSync(infoAttributes);

  const hookMarker = path.join(TMP, "post-checkout-ran");
  const hook = path.join(checkout, ".git/hooks/post-checkout");
  fs.writeFileSync(hook, `#!/bin/sh\nprintf ran > '${hookMarker}'\n`);
  fs.chmodSync(hook, 0o755);
  git(checkout, "reset", "--hard", first);
  fs.rmSync(hookMarker, { force: true });
  const savedGitConfig = {
    count: process.env.GIT_CONFIG_COUNT,
    key: process.env.GIT_CONFIG_KEY_0,
    value: process.env.GIT_CONFIG_VALUE_0,
  };
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = "core.hooksPath";
  process.env.GIT_CONFIG_VALUE_0 = path.join(checkout, ".git/hooks");
  let rematerialized;
  try {
    rematerialized = materializeWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS, fetch: false });
  } finally {
    for (const [key, value] of [["GIT_CONFIG_COUNT", savedGitConfig.count], ["GIT_CONFIG_KEY_0", savedGitConfig.key], ["GIT_CONFIG_VALUE_0", savedGitConfig.value]]) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.equal(rematerialized.ok, true);
  assert.equal(fs.existsSync(hookMarker), false, "materialization must disable checkout hooks and ignore injected Git config");
  assert.equal(git(checkout, "rev-parse", "HEAD"), revision);

  const filterCorpus = validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], revision: filterRevision }],
  });
  assert.throws(
    () => materializeWebProjectCorpus(filterCorpus, { checkoutRoot: CHECKOUTS }),
    /unsupported checkout filter/,
  );
  assert.equal(git(checkout, "rev-parse", "HEAD"), revision, "unsupported filters must be rejected before checkout mutation");
  fs.rmSync(hook, { force: true });
  git(checkout, "checkout", "--detach", filterRevision);
  const filterVerify = verifyMaterializedWebProjectCorpus(filterCorpus, { checkoutRoot: CHECKOUTS });
  assert.equal(filterVerify.ok, false);
  assert.ok(filterVerify.checkouts[0].errors.includes("checkout-filter-unsupported"));
  git(checkout, "checkout", "--detach", revision);

  fs.writeFileSync(path.join(checkout, "untracked.txt"), "dirty\n");
  const dirtyVerify = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS });
  assert.equal(dirtyVerify.ok, false);
  assert.ok(dirtyVerify.checkouts[0].errors.includes("dirty-checkout"));
  assert.throws(() => materializeWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS, fetch: false }), /local changes/);
  fs.rmSync(path.join(checkout, "untracked.txt"));

  const outside = path.join(TMP, "outside-project");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "index.html"), "<!doctype html><main>outside</main>\n");
  const escapeLink = path.join(checkout, "escape-project");
  fs.symlinkSync(outside, escapeLink, "dir");
  const escapeCorpus = validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], id: "escape-site", project: "escape-project" }],
  });
  const escapeVerify = verifyMaterializedWebProjectCorpus(escapeCorpus, { checkoutRoot: CHECKOUTS });
  assert.equal(escapeVerify.ok, false);
  assert.equal(escapeVerify.projects[0].contained, false);
  fs.rmSync(escapeLink);

  git(checkout, "update-index", "--add", "--cacheinfo", `160000,${revision},gitlink`);
  fs.mkdirSync(path.join(checkout, "gitlink"), { recursive: true });
  const gitlinkCorpus = validateWebProjectCorpus({
    ...rawCorpus,
    targets: [{ ...rawCorpus.targets[0], id: "gitlink-site", project: "gitlink" }],
  });
  const gitlinkVerify = verifyMaterializedWebProjectCorpus(gitlinkCorpus, { checkoutRoot: CHECKOUTS });
  assert.equal(gitlinkVerify.ok, false);
  assert.ok(gitlinkVerify.checkouts[0].errors.includes("target-inside-gitlink"));
  fs.rmSync(path.join(checkout, "gitlink"), { recursive: true, force: true });
  git(checkout, "reset", "--hard", revision);

  git(checkout, "remote", "set-url", "origin", path.join(TMP, "wrong-origin"));
  const originVerify = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS });
  assert.equal(originVerify.ok, false);
  assert.ok(originVerify.checkouts[0].errors.includes("origin-mismatch"));
  assert.throws(() => materializeWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS, fetch: false }), /origin mismatch/);
  git(checkout, "remote", "set-url", "origin", UPSTREAM);

  const verified = verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: CHECKOUTS });
  assert.equal(verified.ok, true);
  const preexistingIgnored = path.join(checkout, "site/.preexisting-cache/keep.txt");
  fs.mkdirSync(path.dirname(preexistingIgnored), { recursive: true });
  fs.writeFileSync(preexistingIgnored, "keep\n");

  const benchmark = spawnSync(process.execPath, [
    CLI, "web", "benchmark", "--corpus", CORPUS_FILE,
    "--checkout-root", CHECKOUTS, "--no-artifacts", "--sandbox-mode", "caller-enforced",
  ], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(benchmark.status, 0, benchmark.stderr || benchmark.stdout);
  const summary = JSON.parse(benchmark.stdout);
  assert.equal(summary.ok, true, JSON.stringify(summary));
  assert.equal(summary.projectCount, 1);
  assert.equal(summary.autoOnboardedCount, 1);
  assert.equal(summary.materialization.ok, true);
  assert.equal(summary.materialization.checkouts[0].head, revision);
  assert.equal(summary.checkoutCleanup.ok, true);
  assert.equal(git(checkout, "status", "--porcelain"), "", "external benchmark must restore a clean checkout");
  assert.equal(fs.existsSync(path.join(checkout, "site/generated.txt")), false, "run-created untracked output must be removed");
  assert.equal(fs.existsSync(path.join(checkout, "site/.generated-cache")), false, "run-created ignored output must be removed");
  assert.equal(fs.readFileSync(preexistingIgnored, "utf8"), "keep\n", "pre-existing ignored state must be preserved");
  assert.ok(summary.checkoutCleanup.checkouts[0].removedIgnoredPaths.includes("site/.generated-cache"));
  assert.ok(summary.checkoutCleanup.checkouts[0].removedIgnoredPaths.includes("site/node_modules"), "auto-prepare dependency tree must be restored away when absent before the benchmark");
  assert.equal(fs.existsSync(path.join(checkout, "site/node_modules")), false);
  assert.match(fs.readFileSync(path.join(checkout, "site/index.html"), "utf8"), /button>One<\/button>/, "tracked build output must be restored to the pinned revision");

  const external = resolveWebProjectCorpus("external");
  assert.equal(external.id, "external-production");
  assert.equal(external.targets.length, 11);
  assert.equal(external.targets.every((target) => target.adapterLoc === 0), true);
  assert.equal(external.gate.minTargetCount, 11);
  assert.equal(external.gate.minRepositoryCount, 6);
  assert.deepEqual(external.gate.requiredTags, ["framework-backed", "pnpm", "stateful", "static"]);
  assert.ok(external.targets.some((target) => target.id === "ensenzu" && target.source.checkout === "external-ensenzu" && target.adapterLoc === 0));
  assert.equal(new Set(external.targets.map((target) => target.source.checkout)).size, 6);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-project-corpus-materialize-test",
    revision,
    materializedCheckouts: materialized.materializedCheckouts,
    benchmarkAutoOnboardingRate: summary.autoOnboardingRate,
    externalTargets: external.targets.map((target) => target.id),
  }));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
