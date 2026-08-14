#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyNodeRuntimeToEnvironment,
  inventoryNodeRuntimes,
  nodeRequirementFromPackageManagerFailure,
  resolveNodeRuntime,
  summarizeNodeRuntimeResolution,
} from "../protocol/web-node-runtime.mjs";

function fakeNode(file, version) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
  fs.chmodSync(file, 0o755);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-node-runtime-"));
try {
  const current = path.join(root, "current", "bin", "node");
  const node20 = path.join(root, ".nvm", "versions", "node", "v20.20.0", "bin", "node");
  const node22 = path.join(root, ".nvm", "versions", "node", "v22.22.3", "bin", "node");
  const node25 = path.join(root, ".nvm", "versions", "node", "v25.7.0", "bin", "node");
  const explicitNode21 = path.join(root, "explicit", "v21.7.3", "bin", "node");
  fakeNode(current, "v25.7.0");
  fakeNode(node20, "v20.20.0");
  fakeNode(node22, "v22.22.3");
  fakeNode(node25, "v25.7.0");
  fakeNode(explicitNode21, "v21.7.3");
  const environment = { HOME: root, PATH: "/usr/bin:/bin", PROPED_NODE_RUNTIME_PATHS: explicitNode21 };

  assert.equal(nodeRequirementFromPackageManagerFailure("Expected version: ^22.18.0 || >=24.11.0\nGot: v22.14.0\n"), "^22.18.0 || >=24.11.0");
  assert.equal(nodeRequirementFromPackageManagerFailure("Expected version: >=22\n"), null, "a retry requirement requires both expected and observed versions");

  const inventory = inventoryNodeRuntimes("^24.0.0 || ^22.15.0", { environment, currentExecutable: current });
  assert.equal(inventory.length, 5);
  assert.equal(inventory.find((item) => item.path === fs.realpathSync(explicitNode21))?.source, "explicit");
  assert.equal(inventory.find((item) => item.path === fs.realpathSync(node22))?.engine.compatible, true);
  assert.equal(inventory.find((item) => item.path === fs.realpathSync(node25))?.engine.compatible, false);

  const selected = resolveNodeRuntime("^24.0.0 || ^22.15.0", { environment, currentExecutable: current });
  assert.equal(selected.status, "selected");
  assert.equal(selected.selected.version, "v22.22.3");
  assert.equal(selected.selected.source, "nvm");
  assert.equal(selected.automaticDownload, false);

  const explicitSelected = resolveNodeRuntime("^21.0.0", { environment, currentExecutable: current });
  assert.equal(explicitSelected.status, "selected");
  assert.equal(explicitSelected.selected.version, "v21.7.3");
  assert.equal(explicitSelected.selected.source, "explicit");

  const openEnded = resolveNodeRuntime(">=18.12.0", { environment, currentExecutable: current });
  assert.equal(openEnded.status, "selected");
  assert.equal(openEnded.selected.version, "v20.20.0");
  assert.equal(openEnded.selectedReason, "lowest-compatible-open-range");

  const preferredMajorFallback = resolveNodeRuntime(">=18.0", { environment, currentExecutable: current, preferredVersion: "22.10.0" });
  assert.equal(preferredMajorFallback.status, "selected");
  assert.equal(preferredMajorFallback.selected.version, "v22.22.3");
  assert.equal(preferredMajorFallback.selectedReason, "preferred-major-fallback");
  assert.equal(preferredMajorFallback.reason, "preferred-runtime-not-installed");

  const preferredExact = resolveNodeRuntime(">=18.0", { environment, currentExecutable: current, preferredVersion: "22.22.3" });
  assert.equal(preferredExact.selected.version, "v22.22.3");
  assert.equal(preferredExact.selectedReason, "preferred-exact");
  const applied = applyNodeRuntimeToEnvironment(environment, selected);
  assert.equal(applied.PATH.split(path.delimiter)[0], path.dirname(fs.realpathSync(node22)));

  const unavailable = resolveNodeRuntime("^23.0.0", { environment, currentExecutable: current });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.selected, null);
  assert.equal(unavailable.automaticDownload, false);

  const currentSelected = resolveNodeRuntime("^25.0.0", { environment, currentExecutable: current });
  assert.equal(currentSelected.selected.source, "current");
  assert.equal(currentSelected.selected.version, "v25.7.0");

  const summary = summarizeNodeRuntimeResolution(selected);
  assert.equal(summary.selected.version, "v22.22.3");
  assert.equal(summary.automaticDownload, false);
  console.log(JSON.stringify({
    ok: true,
    runtime: "web-node-runtime-test",
    selected: summary.selected,
    compatibleFallback: true,
    preferredMajorFallback: preferredMajorFallback.selected.version,
    automaticDownload: summary.automaticDownload,
    unavailableIsFailClosed: unavailable.status === "unavailable",
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
