import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SERVER_HOOKS_VERSION = "1";

function fail(message) { throw new Error(`web server hooks: ${message}`); }
function relativePath(value, label) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) fail(`${label} must be a same-origin absolute path`);
  const url = new URL(value, "http://proped.invalid");
  if (url.origin !== "http://proped.invalid") fail(`${label} must not contain an origin`);
  return `${url.pathname}${url.search}`;
}
function expectedStatuses(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) {
    fail(`${label} must be a non-empty HTTP status array`);
  }
  return [...new Set(value)].sort((a, b) => a - b);
}
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
  return value;
}

export function validateWebServerHooks(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("config must be an object");
  const keys = Object.keys(config).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["readOnly", "reset"])) fail("config fields must be reset/readOnly only");
  let reset = null;
  if (config.reset !== null) {
    const hook = config.reset;
    if (!hook || typeof hook !== "object" || Array.isArray(hook)) fail("reset must be null or an object");
    const hookKeys = Object.keys(hook).sort();
    if (JSON.stringify(hookKeys) !== JSON.stringify(["expectedStatus", "method", "path", "timeoutMs"])) fail("reset fields are invalid");
    if (hook.method !== "POST") fail("reset.method must be POST");
    reset = {
      method: "POST",
      path: relativePath(hook.path, "reset.path"),
      expectedStatus: expectedStatuses(hook.expectedStatus, "reset.expectedStatus"),
      timeoutMs: positiveInteger(hook.timeoutMs, "reset.timeoutMs"),
    };
  }
  if (!Array.isArray(config.readOnly)) fail("readOnly must be an array");
  const ids = new Set();
  const readOnly = config.readOnly.map((hook, index) => {
    if (!hook || typeof hook !== "object" || Array.isArray(hook)) fail(`readOnly[${index}] must be an object`);
    const hookKeys = Object.keys(hook).sort();
    if (JSON.stringify(hookKeys) !== JSON.stringify(["expectedStatus", "id", "maxBytes", "method", "path", "timeoutMs"])) fail(`readOnly[${index}] fields are invalid`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(hook.id)) fail(`readOnly[${index}].id is invalid`);
    if (ids.has(hook.id)) fail(`duplicate readOnly id ${hook.id}`);
    ids.add(hook.id);
    if (!["GET", "HEAD"].includes(hook.method)) fail(`readOnly[${index}].method must be GET or HEAD`);
    return {
      id: hook.id,
      method: hook.method,
      path: relativePath(hook.path, `readOnly[${index}].path`),
      expectedStatus: expectedStatuses(hook.expectedStatus, `readOnly[${index}].expectedStatus`),
      timeoutMs: positiveInteger(hook.timeoutMs, `readOnly[${index}].timeoutMs`),
      maxBytes: positiveInteger(hook.maxBytes, `readOnly[${index}].maxBytes`),
    };
  });
  return { reset, readOnly };
}

async function fetchBounded(fetchImpl, url, init, { timeoutMs, maxBytes = 0 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "manual", credentials: "omit", cache: "no-store" });
    const location = response.headers.get("location");
    if (location) throw new Error(`redirect denied: ${location}`);
    if (init.method === "HEAD" || maxBytes === 0) return { response, body: "" };
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) throw new Error(`response exceeds maxBytes (${length} > ${maxBytes})`);
    const reader = response.body?.getReader();
    if (!reader) return { response, body: "" };
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error(`response exceeds maxBytes (${bytes} > ${maxBytes})`);
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return { response, body: new TextDecoder().decode(merged) };
  } finally {
    clearTimeout(timer);
  }
}

function jsonShape(value, depth = 0) {
  if (depth >= 6) return "<max-depth>";
  if (value === null) return "null";
  if (Array.isArray(value)) return { type: "array", length: value.length, items: value.length ? jsonShape(value[0], depth + 1) : null };
  if (typeof value === "object") return { type: "object", keys: Object.keys(value).sort(), fields: Object.fromEntries(Object.keys(value).sort().map((key) => [key, jsonShape(value[key], depth + 1)])) };
  return typeof value;
}

export function createWebServerHookClient(baseUrl, rawConfig, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") fail("fetch implementation is required");
  const config = validateWebServerHooks(rawConfig);
  const origin = new URL(baseUrl).origin;
  const resolve = (hook) => new URL(hook.path, `${origin}/`);
  async function invoke(hook, { capture = false } = {}) {
    const url = resolve(hook);
    if (url.origin !== origin) fail("hook escaped target origin");
    const { response, body } = await fetchBounded(fetchImpl, url, { method: hook.method, headers: { accept: "application/json" } }, { timeoutMs: hook.timeoutMs, maxBytes: capture ? hook.maxBytes : 0 });
    if (!hook.expectedStatus.includes(response.status)) throw new Error(`unexpected ${hook.id ?? "reset"} status ${response.status}`);
    return { response, body };
  }
  return {
    config,
    async reset() {
      if (!config.reset) return { configured: false, invoked: false };
      const { response } = await invoke(config.reset);
      return { configured: true, invoked: true, status: response.status };
    },
    async readOnlyState() {
      const hooks = [];
      for (const hook of config.readOnly) {
        const { response, body } = await invoke(hook, { capture: hook.method === "GET" });
        let shape = null;
        let bodyHash = null;
        if (hook.method === "GET" && body) {
          bodyHash = semanticHash(body);
          const contentType = response.headers.get("content-type") ?? "";
          if (/application\/json/i.test(contentType)) {
            try { shape = jsonShape(JSON.parse(body)); } catch { shape = { type: "invalid-json" }; }
          }
        }
        hooks.push({ id: hook.id, method: hook.method, path: hook.path, status: response.status, bodyHash, shape });
      }
      const state = { version: WEB_SERVER_HOOKS_VERSION, hooks };
      return { ...state, semanticHash: semanticHash(state) };
    },
  };
}
