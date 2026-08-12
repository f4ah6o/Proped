#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const suffix = process.platform === "win32" ? ".exe" : "";
const nativeCli = path.join(ROOT, "target", "debug", `proped${suffix}`);

function firstMatch(file, pattern, label) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const match = text.match(pattern);
  assert.ok(match, `${label} not found in ${file}`);
  return match[1];
}

const cargoVersion = firstMatch(
  "crates/proped-cli/Cargo.toml",
  /^version = "([^"]+)"$/m,
  "Cargo version",
);
const moonVersion = firstMatch("moon.mod", /^version = "([^"]+)"$/m, "MoonBit version");
const lockVersion = firstMatch(
  "Cargo.lock",
  /name = "proped-cli"\nversion = "([^"]+)"/,
  "Cargo.lock version",
);

assert.match(cargoVersion, /^\d{4}\.(?:[1-9]|1[0-2])\.\d+$/);
assert.equal(moonVersion, cargoVersion);
assert.equal(lockVersion, cargoVersion);

const moonCli = spawnSync("moon", ["run", "src/cli", "--", "version", "--json"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: false,
  timeout: 60_000,
});
assert.equal(moonCli.status, 0, moonCli.stderr);
assert.equal(JSON.parse(moonCli.stdout).version, cargoVersion);

assert.equal(fs.existsSync(nativeCli), true, `native CLI not built: ${nativeCli}`);
const nativeVersion = spawnSync(nativeCli, ["-V"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: false,
  timeout: 60_000,
});
assert.equal(nativeVersion.status, 0, nativeVersion.stderr);

const provenance = fs
  .readFileSync(path.join(ROOT, "crates/proped-cli/src/release-commit.txt"), "utf8")
  .trim();
const expectedProvenance = /^[0-9a-fA-F]{7}$/.test(provenance) ? provenance : "dev";
assert.equal(nativeVersion.stdout.trim(), `proped ${cargoVersion} (${expectedProvenance})`);

console.log(
  JSON.stringify({
    ok: true,
    runtime: "proped-version-consistency-test",
    version: cargoVersion,
    provenance: expectedProvenance,
    cargo: true,
    moonbit: true,
    nativeCli: true,
  }),
);
