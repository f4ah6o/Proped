#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(corpus, env = {}) {
  return spawnSync(process.execPath, ["scripts/web_project_benchmark.mjs", "--corpus", corpus, "--no-artifacts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

for (const corpus of ["promoted-production", "external-production"]) {
  const delegated = run(corpus, {
    GITHUB_ACTIONS: "true",
    PROPED_CI_PRODUCTION_CONTRACT: "",
  });
  assert.equal(delegated.status, 0, delegated.stderr);
  assert.deepEqual(JSON.parse(delegated.stdout), {
    ok: true,
    skipped: true,
    reason: "delegated_to_parallel_production_contract_workflow",
    corpus,
  });
}

for (const [label, env] of [
  ["local", { GITHUB_ACTIONS: "" }],
  ["explicit", { GITHUB_ACTIONS: "true", PROPED_CI_PRODUCTION_CONTRACT: "1" }],
]) {
  const result = run("promoted-production", env);
  assert.doesNotMatch(result.stdout, /delegated_to_parallel_production_contract_workflow/, label);
}

console.log(JSON.stringify({ ok: true, runtime: "production-contract-delegation-test" }));
