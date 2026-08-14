#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildMacosConstrainedSandboxInvocation,
  buildStrictSandboxInvocation,
  cleanupSandboxInvocation,
  macosConstrainedSandboxCapabilities,
  macosConstrainedSourceEnvironment,
  macosCredentialReadDenyPaths,
  safeExecutionEnvironment,
  strictSandboxCapabilities,
} from "../protocol/web-execution-sandbox.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, ".tmp/web-execution-sandbox-test");
const WRITABLE = path.join(TMP, "writable");
const MAC_HOME = path.join(TMP, "mac-home");
const MAC_CREDENTIAL = path.join(TMP, "credential.txt");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(WRITABLE, { recursive: true });
fs.mkdirSync(MAC_HOME, { recursive: true });
fs.writeFileSync(MAC_CREDENTIAL, "credential-sentinel\n");
try {
  const environment = safeExecutionEnvironment({
    ...process.env,
    PROPED_COMPONENT_BENCHMARK_MAX_MS: "150000",
    PROPED_WEB_SANDBOX_SECRET: "must-not-cross-boundary",
  }, { osEnforced: true });
  assert.equal(environment.PROPED_COMPONENT_BENCHMARK_MAX_MS, "150000");
  assert.equal(environment.PROPED_WEB_SANDBOX_SECRET, undefined);
  assert.equal(environment.HOME, "/tmp");
  assert.equal(environment.PROPED_NETWORK_POLICY, "os-enforced-deny");

  const fakeMacHome = path.join(TMP, "host-home");
  const fakeBrowserCache = path.join(fakeMacHome, "Library/Caches/ms-playwright");
  const fakeMoonHome = path.join(fakeMacHome, ".moon");
  fs.mkdirSync(fakeBrowserCache, { recursive: true });
  fs.mkdirSync(fakeMoonHome, { recursive: true });
  fs.writeFileSync(path.join(fakeMoonHome, "credentials.json"), "token-sentinel\n");
  const constrainedSourceEnvironment = macosConstrainedSourceEnvironment({ HOME: fakeMacHome, PATH: process.env.PATH });
  assert.equal(constrainedSourceEnvironment.PLAYWRIGHT_BROWSERS_PATH, fs.realpathSync(fakeBrowserCache));
  assert.equal(constrainedSourceEnvironment.HOME, fakeMacHome);
  const constrainedEnvironment = safeExecutionEnvironment(constrainedSourceEnvironment, { osEnforced: true });
  assert.equal(constrainedEnvironment.MOON_HOME, fs.realpathSync(fakeMoonHome));
  assert.equal(constrainedEnvironment.HOME, "/tmp");
  assert.ok(macosCredentialReadDenyPaths({ HOME: fakeMacHome }).includes(path.join(fakeMoonHome, "credentials.json")));

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
  assert.ok(planned.args.includes("--unshare-pid"));
  assert.ok(planned.args.includes("--new-session"));
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

  const plannedCredentialMask = buildStrictSandboxInvocation({
    command: ["true"],
    cwd: ROOT,
    repositoryRoot: ROOT,
    credentialReadDenyPaths: [MAC_CREDENTIAL, MAC_HOME],
    platform: "linux",
    backendPath: "/usr/bin/bwrap",
  });
  assert.ok(plannedCredentialMask.args.some((value, index, values) => value === "--ro-bind" && values[index + 1] === "/dev/null" && values[index + 2] === MAC_CREDENTIAL));
  assert.ok(plannedCredentialMask.args.some((value, index, values) => value === "--tmpfs" && values[index + 1] === MAC_HOME));
  assert.ok(plannedCredentialMask.args.some((value, index, values) => value === "--remount-ro" && values[index + 1] === MAC_HOME));
  assert.deepEqual(plannedCredentialMask.metadata.deniedCredentialPaths, [MAC_HOME, MAC_CREDENTIAL].sort());

  const plannedMac = buildMacosConstrainedSandboxInvocation({
    command: [process.execPath, "-e", "process.exit(0)"],
    cwd: ROOT,
    repositoryRoot: ROOT,
    writablePaths: [path.relative(ROOT, WRITABLE)],
    backendPath: "/usr/bin/sandbox-exec",
    temporaryDirectory: MAC_HOME,
    credentialReadDenyPaths: [MAC_CREDENTIAL],
  });
  assert.equal(plannedMac.executable, "/usr/bin/sandbox-exec");
  assert.equal(plannedMac.args[0], "-p");
  assert.match(plannedMac.args[1], /\(deny network\*\)/);
  assert.match(plannedMac.args[1], /\(allow network-inbound/);
  assert.match(plannedMac.args[1], /\(allow network-outbound/);
  assert.match(plannedMac.args[1], /\(deny file-write\*\)/);
  assert.match(plannedMac.args[1], /\(allow file-write\* \(subpath /);
  assert.match(plannedMac.args[1], /\(deny file-read\* \(subpath /);
  assert.equal(plannedMac.metadata.mode, "constrained");
  assert.equal(plannedMac.metadata.process, "seatbelt-policy-inherited-no-process-namespace");
  assert.equal(plannedMac.metadata.hostHomeReadIsolation, "unsupported");
  assert.deepEqual(plannedMac.metadata.capabilities, {
    filesystem: "constrained",
    network: "constrained",
    process: "constrained",
  });

  const live = process.argv.includes("--live");
  if (live) {
    const sourceFile = path.join(TMP, "source-read-only.txt");
    const allowedFile = path.join(WRITABLE, "artifact.txt");
    const gitProbe = path.join(ROOT, ".git/proped-web-sandbox-probe");
    const filesystemEscapeProbe = `/var/tmp/proped-web-sandbox-probe-${process.pid}`;
    fs.writeFileSync(sourceFile, "original\n");
    fs.writeFileSync(MAC_CREDENTIAL, "credential-sentinel\n");
    fs.rmSync(gitProbe, { force: true });
    fs.rmSync(filesystemEscapeProbe, { force: true });

    if (process.platform === "linux") {
      const capabilities = strictSandboxCapabilities();
      assert.equal(capabilities.available, true, capabilities.reason);
      const probe = String.raw`
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const sourceFile = process.argv[1];
const allowedFile = process.argv[2];
const gitProbe = process.argv[3];
const filesystemEscapeProbe = process.argv[4];
const hostPid = process.argv[5];
const result = { credentialsDenied: process.env.PROPED_WEB_SANDBOX_SECRET === undefined };
try { fs.writeFileSync(sourceFile, 'mutated'); result.sourceReadOnly = false; } catch { result.sourceReadOnly = true; }
try { fs.writeFileSync(gitProbe, 'mutated'); result.upstreamGitWritesDenied = false; } catch { result.upstreamGitWritesDenied = true; }
try { fs.writeFileSync(filesystemEscapeProbe, 'mutated'); result.filesystemEscapeDenied = false; } catch { result.filesystemEscapeDenied = true; }
try { fs.writeFileSync(allowedFile, 'artifact'); result.explicitWritablePathWorks = fs.readFileSync(allowedFile, 'utf8') === 'artifact'; } catch (error) { result.explicitWritablePathWorks = false; result.writeError = error.message; }
result.hostProcessHidden = !fs.existsSync('/proc/' + hostPid);
const childProbe = "const fs=require('node:fs');const hostPid=process.argv[1];const forbidden=process.argv[2];let ok=!fs.existsSync('/proc/'+hostPid);try{fs.writeFileSync(forbidden,'child');ok=false}catch{}process.exit(ok?0:1);";
const child = spawnSync(process.execPath, ['-e', childProbe, hostPid, filesystemEscapeProbe], { stdio: 'ignore' });
result.childProcessPolicyInherited = child.status === 0;
const socket = net.createConnection({host:'1.1.1.1', port:53});
const finish = (denied) => { result.networkDenied = denied; console.log(JSON.stringify(result)); process.exit(Object.values(result).every(Boolean) ? 0 : 1); };
socket.setTimeout(500);
socket.once('connect', () => { socket.destroy(); finish(false); });
socket.once('error', () => finish(true));
socket.once('timeout', () => { socket.destroy(); finish(true); });
`;
      const invocation = buildStrictSandboxInvocation({
        command: [process.execPath, "-e", probe, sourceFile, allowedFile, gitProbe, filesystemEscapeProbe, String(process.pid)],
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
        filesystemEscapeDenied: true,
        explicitWritablePathWorks: true,
        hostProcessHidden: true,
        childProcessPolicyInherited: true,
        networkDenied: true,
      });
      console.log(JSON.stringify({ ok: true, runtime: "web-execution-sandbox-live", ...result, backend: capabilities.backend }));
    } else if (process.platform === "darwin") {
      const capabilities = macosConstrainedSandboxCapabilities();
      assert.equal(capabilities.available, true, capabilities.reason);
      const loopbackProbe = String.raw`
const net = require('node:net');
const server = net.createServer((socket) => socket.end('ok'));
server.once('error', () => process.exit(1));
server.listen(0, '127.0.0.1', () => {
  const socket = net.createConnection({ host: '127.0.0.1', port: server.address().port });
  let value = '';
  socket.on('data', (chunk) => { value += chunk; });
  socket.on('end', () => server.close(() => process.exit(value === 'ok' ? 0 : 1)));
  socket.on('error', () => process.exit(1));
});
`;
      const loopbackInvocation = buildMacosConstrainedSandboxInvocation({
        command: [process.execPath, "-e", loopbackProbe],
        cwd: ROOT,
        repositoryRoot: ROOT,
        writablePaths: [path.relative(ROOT, WRITABLE)],
        credentialReadDenyPaths: [MAC_CREDENTIAL],
      });
      let loopbackCompleted;
      try {
        loopbackCompleted = spawnSync(loopbackInvocation.executable, loopbackInvocation.args, {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 5_000,
          env: {
            ...safeExecutionEnvironment(process.env, { osEnforced: true, temporaryDirectory: loopbackInvocation.environment.HOME }),
            ...loopbackInvocation.environment,
          },
        });
      } finally {
        cleanupSandboxInvocation(loopbackInvocation);
      }
      assert.equal(loopbackCompleted.status, 0, `${loopbackCompleted.stdout}\n${loopbackCompleted.stderr}`);
      const probe = String.raw`
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const sourceFile = process.argv[1];
const allowedFile = process.argv[2];
const gitProbe = process.argv[3];
const filesystemEscapeProbe = process.argv[4];
const credentialFile = process.argv[5];
const hostPid = Number(process.argv[6]);
const originalHome = process.argv[7];
const result = { credentialsDenied: process.env.PROPED_WEB_SANDBOX_SECRET === undefined };
result.homeRelocated = Boolean(process.env.HOME) && process.env.HOME === process.env.TMPDIR && process.env.HOME !== originalHome;
try { fs.writeFileSync(sourceFile, 'mutated'); result.sourceReadOnly = false; } catch { result.sourceReadOnly = true; }
try { fs.writeFileSync(gitProbe, 'mutated'); result.upstreamGitWritesDenied = false; } catch { result.upstreamGitWritesDenied = true; }
try { fs.writeFileSync(filesystemEscapeProbe, 'mutated'); result.filesystemEscapeDenied = false; } catch { result.filesystemEscapeDenied = true; }
try { fs.writeFileSync(allowedFile, 'artifact'); result.explicitWritablePathWorks = fs.readFileSync(allowedFile, 'utf8') === 'artifact'; } catch (error) { result.explicitWritablePathWorks = false; result.writeError = error.message; }
try { fs.readFileSync(credentialFile, 'utf8'); result.credentialPathReadDenied = false; } catch { result.credentialPathReadDenied = true; }
try { process.kill(hostPid, 0); result.hostProcessVisible = true; } catch { result.hostProcessVisible = false; }
const childProbe = "const fs=require('node:fs');const forbidden=process.argv[1];try{fs.writeFileSync(forbidden,'child');process.exit(1)}catch{process.exit(0)}";
const child = spawnSync(process.execPath, ['-e', childProbe, filesystemEscapeProbe], { encoding: 'utf8' });
result.childProcessPolicyInherited = child.status === 0;
const socket = net.createConnection({host:'1.1.1.1', port:53});
const finish = (denied) => { result.networkDenied = denied; console.log(JSON.stringify(result)); process.exit(Object.values(result).every(Boolean) ? 0 : 1); };
socket.setTimeout(500);
socket.once('connect', () => { socket.destroy(); finish(false); });
socket.once('error', () => finish(true));
socket.once('timeout', () => { socket.destroy(); finish(true); });
`;
      const invocation = buildMacosConstrainedSandboxInvocation({
        command: [
          process.execPath,
          "-e",
          probe,
          sourceFile,
          allowedFile,
          gitProbe,
          filesystemEscapeProbe,
          MAC_CREDENTIAL,
          String(process.pid),
          process.env.HOME ?? "",
        ],
        cwd: ROOT,
        repositoryRoot: ROOT,
        writablePaths: [path.relative(ROOT, WRITABLE)],
        credentialReadDenyPaths: [MAC_CREDENTIAL],
      });
      const macEnvironment = {
        ...safeExecutionEnvironment({ ...process.env, PROPED_WEB_SANDBOX_SECRET: "must-not-cross-boundary" }, {
          osEnforced: true,
          temporaryDirectory: invocation.environment.HOME,
        }),
        ...invocation.environment,
      };
      let completed;
      try {
        completed = spawnSync(invocation.executable, invocation.args, {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 10_000,
          env: macEnvironment,
        });
      } finally {
        cleanupSandboxInvocation(invocation);
      }
      assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
      const result = JSON.parse(completed.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
      assert.deepEqual(result, {
        credentialsDenied: true,
        homeRelocated: true,
        sourceReadOnly: true,
        upstreamGitWritesDenied: true,
        filesystemEscapeDenied: true,
        explicitWritablePathWorks: true,
        credentialPathReadDenied: true,
        hostProcessVisible: true,
        childProcessPolicyInherited: true,
        networkDenied: true,
      });
      console.log(JSON.stringify({
        ok: true,
        runtime: "web-execution-sandbox-live",
        ...result,
        loopbackAllowed: true,
        hostHomeReadIsolation: capabilities.hostHomeReadIsolation,
        backend: capabilities.backend,
        capabilities: capabilities.capabilities,
      }));
    } else {
      throw new Error("--live sandbox probe requires Linux or macOS");
    }

    assert.equal(fs.readFileSync(sourceFile, "utf8"), "original\n");
    assert.equal(fs.existsSync(gitProbe), false);
    assert.equal(fs.existsSync(filesystemEscapeProbe), false);
  } else {
    console.log(JSON.stringify({
      ok: true,
      runtime: "web-execution-sandbox-test",
      linuxPlan: true,
      macosConstrainedPlan: true,
      credentialAllowlist: true,
      writablePathConfinement: true,
    }));
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
