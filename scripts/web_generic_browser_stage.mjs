#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { runGenericPropertyPacks } from "../protocol/web-generic-property-packs.mjs";

function usage(message) {
  const help = `Usage:\n  node scripts/web_generic_browser_stage.mjs --project-root <dir> --server-mode <static-output|command|external> [options]\n\nOptions:\n  --output-dir <dir>\n  --start-json <argv-json>\n  --url <url>\n  --headless <true|false>\n  --viewport <WIDTHxHEIGHT>\n  --locale <locale>\n  --timezone <timezone>\n  --readiness-timeout <ms>\n  --property-packs-json <json-array>\n`;
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(help);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) usage();
  const options = {
    projectRoot: null,
    serverMode: null,
    outputDir: null,
    start: null,
    url: null,
    headless: true,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezone: "UTC",
    readinessTimeoutMs: 30_000,
    propertyPacks: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--")) usage(`unexpected argument: ${key}`);
    if (!value || value.startsWith("--")) usage(`${key} requires a value`);
    index += 1;
    if (key === "--project-root") options.projectRoot = value;
    else if (key === "--server-mode") options.serverMode = value;
    else if (key === "--output-dir") options.outputDir = value;
    else if (key === "--start-json") options.start = JSON.parse(value);
    else if (key === "--url") options.url = value;
    else if (key === "--headless") options.headless = value === "true";
    else if (key === "--viewport") {
      const match = /^(\d+)x(\d+)$/.exec(value);
      if (!match) usage("--viewport must be WIDTHxHEIGHT");
      options.viewport = { width: Number(match[1]), height: Number(match[2]) };
    } else if (key === "--locale") options.locale = value;
    else if (key === "--timezone") options.timezone = value;
    else if (key === "--readiness-timeout") options.readinessTimeoutMs = Number(value);
    else if (key === "--property-packs-json") options.propertyPacks = JSON.parse(value);
    else usage(`unknown option: ${key}`);
  }
  if (!options.projectRoot) usage("--project-root is required");
  if (!["static-output", "command", "external"].includes(options.serverMode)) usage("--server-mode is invalid");
  if (options.serverMode === "static-output" && !options.outputDir) usage("static-output requires --output-dir");
  if (options.serverMode === "command" && (!Array.isArray(options.start) || options.start.length === 0)) usage("command mode requires --start-json");
  if (options.serverMode === "external" && !options.url) usage("external mode requires --url");
  if (!Number.isSafeInteger(options.readinessTimeoutMs) || options.readinessTimeoutMs < 1) usage("--readiness-timeout must be a positive integer");
  if (!Array.isArray(options.propertyPacks) || options.propertyPacks.some((pack) => typeof pack !== "string")) usage("--property-packs-json must be a string array");
  return options;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  })[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

async function startStaticServer(root) {
  const realRoot = fs.realpathSync(root);
  if (!fs.existsSync(path.join(realRoot, "index.html"))) throw new Error(`static output has no index.html: ${realRoot}`);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    let file = path.resolve(realRoot, `.${pathname}`);
    const relative = path.relative(realRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const exists = fs.existsSync(file) && fs.statSync(file).isFile();
    if (!exists && path.extname(pathname)) {
      response.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    if (!exists) file = path.join(realRoot, "index.html");
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    stop: () => new Promise((resolve) => server.close(resolve)),
    diagnostics: [],
  };
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function boundedAppend(current, chunk, maximum = 4096) {
  const next = `${current}${chunk}`;
  return next.length <= maximum ? next : next.slice(next.length - maximum);
}

async function startCommandServer(projectRoot, argv, timeoutMs) {
  const port = await reservePort();
  let stdoutTail = "";
  let stderrTail = "";
  const child = spawn(argv[0], argv.slice(1), {
    cwd: projectRoot,
    shell: false,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      NITRO_PORT: String(port),
      NITRO_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => { stdoutTail = boundedAppend(stdoutTail, chunk); });
  child.stderr?.on("data", (chunk) => { stderrTail = boundedAppend(stderrTail, chunk); });
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`server exited before readiness (${child.exitCode})\n${stderrTail}\n${stdoutTail}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        ready = true;
        break;
      }
    } catch {
      // Retry until bounded timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`server readiness timeout after ${timeoutMs}ms\n${stderrTail}\n${stdoutTail}`);
  const stop = async () => {
    if (child.exitCode !== null) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (child.exitCode === null) {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  };
  return { url, stop, diagnostics: [{ kind: "server-command", argv, port }] };
}

const options = parseArgs(process.argv.slice(2));
const projectRoot = fs.realpathSync(path.resolve(process.cwd(), options.projectRoot));
let server = null;
let driver = null;
try {
  if (options.serverMode === "static-output") server = await startStaticServer(path.resolve(projectRoot, options.outputDir));
  else if (options.serverMode === "command") server = await startCommandServer(projectRoot, options.start, options.readinessTimeoutMs);
  else server = { url: options.url, stop: async () => {}, diagnostics: [{ kind: "external-server" }] };

  driver = new GenericPlaywrightBrowserDriver({
    url: server.url,
    headless: options.headless,
    viewport: options.viewport,
    locale: options.locale,
    timezoneId: options.timezone,
    timeoutMs: Math.min(10_000, options.readinessTimeoutMs),
    quiescence: { timeoutMs: options.readinessTimeoutMs, stableSamples: 3, sampleIntervalMs: 25 },
  });
  const snapshot = await driver.reset();
  const inventory = await driver.actions();
  const propertyCampaign = await runGenericPropertyPacks(driver, {
    packs: options.propertyPacks,
    allowBoundedMutations: options.serverMode === "static-output",
    maxProbes: 12,
  });
  const riskCounts = inventory.actions.reduce((counts, action) => {
    counts[action.destructiveRisk] = (counts[action.destructiveRisk] ?? 0) + 1;
    return counts;
  }, {});
  const stateSemanticHash = semanticHash({
    dom: snapshot.dom,
    forms: snapshot.forms,
    focus: snapshot.focus,
    storage: snapshot.storage,
  });
  const result = {
    ok: propertyCampaign.ok,
    runtime: "generic-web-browser-stage",
    server: { mode: options.serverMode, url: server.url },
    browser: snapshot.browser,
    settle: snapshot.settle,
    actionCount: inventory.actions.length,
    diagnostics: inventory.diagnostics,
    metrics: { ...inventory.metrics, riskCounts },
    propertyPacks: options.propertyPacks,
    propertyCampaign,
    failures: propertyCampaign.failures,
    advisories: propertyCampaign.advisories,
    stateFingerprint: snapshot.fingerprint,
    stateSemanticHash,
  };
  result.semanticHash = semanticHash({
    runtime: result.runtime,
    server: { mode: result.server.mode, url: options.serverMode === "external" ? new URL(result.server.url).origin : "<managed-origin>" },
    browser: { ...result.browser, version: null, contextSequence: null },
    settle: result.settle ? { ...result.settle, elapsedMs: null, lastFingerprint: null } : null,
    actionSemanticHash: inventory.semanticHash,
    metrics: result.metrics,
    propertyPacks: result.propertyPacks,
    propertyCampaignSemanticHash: propertyCampaign.semanticHash,
    stateSemanticHash,
  });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, runtime: "generic-web-browser-stage", error: error.message }));
  process.exitCode = 2;
} finally {
  if (driver) await driver.dispose();
  if (server) await server.stop();
}
