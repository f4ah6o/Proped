#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";
import { NextSsrHydrationDriver } from "./next-ssr-hydration-driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/next-ssr-hydration-result.json");
const OUTPUT = path.join(HERE, "out");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");

function stableSnapshot(snapshot) {
  return {
    router: snapshot.router,
    caseName: snapshot.caseName,
    serverLabel: snapshot.serverLabel,
    hydratedLabel: snapshot.hydratedLabel,
    hydrationMismatch: snapshot.hydrationMismatch,
    hydrationWarningCount: snapshot.hydrationWarningCount,
    hydrationMessages: snapshot.hydrationMessages,
    metadata: snapshot.metadata,
    serverActionResult: snapshot.serverActionResult,
    serverActionDiagnostic: snapshot.serverActionDiagnostic,
    storage: snapshot.storage,
    fingerprint: snapshot.fingerprint,
    serverSemanticHash: snapshot.serverSemanticHash,
    routePolicy: snapshot.browser.networkPolicy,
  };
}

async function verifyCaseReset(driver, router) {
  await driver.reset({ router, caseName: "stable" });
  if (router === "app") await driver.submitAppServerAction("Reset probe");
  else await driver.attemptPagesServerAction();
  await driver.page.evaluate(() => {
    localStorage.setItem("case-leak", "local");
    sessionStorage.setItem("case-leak", "session");
  });
  const dirty = await driver.snapshot();
  assert.equal(dirty.storage.local["case-leak"], "local");
  await driver.reset({ router, caseName: "stable" });
  const clean = await driver.snapshot();
  assert.deepEqual(clean.storage, { local: {}, session: {} });
  if (router === "app") {
    assert.equal(JSON.parse(clean.serverActionResult).sequence, 0);
  } else {
    assert.equal(JSON.parse(clean.serverActionDiagnostic).attempts, 0);
  }
  return { dirtyContext: dirty.browser.contextSequence, cleanContext: clean.browser.contextSequence };
}

function writeArtifacts(stable) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(stable, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "next-ssr-hydration",
    routers: stable.routers,
    cases: stable.cases,
    failures: stable.failures,
    diagnostics: stable.diagnostics,
    semanticHash: stable.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.dot"),
    'digraph next_hydration { app_stable -> app_mismatch [label="case"]; pages_stable -> pages_mismatch [label="case"]; }\n',
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180"><rect width="100%" height="100%" fill="white"/><text x="24" y="40">Next.js SSR and hydration</text><text x="24" y="78">App Router + Pages Router / stable + mismatch</text><text x="24" y="116">${stable.failures.length} hydration failures / descriptor-only Server Action</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Next SSR hydration Atlas</title><body><h1>Next SSR hydration</h1><pre>${JSON.stringify(atlas, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

const driver = new NextSsrHydrationDriver();
try {
  const cases = [];
  const failures = [];
  const diagnostics = [];

  for (const router of ["app", "pages"]) {
    const stable = await driver.reset({ router, caseName: "stable" });
    assert.equal(stable.hydrationMismatch, false);
    assert.equal(stable.hydrationWarningCount, 0);
    assert.equal(stable.serverLabel, stable.hydratedLabel);
    cases.push(stableSnapshot(stable));

    if (router === "app") {
      const action = await driver.submitAppServerAction("Updated");
      const result = JSON.parse(action.serverActionResult);
      assert.deepEqual(result, {
        status: "described",
        sequence: 1,
        title: "Updated",
        effect: {
          kind: "server-action",
          policy: "descriptor-only",
          externalMutation: false,
        },
      });
      diagnostics.push({
        kind: "server_action_boundary",
        router,
        policy: result.effect.policy,
        externalMutation: result.effect.externalMutation,
      });
      const denied = await driver.attemptExternalNetwork();
      const blocked = denied.routes.filter((entry) => entry.decision === "abort");
      assert.ok(blocked.some((entry) => entry.url === "https://blocked.invalid/next-fixture"));
      diagnostics.push({
        kind: "network_boundary",
        policy: "loopback-fixture-only",
        blockedRoutes: blocked.length,
      });
    } else {
      const unsupported = await driver.attemptPagesServerAction();
      const result = JSON.parse(unsupported.serverActionDiagnostic);
      assert.deepEqual(result, {
        kind: "unsupported_effect",
        effect: "server-action",
        router: "pages",
        attempts: 1,
      });
      assert.ok(unsupported.console.some((entry) =>
        entry.message === "unsupported_effect:pages-router-server-action",
      ));
      diagnostics.push(result);
    }

    const mismatchOne = await driver.reset({ router, caseName: "mismatch" });
    assert.equal(mismatchOne.hydrationMismatch, true);
    assert.ok(mismatchOne.hydrationWarningCount >= 1);
    assert.notEqual(mismatchOne.serverLabel, mismatchOne.hydratedLabel);
    const failureOne = driver.buildHydrationFailure(mismatchOne);

    const mismatchTwo = await driver.reset({ router, caseName: "mismatch" });
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
  }

  const resets = {
    app: await verifyCaseReset(driver, "app"),
    pages: await verifyCaseReset(driver, "pages"),
  };
  assert.ok(resets.app.cleanContext > resets.app.dirtyContext);
  assert.ok(resets.pages.cleanContext > resets.pages.dirtyContext);

  const packageJson = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const stable = {
    ok: true,
    runtime: "next-ssr-hydration",
    versions: {
      next: packageJson.dependencies.next,
      react: packageJson.dependencies.react,
      reactDom: packageJson.dependencies["react-dom"],
      playwright: packageJson.dependencies.playwright,
    },
    routers: ["app", "pages"],
    casePolicy: {
      freshBrowserContext: true,
      serviceWorkers: "block",
      network: "loopback-fixture-only",
      externalEffects: "deny-or-descriptor",
      readiness: "explicit-main-data-ready",
    },
    cases,
    failures,
    diagnostics,
    resets,
  };
  stable.semanticHash = semanticHash(stable);
  writeArtifacts(stable);

  if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
    fs.writeFileSync(FIXTURE, `${JSON.stringify(stable, null, 2)}\n`);
  } else {
    assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stable);
  }
  console.log(JSON.stringify(stable));
} finally {
  await driver.dispose();
}
