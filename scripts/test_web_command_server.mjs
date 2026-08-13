#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractLoopbackServerUrls, startWebCommandServer } from "../protocol/web-command-server.mjs";

assert.deepEqual(extractLoopbackServerUrls("Local: http://localhost:4173/app/ Network: http://10.0.0.2:4173/"), ["http://localhost:4173/app/"]);
assert.deepEqual(extractLoopbackServerUrls("http://127.0.0.1:8080/ and https://example.com/"), ["http://127.0.0.1:8080/"]);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-command-server-"));
try {
  const child = path.join(root, "server.mjs");
  fs.writeFileSync(child, `
    import http from 'node:http';
    const server = http.createServer((req,res) => {
      if (req.url === '/app/') { res.writeHead(200, {'content-type':'text/plain'}); res.end('ok'); return; }
      res.writeHead(404); res.end('no');
    });
    server.listen(Number(process.env.PORT), '127.0.0.1', () => {
      const address = server.address();
      console.log('Local: http://127.0.0.1:' + address.port + '/app/');
      console.log('External: https://example.invalid:' + address.port + '/');
      console.log('SECRET_SEEN=' + Boolean(process.env.PROPED_COMMAND_SERVER_SECRET || process.env.NPM_TOKEN));
    });
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  `);
  const previousSecret = process.env.PROPED_COMMAND_SERVER_SECRET;
  const previousToken = process.env.NPM_TOKEN;
  process.env.PROPED_COMMAND_SERVER_SECRET = "must-not-leak";
  process.env.NPM_TOKEN = "must-not-leak";
  let server;
  try {
    server = await startWebCommandServer(root, [process.execPath, child], 5000, { requestedPort: 39123 });
    assert.equal(server.url, "http://127.0.0.1:39123/");
    assert.equal(server.generation, 1);
    const restarted = await server.restart();
    assert.equal(restarted.url, server.url);
    assert.equal(server.generation, 2);
    assert.equal(server.diagnostics.at(-1).kind, "server-command-restart");
    assert.equal(server.diagnostics.at(-1).stableOrigin, true);
    assert.equal(server.diagnostics[0].selectedUrlSource, "reserved-port");
    assert.equal(server.diagnostics[0].credentialEnvironment, "environment-allowlist-deny");
    assert.equal(server.diagnostics[0].discoveredLoopbackUrls.some((candidate) => candidate.url === "https://example.invalid/"), false);
  } finally {
    if (server) await server.stop();
    if (previousSecret === undefined) delete process.env.PROPED_COMMAND_SERVER_SECRET; else process.env.PROPED_COMMAND_SERVER_SECRET = previousSecret;
    if (previousToken === undefined) delete process.env.NPM_TOKEN; else process.env.NPM_TOKEN = previousToken;
  }
  if (process.platform !== "win32") {
    const helper = path.join(root, "detached-helper.mjs");
    const helperPidFile = path.join(root, "detached-helper.pid");
    fs.writeFileSync(helper, `setInterval(() => {}, 1000);\n`);
    const treeServer = path.join(root, "tree-server.mjs");
    fs.writeFileSync(treeServer, `
      import fs from 'node:fs';
      import http from 'node:http';
      import { spawn } from 'node:child_process';
      const helper = spawn(process.execPath, [${JSON.stringify(helper)}], { detached: true, stdio: 'ignore' });
      helper.unref();
      fs.writeFileSync(${JSON.stringify(helperPidFile)}, String(helper.pid));
      const server = http.createServer((_req,res) => { res.writeHead(200); res.end('ok'); });
      server.listen(Number(process.env.PORT), '127.0.0.1');
      process.on('SIGTERM', () => server.close(() => process.exit(0)));
    `);
    const tree = await startWebCommandServer(root, [process.execPath, treeServer], 5000, { requestedPort: 39125 });
    const helperPid = Number(fs.readFileSync(helperPidFile, 'utf8'));
    await tree.stop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    let helperAlive = true;
    try { process.kill(helperPid, 0); } catch { helperAlive = false; }
    assert.equal(helperAlive, false, 'managed server stop must terminate descendants that created a separate process group');
  }

  const hanging = path.join(root, "hanging.mjs");
  const pidFile = path.join(root, "hanging.pid");
  fs.writeFileSync(hanging, `
    import fs from 'node:fs';
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    process.stdout.write('Local: http://127.0.');
    setTimeout(() => process.stdout.write('0.1:65534/\\n'), 20);
    setInterval(() => {}, 1000);
  `);
  await assert.rejects(() => startWebCommandServer(root, [process.execPath, hanging], 250, { requestedPort: 39124 }), /readiness timeout/);
  const hangingPid = Number(fs.readFileSync(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  let alive = true;
  try { process.kill(hangingPid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'readiness failure must terminate the child process');

  console.log(JSON.stringify({ ok: true, runtime: "web-command-server-test", fallbackToStdoutUrl: true, splitChunkUrlDiscovery: true, loopbackOnly: true, credentialsDenied: true, cleanupOnSuccess: true, cleanupOnReadinessFailure: true, restartStableOrigin: true, cleanupDetachedProcessGroup: process.platform !== "win32" }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
