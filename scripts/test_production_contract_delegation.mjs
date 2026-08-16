#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

function run(corpus, env = {}) {
  return spawnSync(process.execPath, ["scripts/web_project_benchmark.mjs", "--corpus", corpus, "--no-artifacts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTIONS: "",
      GITHUB_REPOSITORY: "",
      GITHUB_WORKFLOW: "",
      GITHUB_JOB: "",
      ...env,
    },
  });
}


const workflow = fs.readFileSync(".github/workflows/production-contracts.yml", "utf8");
assert.doesNotMatch(
  workflow,
  /PLAYWRIGHT_BROWSERS_PATH:\s*\$HOME\//,
  "GitHub Actions env mappings do not shell-expand $HOME",
);
assert.match(
  workflow,
  /"PLAYWRIGHT_BROWSERS_PATH=\$HOME\/\.cache\/ms-playwright"/,
  "real OSS acceptance must shell-expand the managed browser path",
);

const legacyCiJob = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "f4ah6o/Proped",
  GITHUB_WORKFLOW: "CI",
  GITHUB_JOB: "production-external-contracts",
};

for (const corpus of ["promoted-production", "external-production"]) {
  const delegated = run(corpus, legacyCiJob);
  assert.equal(delegated.status, 0, delegated.stderr);
  assert.deepEqual(JSON.parse(delegated.stdout), {
    ok: true,
    skipped: true,
    reason: "delegated_to_parallel_production_contract_workflow",
    corpus,
  });
}

for (const [label, env] of [
  ["local", {}],
  [
    "downstream-actions",
    {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "example/downstream",
      GITHUB_WORKFLOW: "CI",
      GITHUB_JOB: "production-external-contracts",
    },
  ],
  [
    "dedicated-production-workflow",
    {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "f4ah6o/Proped",
      GITHUB_WORKFLOW: "Production contracts",
      GITHUB_JOB: "production-contract",
    },
  ],
  [
    "other-ci-job",
    {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "f4ah6o/Proped",
      GITHUB_WORKFLOW: "CI",
      GITHUB_JOB: "test",
    },
  ],
]) {
  const result = run("promoted-production", env);
  assert.doesNotMatch(result.stdout, /delegated_to_parallel_production_contract_workflow/, label);
}

console.log(JSON.stringify({ ok: true, runtime: "production-contract-delegation-test" }));
