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
  assertConstrainedSandboxCapabilities,
  assertStrictSandboxCapabilities,
  buildMacosConstrainedSandboxInvocation,
  buildStrictSandboxInvocation,
  callerEnforcedSandboxCapabilities,
  macosConstrainedSandboxCapabilities,
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

const constrainedMac = macosConstrainedSandboxCapabilities({ platform: "darwin", backendPath: "/usr/bin/sandbox-exec" });
assert.equal(constrainedMac.available, true);
assert.equal(constrainedMac.backend, "sandbox-exec");
assert.deepEqual(constrainedMac.capabilities, {
  filesystem: "constrained",
  network: "constrained",
  process: "constrained",
});
assert.equal(constrainedMac.processIsolation, false);
assert.equal(constrainedMac.childPolicyInheritance, true);
assert.equal(constrainedMac.hostHomeReadIsolation, "unsupported");
assert.deepEqual(
  assertConstrainedSandboxCapabilities({ platform: "darwin", backendPath: "/usr/bin/sandbox-exec" }).capabilities,
  constrainedMac.capabilities,
);

const strictMac = strictSandboxCapabilities({ platform: "darwin", backendPath: "/usr/bin/sandbox-exec" });
assert.equal(strictMac.available, false);
assert.equal(strictMac.backend, "sandbox-exec");
assert.deepEqual(strictMac.capabilities, constrainedMac.capabilities);
assert.throws(
  () => assertStrictSandboxCapabilities({ platform: "darwin", backendPath: "/usr/bin/sandbox-exec" }),
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

const plannedMac = buildMacosConstrainedSandboxInvocation({
  command: ["node", "-e", "process.exit(0)"],
  cwd: ROOT,
  repositoryRoot: ROOT,
  writablePaths: [".tmp/sandbox-capability-model-test/writable-mac"],
  backendPath: "/usr/bin/sandbox-exec",
  temporaryDirectory: path.join(TMP, "mac-home"),
  credentialReadDenyPaths: [path.join(TMP, "credential")],
});
assert.equal(plannedMac.executable, "/usr/bin/sandbox-exec");
assert.equal(plannedMac.args[0], "-p");
assert.match(plannedMac.args[1], /\(deny network\*\)/);
assert.match(plannedMac.args[1], /\(deny file-write\*\)/);
assert.deepEqual(plannedMac.metadata.capabilities, constrainedMac.capabilities);
assert.equal(plannedMac.metadata.mode, "constrained");
assert.equal(plannedMac.metadata.hostHomeReadIsolation, "unsupported");
assert.equal(plannedMac.metadata.credentialReadDenyPathCount, 1);

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

  if (process.platform === "darwin") {
    const constrainedReport = runWebProject(ROOT, manifest(), {
      writeArtifacts: false,
      sandbox: {
        mode: "constrained",
        writablePaths: [path.relative(ROOT, TMP)],
      },
    });
    assert.equal(constrainedReport.ok, true);
    assert.equal(constrainedReport.sandbox.mode, "constrained");
    assert.equal(constrainedReport.sandbox.backend, "sandbox-exec");
    assert.deepEqual(constrainedReport.sandbox.capabilities, constrainedMac.capabilities);
    assert.equal(fs.existsSync(SENTINEL), true);
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  runtime: "sandbox-capability-model-test",
  axes: SANDBOX_CAPABILITY_AXES,
  levels: SANDBOX_CAPABILITY_LEVELS,
  strictMacFailClosed: true,
  constrainedMacReported: true,
  deterministicReport: true,
}));
