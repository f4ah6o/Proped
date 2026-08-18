#!/usr/bin/env node
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import {
  CONTENT_BLIND_OPAQUE_PROFILE,
  OPAQUE_WEB_BROWSER_ENGINES,
  observeOpaqueWebReplayV1,
  validateOpaqueWebReplayV1,
} from "../protocol/opaque-web-replay-v1.mjs";
import { managedBrowserRuntimeReadiness } from "../web/playwright-browser/managed-browser-runtime.mjs";

const MAX_REPLAY_BYTES = 256 * 1024;

function fail(diagnostic, code = 2) {
  console.error(JSON.stringify({ ok: false, diagnostic }));
  process.exit(code);
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function parseArgs(argv) {
  if (argv.length < 1 || argv[0].startsWith("--")) fail("opaque_observe_invalid_arguments");
  let url;
  try {
    const parsed = new URL(argv[0]);
    if (!["http:", "https:"].includes(parsed.protocol) || !isLoopbackHostname(parsed.hostname) || parsed.username || parsed.password) throw new Error();
    url = parsed.href;
  } catch {
    fail("opaque_observe_invalid_arguments");
  }
  let profile = null;
  let engine = "webkit";
  let timeoutMs = 5_000;
  let attempts = 2;
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) fail("opaque_observe_invalid_arguments");
    if (key === "--profile") profile = value;
    else if (key === "--engine") engine = value;
    else if (key === "--timeout-ms") timeoutMs = Number(value);
    else if (key === "--attempts") attempts = Number(value);
    else fail("opaque_observe_invalid_arguments");
  }
  if (profile !== CONTENT_BLIND_OPAQUE_PROFILE || !OPAQUE_WEB_BROWSER_ENGINES.includes(engine)) fail("opaque_observe_invalid_arguments");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(attempts) || attempts < 2) fail("opaque_observe_invalid_arguments");
  return { url, engine, timeoutMs, attempts };
}

async function readReplay() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REPLAY_BYTES) fail("opaque_observe_replay_invalid");
    chunks.push(chunk);
  }
  try {
    return validateOpaqueWebReplayV1(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    fail("opaque_observe_replay_invalid");
  }
}

const options = parseArgs(process.argv.slice(2));
try {
  const readiness = await managedBrowserRuntimeReadiness({ engine: options.engine });
  if (!readiness.executableReady) fail("managed_browser_engine_unavailable", 1);
  const replay = await readReplay();
  const driver = new GenericPlaywrightBrowserDriver({
    url: options.url,
    profile: CONTENT_BLIND_OPAQUE_PROFILE,
    browserEngine: options.engine,
    timeoutMs: options.timeoutMs,
    quiescence: { timeoutMs: options.timeoutMs, stableSamples: 3, sampleIntervalMs: 25 },
  });
  try {
    const observed = await observeOpaqueWebReplayV1(driver, replay, { attempts: options.attempts });
    console.log(JSON.stringify(observed));
  } finally {
    await driver.dispose();
  }
} catch {
  fail("opaque_observe_failed");
}
