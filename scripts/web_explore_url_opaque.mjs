#!/usr/bin/env node
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { exploreWebCoverageGuided } from "../protocol/web-coverage-guided-exploration.mjs";
import {
  CONTENT_BLIND_OPAQUE_PROFILE,
  OPAQUE_WEB_BROWSER_ENGINES,
  buildOpaqueWebReplayV1,
} from "../protocol/opaque-web-replay-v1.mjs";
import { managedBrowserRuntimeReadiness } from "../web/playwright-browser/managed-browser-runtime.mjs";
import { pathToFileURL } from "node:url";

function usage(message) {
  const help = `Usage:\n  node scripts/web_explore_url_opaque.mjs <loopback-url> --profile content-blind-opaque-v1 [options]\n\nOptions:\n  --engine <chromium|webkit>\n  --headless <true|false>\n  --timeout-ms <ms>\n  --max-states <n>\n  --max-transitions <n>\n  --max-depth <n>\n  --minimize-budget <n>\n  --fresh-replay-attempts <n>\n`;
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", diagnostic: "opaque_url_mode_invalid_arguments" }));
  else process.stdout.write(help);
  process.exit(message ? 2 : 0);
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function validateOpaqueLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("opaque URL mode requires an absolute URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("opaque URL mode requires HTTP(S)");
  if (!isLoopbackHostname(url.hostname)) throw new Error("opaque URL mode requires a loopback host");
  if (url.username || url.password) throw new Error("opaque URL mode does not accept URL credentials");
  return url.href;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) usage();
  if (argv[0].startsWith("--")) usage("loopback URL is required");
  let url;
  try {
    url = validateOpaqueLoopbackUrl(argv[0]);
  } catch {
    usage("invalid loopback URL");
  }
  const options = {
    url,
    profile: null,
    engine: "chromium",
    headless: true,
    timeoutMs: 5_000,
    maxStates: 16,
    maxTransitions: 32,
    maxDepth: 6,
    minimizeBudget: 128,
    freshReplayAttempts: 2,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) usage(`${key} requires a value`);
    index += 1;
    if (key === "--profile") options.profile = value;
    else if (key === "--engine") options.engine = value;
    else if (key === "--headless") {
      if (!["true", "false"].includes(value)) usage("--headless must be true or false");
      options.headless = value === "true";
    }
    else if (key === "--timeout-ms") options.timeoutMs = Number(value);
    else if (key === "--max-states") options.maxStates = Number(value);
    else if (key === "--max-transitions") options.maxTransitions = Number(value);
    else if (key === "--max-depth") options.maxDepth = Number(value);
    else if (key === "--minimize-budget") options.minimizeBudget = Number(value);
    else if (key === "--fresh-replay-attempts") options.freshReplayAttempts = Number(value);
    else usage(`unknown option: ${key}`);
  }
  if (options.profile !== CONTENT_BLIND_OPAQUE_PROFILE) usage(`--profile must be ${CONTENT_BLIND_OPAQUE_PROFILE}`);
  if (!OPAQUE_WEB_BROWSER_ENGINES.includes(options.engine)) usage("--engine is invalid");
  for (const key of ["timeoutMs", "maxStates", "maxTransitions", "maxDepth", "minimizeBudget"]) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1) usage(`${key} must be a positive integer`);
  }
  if (!Number.isSafeInteger(options.freshReplayAttempts) || options.freshReplayAttempts < 2) usage("fresh replay attempts must be at least 2");
  return options;
}

function selectTargetState(exploration) {
  return exploration.stateTraces
    .filter((state) => state.depth > 0 && Array.isArray(state.trace) && state.trace.length > 0)
    .sort((left, right) => {
      if (right.depth !== left.depth) return right.depth - left.depth;
      if (left.trace.length !== right.trace.length) return right.trace.length - left.trace.length;
      return JSON.stringify(left.trace).localeCompare(JSON.stringify(right.trace));
    })[0] ?? null;
}

export async function exploreOpaqueLoopbackUrl(options) {
  const readiness = await managedBrowserRuntimeReadiness({ engine: options.engine });
  if (!readiness.executableReady) {
    return { ok: false, diagnostic: "managed_browser_engine_unavailable", browserEngine: options.engine };
  }
  const driver = new GenericPlaywrightBrowserDriver({
    url: options.url,
    profile: CONTENT_BLIND_OPAQUE_PROFILE,
    browserEngine: options.engine,
    headless: options.headless,
    timeoutMs: options.timeoutMs,
    quiescence: { timeoutMs: options.timeoutMs, stableSamples: 3, sampleIntervalMs: 25 },
  });
  try {
    const exploration = await exploreWebCoverageGuided(driver, {
      maxStates: options.maxStates,
      maxTransitions: options.maxTransitions,
      maxDepth: options.maxDepth,
      actionFilter: (action) => action.portableAction === true,
    });
    const target = selectTargetState(exploration);
    if (!target) return { ok: false, diagnostic: "opaque_progressing_state_not_observed", browserEngine: options.engine };
    return await buildOpaqueWebReplayV1(driver, {
      trace: target.trace,
      targetFingerprint: target.fingerprint,
      targetEnvironmentStateId: target.environmentStateId ?? null,
      initialCheckpoint: exploration.checkpointProvenance ?? null,
      browserEngine: options.engine,
      budget: options.minimizeBudget,
      freshReplayAttempts: options.freshReplayAttempts,
    });
  } finally {
    await driver.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const result = await exploreOpaqueLoopbackUrl(options);
    console.log(JSON.stringify(result));
    if (result?.ok === false) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok: false, diagnostic: "opaque_url_exploration_failed", browserEngine: options.engine }));
    process.exitCode = 2;
  }
}
