#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proped-exploration-stage-"));
try {
  fs.mkdirSync(path.join(tmp, "dist"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "dist/index.html"), `<!doctype html><main><button>Crash</button></main><script>document.querySelector('button').addEventListener('click',()=>{throw new TypeError('stable exploration crash')})</script>`);
  const result = spawnSync(process.execPath, [
    path.resolve('scripts/web_generic_browser_stage.mjs'),
    '--project-root', tmp,
    '--server-mode', 'static-output',
    '--output-dir', 'dist',
    '--property-packs-json', '[]',
    '--semantic-hints-json', 'null',
    '--exploration-json', JSON.stringify({ mode: 'coverage-guided', maxStates: 4, maxTransitions: 4, maxDepth: 2, seed: 1 }),
    '--replay-attempts', '3',
    '--volatility-probe-runs', '0',
  ], { cwd: process.cwd(), encoding: 'utf8', shell: false, timeout: 60_000 });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\n/).filter(Boolean).at(-1));
  assert.equal(payload.ok, false);
  assert.ok(payload.exploration.failureCount >= 1);
  assert.equal(payload.explorationReplayGate.attempts, 3);
  assert.equal(payload.explorationReplayGate.stableFailureCount, 1);
  assert.equal(payload.explorationReplayGate.unstableCandidates.length, 0);
  assert.ok(payload.failures.some((failure) => (failure.code ?? failure.property) === 'unhandled_exception'));
  console.log(JSON.stringify({ ok: true, runtime: 'web-exploration-stage-quality-test', transitions: payload.exploration.transitions, stableFailureCount: payload.explorationReplayGate.stableFailureCount, attempts: payload.explorationReplayGate.attempts }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
