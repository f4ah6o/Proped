#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proped-semantic-apply-"));
try {
  const approved = [{
    ref: "property:saved-state-survives-reload", id: "saved-state-survives-reload", kind: "property",
    confidence: 0.98, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: null, activation: "human-approved",
  }, {
    ref: "server-hook:read-only-api-state-a1b2c3d4", id: "read-only-api-state-a1b2c3d4", kind: "server-hook",
    confidence: 0.91, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: null, activation: "human-approved",
    serverHook: { hookKind: "readOnly", config: { id: "read-only-api-state-a1b2c3d4", method: "GET", path: "/api/state", expectedStatus: [200], timeoutMs: 5000, maxBytes: 65536 } },
  }];
  const stable = { reviewSemanticHash: "review", approved, rejected: [], deferred: [], pending: [] };
  const hints = {
    ok: true, runtime: "web-semantic-approved-hints", version: "1", reviewSemanticHash: "review",
    approvalPlanSemanticHash: "plan", counts: { approved: 2, rejected: 0, deferred: 0, pending: 0 },
    ...stable, automaticActivation: false, semanticHash: semanticHash(stable),
  };
  const manifest = {
    schemaVersion: 2, id: "semantic-apply-fixture",
    project: { root: ".", framework: "vite", packageManager: "npm" },
    bootstrap: { install: ["npm", "ci"], build: ["npm", "run", "build"] },
    server: { mode: "static-output", outputDir: "dist", start: null, url: null, readiness: { strategy: "semantic-quiescence", timeoutMs: 30000 }, hooks: { reset: null, readOnly: [] } },
    browser: { engine: "chromium", headless: true, viewport: [1280, 900], locale: "en-US", timezone: "UTC", serviceWorkers: "block" },
    discovery: { actions: "accessibility", selectorPolicy: "role-first", ambiguity: "fail-closed" },
    state: { sources: ["dom", "forms", "url"], indexedDB: { mode: "off", adapter: null } },
    normalization: { builtin: true, volatilityProbeRuns: 3 },
    properties: { packs: ["browser-safety"] },
    exploration: { maxStates: 100, maxDepth: 8, seed: 1 }, replay: { attempts: 3, freshContext: true },
    sandbox: { mode: "strict", executionNetwork: "deny", credentials: "deny" },
    artifacts: { output: ".proped/out", traceOnFailure: true },
  };
  const manifestFile = path.join(tmp, "manifest.json");
  const hintsFile = path.join(tmp, "hints.json");
  const outputFile = path.join(tmp, "applied.json");
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  fs.writeFileSync(hintsFile, JSON.stringify(hints));
  const result = spawnSync(process.execPath, ["scripts/web_semantic_apply.mjs", manifestFile, hintsFile, "--output", outputFile], { cwd: process.cwd(), encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  const applied = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  assert.equal(applied.semantics.approved.semanticHash, hints.semanticHash);
  assert.equal(applied.semantics.approved.automaticActivation, false);
  assert.equal(applied.server.hooks.readOnly.length, 1);
  assert.equal(applied.server.hooks.readOnly[0].path, "/api/state");
  const stdout = spawnSync(process.execPath, ["scripts/web_semantic_apply.mjs", manifestFile, hintsFile], { cwd: process.cwd(), encoding: "utf8", shell: false });
  assert.equal(stdout.status, 0, stdout.stderr);
  assert.equal(JSON.parse(stdout.stdout).semantics.approved.semanticHash, hints.semanticHash);
  console.log(JSON.stringify({ ok: true, runtime: "web-semantic-apply-test", outputWritten: true, stdoutOnlySupported: true, automaticActivation: false }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
