#!/usr/bin/env node
const json = process.argv.slice(2).includes("--json");
const version = process.env.PROPED_PRODUCT_VERSION ?? "unknown";
const provenance = process.env.PROPED_PRODUCT_PROVENANCE ?? "dev";

function reportFailure(error) {
  const report = {
    ok: false,
    version,
    provenance,
    webRuntime: {
      dispatcher: { ready: true },
      node: { ready: true, version: process.version },
      managedBrowser: null,
      sandbox: null,
    },
    diagnostic: {
      code: "product_runtime_probe_failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
  if (json) console.log(JSON.stringify(report));
  else {
    console.log(`proped ${version} (${provenance})`);
    console.log(`node: ready (${process.version})`);
    console.log(`managed browser: unavailable (${report.diagnostic.message})`);
  }
  process.exit(2);
}

try {
  const [{ strictSandboxCapabilities }, { managedBrowserRuntimeReadiness }] = await Promise.all([
    import("../protocol/web-execution-sandbox.mjs"),
    import("../web/playwright-browser/managed-browser-runtime.mjs"),
  ]);
  const managedBrowser = managedBrowserRuntimeReadiness();
  const sandbox = strictSandboxCapabilities();
  const report = {
    ok: managedBrowser.executableReady,
    version,
    provenance,
    webRuntime: {
      dispatcher: { ready: true },
      node: { ready: true, version: process.version },
      managedBrowser,
      sandbox,
    },
  };

  if (json) console.log(JSON.stringify(report));
  else {
    console.log(`proped ${version} (${provenance})`);
    console.log(`node: ready (${process.version})`);
    console.log(
      `managed browser: ${managedBrowser.executableReady ? "ready" : "missing"} ` +
        `(Playwright ${managedBrowser.playwrightVersion}, Chromium ${managedBrowser.chromiumVersion})`,
    );
    console.log(
      `strict sandbox: ${sandbox.available ? `ready (${sandbox.backend})` : `unavailable (${sandbox.reason})`}`,
    );
  }

  process.exit(report.ok ? 0 : 2);
} catch (error) {
  reportFailure(error);
}
