#!/usr/bin/env node
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";

const HELP = `Usage:\n  node scripts/web_browser_inventory.mjs <url> [--json]\n\nConnect to an already-running Web app, discover generic actions, and capture a semantic snapshot.\nExternal network is denied by default; the target origin is allowed.\n`;

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(HELP);
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) usage();
const json = argv.includes("--json");
const positionals = argv.filter((arg) => !arg.startsWith("--"));
const unknown = argv.filter((arg) => arg.startsWith("--") && arg !== "--json");
if (unknown.length) usage(`unknown option: ${unknown[0]}`);
if (positionals.length !== 1) usage("web browser inventory requires exactly one URL");

const driver = new GenericPlaywrightBrowserDriver({ url: positionals[0] });
try {
  const snapshot = await driver.reset();
  const inventory = await driver.actions();
  const result = {
    ok: true,
    command: "web browser inventory",
    url: positionals[0],
    browser: snapshot.browser,
    snapshot: {
      fingerprint: snapshot.fingerprint,
      url: snapshot.url,
      forms: snapshot.forms,
      focus: snapshot.focus,
      storage: snapshot.storage,
    },
    actions: inventory.actions,
    diagnostics: inventory.diagnostics,
    metrics: inventory.metrics,
  };
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`actions: ${result.actions.length}`);
    console.log(`locator uniqueness: ${(result.metrics.locatorUniqueness * 100).toFixed(1)}%`);
    for (const action of result.actions.slice(0, 40)) console.log(`${action.id} [${action.locator.strategy} ${(action.locator.confidence * 100).toFixed(0)}%]`);
    if (result.diagnostics.length) console.log(`diagnostics: ${result.diagnostics.length}`);
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "browser_inventory_failed", message: error.message }));
  process.exitCode = 2;
} finally {
  await driver.dispose();
}
