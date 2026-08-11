#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildStrictSandboxInvocation,
  safeExecutionEnvironment,
  strictSandboxCapabilities,
} from "../protocol/web-execution-sandbox.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-execution-sandbox-test");
const WRITABLE = path.join(TMP, "writable");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(WRITABLE, { recursive: true });
try {
  const environment = safeExecutionEnvironment({
    ...process.env,
    PROPED_WEB_SANDBOX_SECRET: "must-not-cross-boundary",
  }, { osEnforced: true });
  assert.equal(environment.PROPED_WEB_SANDBOX_SECRET, undefined);
  assert.equal(environment.HOME, "/tmp");
  assert.equal(environment.PROPED_NETWORK_POLICY, "os-enforced-deny");

  const planned = buildStrictSandboxInvocation({
    command: [process.execPath, "-e", "process.exit(0)"],
    cwd: ROOT,
    repositoryRoot: ROOT,
    writablePaths: [path.relative(ROOT, WRITABLE)],
    platform: "linux",
    backendPath: "/usr/bin/bwrap",
  });
  assert.equal(planned.executable, "/usr/bin/bwrap");
  assert.ok(planned.args.includes("--unshare-net"));
  assert.ok(planned.args.includes("--ro-bind"));
  assert.ok(planned.args.includes("--tmpfs"));
  assert.ok(planned.args.includes("--bind"));
  assert.deepEqual(planned.metadata.writablePaths, [path.relative(ROOT, WRITABLE)]);
  assert.equal(planned.metadata.sourceTree, "read-only");
  assert.equal(planned.metadata.upstreamGitWrites, "os-enforced-deny");
  assert.throws(() => buildStrictSandboxInvocation({
    command: ["true"], cwd: ROOT, repositoryRoot: ROOT, writablePaths: ["."], platform: "linux", backendPath: "/usr/bin/bwrap",
  }), /repository subpath/);
  assert.throws(() => buildStrictSandboxInvocation({
    command: ["true"], cwd: ROOT, repositoryRoot: ROOT, writablePaths: [".git/proped"], platform: "linux", backendPath: "/usr/bin/bwrap",
  }), /never permits writes inside \.git/);

  const live = process.argv.includes("--live");
  if (live) {
    if (process.platform !== "linux") throw new Error("--live strict sandbox probe requires Linux");
    const capabilities = strictSandboxCapabilities();
    assert.equal(capabilities.available, true, capabilities.reason);
    const sourceFile = path.join(TMP, "source-read-only.txt");
    const allowedFile = path.join(WRITABLE, "artifact.txt");
    const gitProbe = path.join(ROOT, ".git/proped-web-sandbox-probe");
    fs.writeFileSync(sourceFile, "original\n");
    fs.rmSync(gitProbe, { force: true });

    const probe = String.raw`
const fs = require('node:fs');
const net = require('node:net');
const sourceFile = process.argv[1];
const allowedFile = process.argv[2];
const gitProbe = process.argv[3];
const result = { credentialsDenied: process.env.PROPED_WEB_SANDBOX_SECRET === undefined };
try { fs.writeFileSync(sourceFile, 'mutated'); result.sourceReadOnly = false; } catch { result.sourceReadOnly = true; }
try { fs.writeFileSync(gitProbe, 'mutated'); result.upstreamGitWritesDenied = false; } catch { result.upstreamGitWritesDenied = true; }
try { fs.writeFileSync(allowedFile, 'artifact'); result.explicitWritablePathWorks = fs.readFileSync(allowedFile, 'utf8') === 'artifact'; } catch (error) { result.explicitWritablePathWorks = false; result.writeError = error.message; }
const socket = net.createConnection({host:'1.1.1.1', port:53});
const finish = (denied) => { result.networkDenied = denied; console.log(JSON.stringify(result)); process.exit(Object.values(result).every(Boolean) ? 0 : 1); };
socket.setTimeout(500);
socket.once('connect', () => { socket.destroy(); finish(false); });
socket.once('error', () => finish(true));
socket.once('timeout', () => { socket.destroy(); finish(true); });
`;
    const invocation = buildStrictSandboxInvocation({
      command: [process.execPath, "-e", probe, sourceFile, allowedFile, gitProbe],
      cwd: ROOT,
      repositoryRoot: ROOT,
      writablePaths: [path.relative(ROOT, WRITABLE)],
    });
    const completed = spawnSync(invocation.executable, invocation.args, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 10_000,
      env: environment,
    });
    assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
    const result = JSON.parse(completed.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
    assert.deepEqual(result, {
      credentialsDenied: true,
      sourceReadOnly: true,
      upstreamGitWritesDenied: true,
      explicitWritablePathWorks: true,
      networkDenied: true,
    });
    assert.equal(fs.readFileSync(sourceFile, "utf8"), "original\n");
    assert.equal(fs.existsSync(gitProbe), false);
    console.log(JSON.stringify({ ok: true, runtime: "web-execution-sandbox-live", ...result, backend: capabilities.backend }));
  } else {
    console.log(JSON.stringify({
      ok: true,
      runtime: "web-execution-sandbox-test",
      linuxPlan: true,
      credentialAllowlist: true,
      writablePathConfinement: true,
    }));
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
