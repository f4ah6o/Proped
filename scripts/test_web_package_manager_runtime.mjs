#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyPackageManagerRuntimeEnvironment,
  defaultCorepackHome,
  probePackageManagerRuntime,
} from "../protocol/web-package-manager-runtime.mjs";
import { safeExecutionEnvironment } from "../protocol/web-execution-sandbox.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-package-manager-runtime-"));
try {
  const project = path.join(root, "project");
  const bin = path.join(root, "bin");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "fixture", packageManager: "pnpm@9.15.0" }));
  const corepack = path.join(bin, "corepack");
  fs.writeFileSync(corepack, `#!/usr/bin/env node\nif (process.env.FAKE_COREPACK_CACHED === '1') { console.log('9.15.0'); process.exit(0); }\nconsole.error('Network access disabled by the environment; cannot download package manager'); process.exit(1);\n`);
  fs.chmodSync(corepack, 0o755);

  const manifest = { project: { root: ".", packageManager: "pnpm", packageManagerReference: "pnpm@9.15.0" } };
  const baseEnvironment = {
    ...process.env,
    HOME: path.join(root, "home"),
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  assert.equal(defaultCorepackHome(baseEnvironment), path.join(root, "home", ".cache", "node", "corepack"));

  const deniedEnvironment = applyPackageManagerRuntimeEnvironment(manifest, baseEnvironment, { allowNetwork: false });
  assert.equal(deniedEnvironment.COREPACK_ENABLE_NETWORK, "0");
  assert.equal(deniedEnvironment.COREPACK_HOME, path.join(root, "home", ".cache", "node", "corepack"));
  const prepareRequired = probePackageManagerRuntime(root, manifest, deniedEnvironment);
  assert.equal(prepareRequired.status, "prepare-required");
  assert.equal(prepareRequired.reason, "corepack-manager-not-cached");

  const cachedEnvironment = { ...deniedEnvironment, FAKE_COREPACK_CACHED: "1" };
  const ready = probePackageManagerRuntime(root, manifest, cachedEnvironment);
  assert.equal(ready.status, "ready");
  assert.equal(ready.version, "9.15.0");

  const prepareEnvironment = applyPackageManagerRuntimeEnvironment(manifest, baseEnvironment, { allowNetwork: true });
  assert.equal(prepareEnvironment.COREPACK_ENABLE_NETWORK, "1");

  const strictEnvironment = safeExecutionEnvironment(deniedEnvironment, { osEnforced: true });
  assert.equal(strictEnvironment.HOME, "/tmp");
  assert.equal(strictEnvironment.COREPACK_ENABLE_NETWORK, "0");
  assert.equal(strictEnvironment.COREPACK_HOME, path.join(root, "home", ".cache", "node", "corepack"));

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-package-manager-runtime-test",
    corepackManaged: true,
    uncachedFailsClosed: true,
    cachedReady: true,
    strictCachePathPreserved: true,
    implicitNetworkDenied: true,
    runPreflight: true,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
