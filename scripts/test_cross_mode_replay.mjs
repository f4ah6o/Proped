#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareRuntimeMetadata,
  defaultRuntimeMetadata,
  mapStableActionId,
  replayCrossMode,
} from "../protocol/cross-mode-replay.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { PlaywrightBrowserDriver } from "../web/playwright-browser/playwright-browser-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FIXTURE_PATH = path.join(ROOT, "protocol/fixtures/cross-mode-replay-result.json");
const OUTPUT = path.join(ROOT, "protocol/out/cross-mode-replay");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");
const TARGET_FIXTURE = "browser-fault-form";
const SEED = 23;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

function sourceFailure(failure) {
  const signature = failure.signature ?? {};
  return {
    property: failure.property,
    failureClass: signature.failureClass ?? failure.property,
    trace: signature.trace ?? failure.trace,
    sourceSignature: signature.semanticHash ?? failure.semanticHash,
  };
}

function sourceMetadata(framework) {
  const packageJson = readJson(`web/${framework}-component/package.json`);
  return defaultRuntimeMetadata({
    mode: "component",
    framework,
    runtime: `${framework}-component`,
    runtimeVersion: packageJson.dependencies[framework],
  });
}

function targetMetadata() {
  const packageJson = readJson("web/playwright-browser/package.json");
  return defaultRuntimeMetadata({
    mode: "browser",
    framework: "browser",
    runtime: "playwright-chromium",
    runtimeVersion: packageJson.dependencies.playwright,
  });
}

function invalidInputOutcome({ initial, finalSnapshot }) {
  return {
    matched: initial.applicationState.numberResult === 4 &&
      finalSnapshot.applicationState.numberResult === 0,
    violation: {
      code: "invalid_input_preserves_previous_result",
      before: initial.applicationState.numberResult,
      after: finalSnapshot.applicationState.numberResult,
    },
  };
}

function verifyFailClosedDiagnostics() {
  const target = targetMetadata();
  const mismatch = compareRuntimeMetadata(
    sourceMetadata("react"),
    { ...target, normalizerVersion: "2" },
  );
  assert.equal(mismatch.compatible, false);
  assert.equal(mismatch.diagnostics[0].kind, "runtime_metadata_mismatch");

  const missing = mapStableActionId("click|button|Missing", []);
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostic.kind, "missing_cross_mode_action");

  const ambiguous = mapStableActionId(
    "type|searchbox|Search|within=form:Profile|input=\"a\"",
    [
      { id: "type|searchbox|Search|input=\"a\"" },
      { id: "type|searchbox|Search|input=\"a\"" },
    ],
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.diagnostic.kind, "ambiguous_cross_mode_action");

  return [mismatch.diagnostics[0], missing.diagnostic, ambiguous.diagnostic];
}

function writeArtifacts(stable) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(stable, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "cross-mode-replay",
    sourceModes: stable.sources,
    targetMode: stable.target,
    replayCount: stable.replays.length,
    failures: stable.replays.map((replay) => ({
      framework: replay.framework,
      property: replay.property,
      sourceTrace: replay.sourceTrace,
      targetTrace: replay.targetTrace,
      signature: replay.signature,
    })),
    diagnostics: stable.failClosedDiagnostics,
    semanticHash: stable.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    "digraph cross_mode { react -> browser [label=\"3 failures\"]; vue -> browser [label=\"3 failures\"]; }\n",
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180"><rect width="100%" height="100%" fill="white"/><text x="24" y="40">Cross-mode replay</text><text x="24" y="78">React + Vue Component Mode → Playwright Browser Mode</text><text x="24" y="116">${stable.replays.length} failure replays / ${stable.replays.length * 2} fresh Browser contexts</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Cross-mode replay</title><body><h1>Cross-mode replay</h1><pre>${JSON.stringify(atlas, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const driver = new PlaywrightBrowserDriver();
try {
  const target = targetMetadata();
  const replays = [];
  for (const framework of ["react", "vue"]) {
    const fixture = readJson(`protocol/fixtures/${framework}-component-mode-result.json`);
    for (const rawFailure of fixture.failures) {
      const failure = sourceFailure(rawFailure);
      const replay = await replayCrossMode({
        targetDriver: driver,
        sourceTrace: failure.trace,
        sourceMetadata: sourceMetadata(framework),
        targetMetadata: target,
        sourceFailure: failure,
        targetFixture: TARGET_FIXTURE,
        seed: SEED,
        evaluateOutcome: failure.property === "invalid_input_preserves_previous_result"
          ? invalidInputOutcome
          : undefined,
      });
      assert.equal(replay.ok, true, JSON.stringify(replay.diagnostics));
      assert.equal(replay.property, failure.property);
      assert.equal(replay.failureClass, failure.failureClass);
      assert.equal(replay.deterministic, true);
      assert.equal(replay.replayCount, 2);
      replays.push({
        framework,
        property: replay.property,
        failureClass: replay.failureClass,
        sourceTrace: replay.sourceTrace,
        sourceSignature: replay.sourceSignature,
        targetTrace: replay.targetTrace,
        mappings: replay.mappings,
        finalSnapshotHash: replay.finalSnapshotHash,
        targetRuntime: replay.targetRuntime,
        signature: replay.signature.semanticHash,
        crossModeSemanticHash: replay.crossModeSemanticHash,
      });
    }
  }

  assert.equal(replays.length, 6);
  for (const framework of ["react", "vue"]) {
    assert.deepEqual(
      replays.filter((replay) => replay.framework === framework).map((replay) => replay.property).sort(),
      ["duplicate_submit", "invalid_input_preserves_previous_result", "stale_response"],
    );
  }
  const relaxedMappings = replays.flatMap((replay) => replay.mappings)
    .filter((mapping) => mapping.mapping === "target-scope-omitted");
  assert.equal(relaxedMappings.length, 4);

  const stable = {
    ok: true,
    schemaVersion: 1,
    sources: ["react-component", "vue-component"],
    target: "playwright-chromium",
    fixtureContract: "fault-form-v1",
    metadata: {
      protocolVersion: target.protocolVersion,
      normalizerVersion: target.normalizerVersion,
      actionIdentityVersion: target.actionIdentityVersion,
      targetRuntimeVersion: target.runtimeVersion,
    },
    replayPolicy: {
      freshTargetFixture: true,
      replayCountPerFailure: 2,
      exactMatchPreferred: true,
      uniqueScopeRelaxation: true,
      ambiguousAction: "deny",
      missingAction: "deny",
      metadataMismatch: "deny",
      externalEffects: "deny-or-descriptor",
    },
    replays,
    failClosedDiagnostics: verifyFailClosedDiagnostics(),
  };
  stable.semanticHash = semanticHash(stable);
  writeArtifacts(stable);

  if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE_PATH)) {
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(stable, null, 2)}\n`);
  } else {
    assert.deepEqual(readJson("protocol/fixtures/cross-mode-replay-result.json"), stable);
  }
  console.log(JSON.stringify(stable));
} finally {
  await driver.dispose();
}
