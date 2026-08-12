#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SANDBOX_CAPABILITY_AXES,
  SANDBOX_CAPABILITY_LEVELS,
  SandboxCapabilityError,
  assertSandboxCapabilities,
  missingSandboxCapabilities,
  sandboxCapabilityRequirement,
  sandboxCapabilitySet,
} from "../protocol/sandbox-capability-model.mjs";
import {
  assertStrictSandboxCapabilities,
  buildStrictSandboxInvocation,
  callerEnforcedSandboxCapabilities,
  strictSandboxCapabilities,
} from "../protocol/web-execution-sandbox.mjs";
import { runWebProject } from "../protocol/web-project-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/sandbox-capability-model-test");
const SENTINEL = path.join(TMP, "strict-stage-ran.txt");

assert.deepEqual(SANDBOX_CAPABILITY_AXES, ["filesystem", "network", "process"]);
assert.deepEqual(SANDBOX_CAPABILITY_LEVELS, ["caller_enforced", "constrained", "strict"]);
assert.deepEqual(sandboxCapabilitySet(), {
  filesystem: "caller_enforced",
  network: "caller_enforced",
  process: "caller_enforced",
});
assert.deepEqual(sandboxCapabilitySet({ filesystem: "constrained", network: "strict", process: "caller_enforced" }), {
  filesystem: "constrained",
  network: "strict",
  process: "caller_enforced",
});
assert.throws(() => sandboxCapabilitySet({ network: "best-effort" }), /must be one of/);

const strictRequirement = sandboxCapabilityRequirement("strict");
const missing = missingSandboxCapabilities({
  filesystem: "constrained",
  network: "strict",
  process: "caller_enforced",
}, strictRequirement);
assert.deepEqual(missing, [
  { axis: "filesystem", actual: "constrained", required: "strict" },
  { axis: "process", actual: "caller_enforced", required: "strict" },
]);
assert.throws(
  () => assertSandboxCapabilities({ filesystem: "strict", network: "strict", process: "caller_enforced" }),
  (error) => error instanceof SandboxCapabilityError
    && error.code === "sandbox_capability_requirement_not_met"
    && error.missingCapabilities.length === 1
    && error.missingCapabilities[0].axis === "process",
);

const callerMac = callerEnforcedSandboxCapabilities({ platform: "darwin" });
const callerMacAgain = callerEnforcedSandboxCapabilities({ platform: "darwin" });
assert.equal(JSON.stringify(callerMac), JSON.stringify(callerMacAgain));
assert.equal(callerMac.platform, "darwin");
assert.deepEqual(callerMac.capabilities, {
  filesystem: "caller_enforced",
  network: "caller_enforced",
  process: "caller_enforced",
});
assert.equal(callerMac.diagnostic, "caller_enforced_execution");

const strictMac = strictSandboxCapabilities({ platform: "darwin" });
assert.equal(strictMac.available, false);
assert.equal(strictMac.backend, null);
assert.deepEqual(strictMac.capabilities, callerMac.capabilities);
assert.throws(
  () => assertStrictSandboxCapabilities({ platform: "darwin" }),
  (error) => error instanceof SandboxCapabilityError
    && error.code === "sandbox_capability_requirement_not_met"
    && error.platform === "darwin"
    && error.missingCapabilities.map((item) => item.axis).join(",") === "filesystem,network,process",
);

const strictLinux = strictSandboxCapabilities({ platform: "linux", backendPath: "/usr/bin/bwrap" });
assert.equal(strictLinux.available, true);
assert.deepEqual(strictLinux.capabilities, strictRequirement);
assert.equal(strictLinux.processIsolation, true);

const planned = buildStrictSandboxInvocation({
  command: ["node", "-e", "process.exit(0)"],
  cwd: ROOT,
  repositoryRoot: ROOT,
  writablePaths: [".tmp/sandbox-capability-model-test/writable"],
  platform: "linux",
  backendPath: "/usr/bin/bwrap",
});
assert.ok(planned.args.includes("--unshare-pid"));
assert.ok(planned.args.includes("--new-session"));
assert.deepEqual(planned.metadata.capabilities, strictRequirement);
assert.equal(planned.metadata.process, "pid-namespace-new-session");

function manifest() {
  return {
    schemaVersion: 1,
    id: "sandbox-capability-test",
    projectRoot: ".",
    safety: {
      network: "caller-enforced-deny",
      filesystemWrites: "caller-enforced-artifacts-and-build-output",
      upstreamWrites: "caller-enforced-deny",
      credentials: "caller-enforced-deny",
    },
    stages: [{
      id: "must-not-run",
      kind: "check",
      cwd: ".",
      command: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(SENTINEL)}, 'ran')`],
      timeoutMs: 5000,
      dependsOn: [],
      required: true,
    }],
    artifacts: { output: ".tmp/sandbox-capability-model-test/out" },
  };
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
try {
  const callerReport = runWebProject(ROOT, manifest(), {
    writeArtifacts: false,
    sandbox: { mode: "caller-enforced", platform: "darwin" },
  });
  assert.equal(callerReport.ok, true);
  assert.equal(callerReport.sandbox.platform, "darwin");
  assert.deepEqual(callerReport.sandbox.capabilities, callerMac.capabilities);
  assert.equal(callerReport.sandbox.diagnostic, "caller_enforced_execution");
  fs.rmSync(SENTINEL, { force: true });

  assert.throws(
    () => runWebProject(ROOT, manifest(), {
      writeArtifacts: false,
      sandbox: { mode: "strict", platform: "darwin" },
    }),
    (error) => error instanceof SandboxCapabilityError
      && error.code === "sandbox_capability_requirement_not_met",
  );
  assert.equal(fs.existsSync(SENTINEL), false, "strict capability rejection must happen before any stage executes");
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  runtime: "sandbox-capability-model-test",
  axes: SANDBOX_CAPABILITY_AXES,
  levels: SANDBOX_CAPABILITY_LEVELS,
  strictMacFailClosed: true,
  deterministicReport: true,
}));
