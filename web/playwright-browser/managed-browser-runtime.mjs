import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_PACKAGE_FILE = require.resolve("playwright/package.json");
const PLAYWRIGHT_PACKAGE_ROOT = path.dirname(PLAYWRIGHT_PACKAGE_FILE);
const PLAYWRIGHT_PACKAGE = JSON.parse(fs.readFileSync(PLAYWRIGHT_PACKAGE_FILE, "utf8"));
const PACKAGE_NODE_MODULES = path.dirname(PLAYWRIGHT_PACKAGE_ROOT);
const PLAYWRIGHT_CORE_PACKAGE_FILE = path.join(PACKAGE_NODE_MODULES, "playwright-core", "package.json");
const PLAYWRIGHT_CORE_ROOT = path.dirname(fs.realpathSync(PLAYWRIGHT_CORE_PACKAGE_FILE));
const BROWSERS_FILE = path.join(PLAYWRIGHT_CORE_ROOT, "browsers.json");
const BROWSERS = JSON.parse(fs.readFileSync(BROWSERS_FILE, "utf8"));
const CHROMIUM = BROWSERS.browsers.find((browser) => browser.name === "chromium");
const HEADLESS_SHELL = BROWSERS.browsers.find((browser) => browser.name === "chromium-headless-shell");

if (!CHROMIUM) throw new Error("managed browser runtime: chromium metadata is missing");

export function managedBrowserRuntimeDetails({ includePaths = false } = {}) {
  const details = {
    provider: "proped-rabbita",
    ownership: "managed",
    targetProjectDependencyRequired: false,
    playwrightVersion: PLAYWRIGHT_PACKAGE.version,
    browser: "chromium",
    chromiumRevision: CHROMIUM.revision,
    chromiumVersion: CHROMIUM.browserVersion,
    headlessShellRevision: HEADLESS_SHELL?.revision ?? null,
    headlessShellVersion: HEADLESS_SHELL?.browserVersion ?? null,
  };
  if (includePaths) {
    details.playwrightPackageRoot = PLAYWRIGHT_PACKAGE_ROOT;
    details.playwrightCoreRoot = PLAYWRIGHT_CORE_ROOT;
    details.browsersFile = BROWSERS_FILE;
  }
  return details;
}

export async function managedBrowserRuntimeReadiness() {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return {
      ...managedBrowserRuntimeDetails(),
      executableReady: true,
    };
  } catch {
    return {
      ...managedBrowserRuntimeDetails(),
      executableReady: false,
      diagnostic: "managed_chromium_launch_failed",
    };
  }
}

export async function launchManagedChromium(options = {}) {
  return chromium.launch(options);
}
