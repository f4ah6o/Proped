#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";
import { NuxtSsrHydrationDriver } from "./nuxt-ssr-hydration-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/nuxt-ssr-hydration-result.json");
const OUTPUT = path.join(HERE, "out");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");

function stableSnapshot(snapshot) {
  return {
    caseName: snapshot.caseName,
    serverLabel: snapshot.serverLabel,
    hydratedLabel: snapshot.hydratedLabel,
    hydrationMismatch: snapshot.hydrationMismatch,
    hydrationWarningCount: snapshot.hydrationWarningCount,
    hydrationMessages: snapshot.hydrationMessages,
    asyncData: snapshot.asyncData,
    middleware: snapshot.middleware,
    serverRouteResult: snapshot.serverRouteResult,
    storage: snapshot.storage,
    fingerprint: snapshot.fingerprint,
    serverSemanticHash: snapshot.serverSemanticHash,
    routePolicy: snapshot.browser.networkPolicy,
  };
}

async function verifyCaseReset(driver) {
  await driver.reset({ caseName: "stable" });
  await driver.submitServerRoute("Reset probe");
  await driver.page.evaluate(() => {
    localStorage.setItem("case-leak", "local");
    sessionStorage.setItem("case-leak", "session");
  });
  const dirty = await driver.snapshot();
  assert.equal(dirty.storage.local["case-leak"], "local");
  assert.equal(dirty.serverRouteResult.sequence, 1);
  await driver.reset({ caseName: "stable" });
  const clean = await driver.snapshot();
  assert.deepEqual(clean.storage, { local: {}, session: {} });
  assert.deepEqual(clean.serverRouteResult, {
    status: "idle",
    sequence: 0,
    title: "",
    effect: null,
  });
  assert.equal(clean.asyncData.caseName, "stable");
  assert.equal(clean.middleware.entered, true);
  return { dirtyContext: dirty.browser.contextSequence, cleanContext: clean.browser.contextSequence };
}

function writeArtifacts(stable) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(stable, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "nuxt-ssr-hydration",
    cases: stable.cases,
    failures: stable.failures,
    diagnostics: stable.diagnostics,
    semanticHash: stable.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    'digraph nuxt_hydration { stable -> mismatch [label="case"]; stable -> server_route [label="POST descriptor"]; }\n',
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180"><rect width="100%" height="100%" fill="white"/><text x="24" y="40">Nuxt SSR and hydration</text><text x="24" y="78">useAsyncData + middleware + Nitro route</text><text x="24" y="116">${stable.failures.length} hydration failure / descriptor-only server route</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Nuxt SSR hydration Atlas</title><body><h1>Nuxt SSR hydration</h1><pre>${JSON.stringify(atlas, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const driver = new NuxtSsrHydrationDriver();
try {
  const cases = [];
  const failures = [];
  const diagnostics = [];

  const stable = await driver.reset({ caseName: "stable" });
  assert.equal(stable.hydrationMismatch, false);
  assert.equal(stable.hydrationWarningCount, 0);
  assert.equal(stable.serverLabel, "stable-nuxt");
  assert.equal(stable.hydratedLabel, "stable-nuxt");
  assert.deepEqual(stable.asyncData, {
    kind: "nitro-server-route",
    method: "GET",
    caseName: "stable",
    asyncValue: "async-stable",
    externalMutation: false,
  });
  assert.deepEqual(stable.middleware, {
    entered: true,
    route: "/fixture",
    externalMutation: false,
  });
  cases.push(stableSnapshot(stable));
  diagnostics.push({
    kind: "async_data_boundary",
    source: stable.asyncData.kind,
    externalMutation: stable.asyncData.externalMutation,
  });
  diagnostics.push({
    kind: "middleware_boundary",
    route: stable.middleware.route,
    externalMutation: stable.middleware.externalMutation,
  });

  const described = await driver.submitServerRoute("Updated");
  assert.deepEqual(described.serverRouteResult, {
    status: "described",
    sequence: 1,
    title: "Updated",
    effect: {
      kind: "nitro-server-route",
      method: "POST",
      policy: "descriptor-only",
      externalMutation: false,
    },
  });
  diagnostics.push({
    kind: "server_route_boundary",
    method: described.serverRouteResult.effect.method,
    policy: described.serverRouteResult.effect.policy,
    externalMutation: described.serverRouteResult.effect.externalMutation,
  });

  const denied = await driver.attemptExternalNetwork();
  const blocked = denied.routes.filter((entry) => entry.decision === "abort");
  assert.ok(blocked.some((entry) => entry.url === "https://blocked.invalid/nuxt-fixture"));
  diagnostics.push({
    kind: "network_boundary",
    policy: "loopback-fixture-only",
    blockedRoutes: blocked.length,
  });

  const mismatchOne = await driver.reset({ caseName: "mismatch" });
  assert.equal(mismatchOne.hydrationMismatch, true);
  assert.ok(mismatchOne.hydrationWarningCount >= 1);
  assert.equal(mismatchOne.serverLabel, "server-nuxt");
  assert.equal(mismatchOne.hydratedLabel, "client-nuxt");
  assert.equal(mismatchOne.asyncData.caseName, "mismatch");
  const failureOne = driver.buildHydrationFailure(mismatchOne);

  const mismatchTwo = await driver.reset({ caseName: "mismatch" });
  const failureTwo = driver.buildHydrationFailure(mismatchTwo);
  assert.equal(mismatchOne.fingerprint, mismatchTwo.fingerprint);
  assert.equal(failureOne.signature.semanticHash, failureTwo.signature.semanticHash);
  failures.push({
    ...failureOne,
    signature: failureOne.signature.semanticHash,
    snapshotHash: mismatchOne.fingerprint,
    replayCount: 2,
    browserVersion: mismatchOne.browser.version,
  });
  cases.push(stableSnapshot(mismatchOne));

  const resets = await verifyCaseReset(driver);
  assert.ok(resets.cleanContext > resets.dirtyContext);

  const packageJson = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const stableResult = {
    ok: true,
    runtime: "nuxt-ssr-hydration",
    versions: {
      nuxt: packageJson.dependencies.nuxt,
      vue: packageJson.dependencies.vue,
      playwright: packageJson.dependencies.playwright,
    },
    casePolicy: {
      freshBrowserContext: true,
      serviceWorkers: "block",
      network: "loopback-fixture-only",
      externalEffects: "deny-or-descriptor",
      readiness: "explicit-main-data-ready-and-async-data",
    },
    cases,
    failures,
    diagnostics,
    resets,
  };
  stableResult.semanticHash = semanticHash(stableResult);
  writeArtifacts(stableResult);

  if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
    fs.writeFileSync(FIXTURE, `${JSON.stringify(stableResult, null, 2)}\n`);
  } else {
    assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stableResult);
  }
  console.log(JSON.stringify(stableResult));
} finally {
  await driver.dispose();
}
