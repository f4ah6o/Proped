import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const managedJsRoot = process.env.PROPED_JS_RUNTIME_ROOT ?? null;
const require = managedJsRoot
  ? createRequire(path.join(managedJsRoot, "package.json"))
  : createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
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
const WEBKIT = BROWSERS.browsers.find((browser) => browser.name === "webkit");

if (!CHROMIUM) throw new Error("managed browser runtime: chromium metadata is missing");

export function managedBrowserRuntimeDetails({ includePaths = false, engine = "chromium" } = {}) {
  if (!["chromium", "webkit"].includes(engine)) throw new Error(`unsupported managed browser engine: ${engine}`);
  const details = engine === "chromium" ? {
    provider: "proped",
    ownership: "managed",
    targetProjectDependencyRequired: false,
    playwrightVersion: PLAYWRIGHT_PACKAGE.version,
    browser: "chromium",
    chromiumRevision: CHROMIUM.revision,
    chromiumVersion: CHROMIUM.browserVersion,
    headlessShellRevision: HEADLESS_SHELL?.revision ?? null,
    headlessShellVersion: HEADLESS_SHELL?.browserVersion ?? null,
  } : {
    provider: "proped",
    ownership: "managed",
    targetProjectDependencyRequired: false,
    playwrightVersion: PLAYWRIGHT_PACKAGE.version,
    browser: "webkit",
    webkitRevision: WEBKIT?.revision ?? null,
    webkitVersion: WEBKIT?.browserVersion ?? null,
  };
  if (includePaths) {
    details.playwrightPackageRoot = PLAYWRIGHT_PACKAGE_ROOT;
    details.playwrightCoreRoot = PLAYWRIGHT_CORE_ROOT;
    details.browsersFile = BROWSERS_FILE;
    details.jsRuntimeRoot = managedJsRoot;
  }
  return details;
}

export async function managedBrowserRuntimeReadiness({ engine = "chromium" } = {}) {
  const launcher = engine === "chromium" ? chromium : engine === "webkit" ? webkit : null;
  if (!launcher) throw new Error(`unsupported managed browser engine: ${engine}`);
  try {
    const browser = await launcher.launch({ headless: true });
    await browser.close();
    return {
      ...managedBrowserRuntimeDetails({ engine }),
      executableReady: true,
    };
  } catch {
    return {
      ...managedBrowserRuntimeDetails({ engine }),
      executableReady: false,
      diagnostic: engine === "chromium" ? "managed_chromium_launch_failed" : "managed_webkit_launch_failed",
    };
  }
}

export async function launchManagedChromium(options = {}) {
  return chromium.launch(options);
}

export async function launchManagedBrowser(engine = "chromium", options = {}) {
  if (engine === "chromium") return chromium.launch(options);
  if (engine === "webkit") return webkit.launch(options);
  throw new Error(`unsupported managed browser engine: ${engine}`);
}
