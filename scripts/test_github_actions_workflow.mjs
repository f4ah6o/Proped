#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateGitHubActionsWorkflow } from "../protocol/github-actions-workflow.mjs";
import { validateWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";

const REF = "0123456789abcdef0123456789abcdef01234567";
const manifest = validateWebProjectManifestV2({
  schemaVersion: 2,
  id: "workflow-fixture",
  project: { root: ".", framework: "react-vite", packageManager: "pnpm" },
  bootstrap: { install: ["pnpm", "install", "--frozen-lockfile"], build: ["pnpm", "run", "build"] },
  server: { mode: "static-output", outputDir: "dist", start: null, url: null, readiness: { strategy: "semantic-quiescence", timeoutMs: 30000 }, hooks: { reset: null, readOnly: [] } },
  browser: { engine: "chromium", headless: true, viewport: [1280, 900], locale: "en-US", timezone: "UTC", serviceWorkers: "block" },
  discovery: { actions: "accessibility", selectorPolicy: "role-first", ambiguity: "fail-closed" },
  state: { sources: ["dom", "forms", "url", "localStorage"], indexedDB: { mode: "off", adapter: null } },
  normalization: { builtin: true, volatilityProbeRuns: 3 },
  properties: { packs: ["browser-safety", "reload-persistence"] },
  exploration: { maxStates: 1000, maxDepth: 12, seed: 1 },
  replay: { attempts: 3, freshContext: true },
  sandbox: { mode: "strict", executionNetwork: "deny", credentials: "deny" },
  artifacts: { output: ".proped/out", traceOnFailure: true },
});

const generated = generateGitHubActionsWorkflow(manifest, { propedRef: REF, toolRoot: process.cwd() });
assert.equal(generated.metadata.propedRef, REF);
assert.equal(generated.metadata.strictSandbox, true);
assert.match(generated.workflow, /repository: 'f4ah6o\/Proped'/);
assert.match(generated.workflow, new RegExp(`ref: '${REF}'`));
assert.match(generated.workflow, /corepack enable/);
assert.match(generated.workflow, /pnpm install --frozen-lockfile/);
assert.match(generated.workflow, /playwright install --with-deps --only-shell chromium/);
assert.match(generated.workflow, /apt-get install --yes bubblewrap/);
assert.match(generated.workflow, /web_project_run_v2\.mjs/);
assert.match(generated.workflow, /actions\/upload-artifact@v4/);
assert.match(generated.workflow, /permissions:\n  contents: read/);
assert.doesNotMatch(generated.workflow, /pull_request_target/);
assert.doesNotMatch(generated.workflow, /secrets\./);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proped-gh-workflow-"));
try {
  const file = path.join(tmp, "workflow.yml");
  fs.writeFileSync(file, generated.workflow);
  const ruby = spawnSync("ruby", ["-e", "require 'yaml'; YAML.load_file(ARGV[0]); puts 'yaml-ok'", file], { encoding: "utf8", shell: false });
  assert.equal(ruby.status, 0, ruby.stderr);
  assert.equal(ruby.stdout.trim(), "yaml-ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

assert.throws(() => generateGitHubActionsWorkflow(manifest, { propedRef: "main" }), /full 40-character commit SHA/);
assert.throws(() => generateGitHubActionsWorkflow({ ...manifest, server: { ...manifest.server, mode: "review-required", outputDir: null } }, { propedRef: REF }), /review-required/);

console.log(JSON.stringify({
  ok: true,
  runtime: "github-actions-workflow-test",
  propedRef: REF,
  strictSandbox: generated.metadata.strictSandbox,
  bootstrapInstall: generated.metadata.bootstrapInstall,
  yamlParsed: true,
}));
