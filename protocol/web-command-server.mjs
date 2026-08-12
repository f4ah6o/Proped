import net from "node:net";
import { spawn } from "node:child_process";
import { safeExecutionEnvironment } from "./web-execution-sandbox.mjs";

export const WEB_COMMAND_SERVER_VERSION = "2";

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function boundedAppend(current, chunk, maximum = 8192) {
  const next = `${current}${chunk}`;
  return next.length <= maximum ? next : next.slice(next.length - maximum);
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

export function extractLoopbackServerUrls(text) {
  const urls = [];
  const seen = new Set();
  const pattern = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[^\s"'<>]*)?/gi;
  for (const match of String(text ?? "").matchAll(pattern)) {
    try {
      const url = new URL(match[0].replace(/[),.;]+$/, ""));
      if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) continue;
      if (url.username || url.password) continue;
      url.hash = "";
      const normalized = url.href;
      if (!seen.has(normalized)) { seen.add(normalized); urls.push(normalized); }
    } catch {
      // Ignore malformed log fragments.
    }
  }
  return urls;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch {}
  }
  await delay(100);
  if (child.exitCode === null) {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try { child.kill("SIGKILL"); } catch {}
    }
  }
}

function candidateRecord(url, source) {
  return { url, source };
}

async function startReadyChild(projectRoot, argv, timeoutMs, { fetchImpl, requestedPort }) {
  let stdoutTail = "";
  let stderrTail = "";
  const candidates = new Map();
  const addCandidate = (url, source) => {
    if (!candidates.has(url)) candidates.set(url, candidateRecord(url, source));
  };
  const requestedUrl = `http://127.0.0.1:${requestedPort}/`;
  addCandidate(requestedUrl, "reserved-port");
  const safeEnv = safeExecutionEnvironment(process.env);
  const child = spawn(argv[0], argv.slice(1), {
    cwd: projectRoot,
    shell: false,
    detached: process.platform !== "win32",
    env: {
      ...safeEnv,
      PORT: String(requestedPort),
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      NITRO_PORT: String(requestedPort),
      NITRO_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ingest = (kind, chunk) => {
    const text = String(chunk);
    if (kind === "stdout") stdoutTail = boundedAppend(stdoutTail, text);
    else stderrTail = boundedAppend(stderrTail, text);
    const tail = kind === "stdout" ? stdoutTail : stderrTail;
    for (const url of extractLoopbackServerUrls(tail)) addCandidate(url, kind);
  };
  child.stdout?.on("data", (chunk) => ingest("stdout", chunk));
  child.stderr?.on("data", (chunk) => ingest("stderr", chunk));
  const started = Date.now();
  let selected = null;
  try {
    while (Date.now() - started < timeoutMs) {
      if (child.exitCode !== null) throw new Error(`server exited before readiness (${child.exitCode})\n${stderrTail}\n${stdoutTail}`);
      for (const candidate of candidates.values()) {
        try {
          const response = await fetchImpl(candidate.url, { redirect: "manual", credentials: "omit", cache: "no-store" });
          if (response.status < 500) {
            selected = candidate;
            break;
          }
        } catch {
          // Try other discovered loopback endpoints until bounded timeout.
        }
      }
      if (selected) break;
      await delay(100);
    }
    if (!selected) throw new Error(`server readiness timeout after ${timeoutMs}ms\n${stderrTail}\n${stdoutTail}`);
  } catch (error) {
    await stopChild(child);
    throw error;
  }
  return {
    child,
    url: selected.url,
    diagnostic: {
      kind: "server-command",
      argv,
      requestedPort,
      selectedUrlSource: selected.source,
      discoveredLoopbackUrls: [...candidates.values()].map((candidate) => ({ url: candidate.url, source: candidate.source })),
      credentialEnvironment: "environment-allowlist-deny",
    },
  };
}

export async function startWebCommandServer(projectRoot, argv, timeoutMs, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== "string" || !part)) throw new Error("command server requires non-empty argv");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("command server timeout must be a positive integer");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("command server requires fetch");
  const requestedPort = options.requestedPort ?? await reservePort();
  const diagnostics = [];
  let generation = 0;
  let current = await startReadyChild(projectRoot, argv, timeoutMs, { fetchImpl, requestedPort });
  generation += 1;
  diagnostics.push({ ...current.diagnostic, generation });

  return {
    get url() { return current.url; },
    get generation() { return generation; },
    diagnostics,
    stop: async () => stopChild(current.child),
    restart: async () => {
      const previousUrl = current.url;
      await stopChild(current.child);
      current = await startReadyChild(projectRoot, argv, timeoutMs, { fetchImpl, requestedPort });
      generation += 1;
      diagnostics.push({ ...current.diagnostic, kind: "server-command-restart", generation, previousUrl, stableOrigin: new URL(previousUrl).origin === new URL(current.url).origin });
      return { url: current.url, generation };
    },
  };
}
