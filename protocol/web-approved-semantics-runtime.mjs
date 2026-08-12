import { semanticHash } from "./ui-driver-v1.mjs";
import { validateWebServerHooks } from "./web-server-hooks.mjs";

export const WEB_APPROVED_SEMANTICS_RUNTIME_VERSION = "1";

const SUPPORTED_PROPERTIES = new Set(["saved-state-survives-reload"]);
const SUPPORTED_PROJECTIONS = new Set(["route-identity", "persistence-summary"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function approvedList(hints, kind) {
  return (hints?.approved ?? []).filter((item) => item.kind === kind && item.approvedByHuman === true && item.activation === "human-approved");
}

export function validateApprovedSemanticHints(hints) {
  if (hints === null) return null;
  if (!hints || hints.runtime !== "web-semantic-approved-hints" || hints.automaticActivation !== false || typeof hints.semanticHash !== "string") {
    throw new Error("approved semantic hints are invalid");
  }
  if (!Array.isArray(hints.approved)) throw new Error("approved semantic hints approved must be an array");
  for (const field of ["rejected", "deferred", "pending"]) {
    if (!Array.isArray(hints[field])) throw new Error(`approved semantic hints ${field} must be an array`);
  }
  const expectedHash = semanticHash({
    reviewSemanticHash: hints.reviewSemanticHash,
    approved: hints.approved,
    rejected: hints.rejected,
    deferred: hints.deferred,
    pending: hints.pending,
  });
  if (expectedHash !== hints.semanticHash) throw new Error("approved semantic hints semantic hash mismatch");
  for (const item of hints.approved) {
    if (!item || item.approvedByHuman !== true || item.activation !== "human-approved") throw new Error("semantic hint must be human-approved");
    if (!["property", "projection", "normalizer", "server-hook"].includes(item.kind)) throw new Error(`unsupported semantic hint kind: ${item.kind}`);
    if (typeof item.ref !== "string" || typeof item.id !== "string") throw new Error("semantic hint identity is invalid");
    if (item.kind === "normalizer" && (!item.normalizer || item.normalizer.action !== "replace" || typeof item.normalizer.path !== "string")) {
      throw new Error(`approved normalizer ${item.ref} has no concrete replacement rule`);
    }
    if (item.kind === "server-hook") {
      if (!item.serverHook || !["readOnly", "reset"].includes(item.serverHook.hookKind) || !item.serverHook.config) throw new Error(`approved server hook ${item.ref} is invalid`);
      if (item.serverHook.hookKind === "readOnly") validateWebServerHooks({ reset: null, readOnly: [item.serverHook.config] });
      else validateWebServerHooks({ reset: item.serverHook.config, readOnly: [] });
    }
  }
  return hints;
}

export function resolveApprovedSemanticRuntime(hints) {
  validateApprovedSemanticHints(hints);
  const properties = approvedList(hints, "property");
  const projections = approvedList(hints, "projection");
  const normalizers = approvedList(hints, "normalizer");
  const propertyPacks = [];
  const activeProperties = [];
  const diagnostics = [];
  for (const item of properties) {
    if (SUPPORTED_PROPERTIES.has(item.id)) {
      propertyPacks.push("reload-persistence");
      activeProperties.push(item);
    } else diagnostics.push({ kind: "approved_semantic_runtime_unsupported", ref: item.ref, semanticKind: item.kind, message: "approved property is preserved but has no generic runtime executor yet" });
  }
  const activeProjections = [];
  for (const item of projections) {
    if (SUPPORTED_PROJECTIONS.has(item.id)) activeProjections.push(item);
    else diagnostics.push({ kind: "approved_semantic_runtime_unsupported", ref: item.ref, semanticKind: item.kind, message: "approved projection is preserved but cannot be derived from generic browser state yet" });
  }
  const result = {
    version: WEB_APPROVED_SEMANTICS_RUNTIME_VERSION,
    approvedHintSemanticHash: hints?.semanticHash ?? null,
    propertyPacks: [...new Set(propertyPacks)].sort(),
    properties: activeProperties.map(clone),
    projections: activeProjections.map(clone),
    normalizers: normalizers.map((item) => clone(item.normalizer)),
    diagnostics,
  };
  return { ...result, semanticHash: semanticHash(result) };
}

function routeIdentity(urlValue) {
  const url = new URL(urlValue, "http://proped.invalid");
  return {
    pathname: url.pathname,
    queryKeys: [...new Set([...url.searchParams.keys()])].sort(),
    fragmentPresent: Boolean(url.hash),
  };
}

function persistenceSummary({ storage, indexedDB }) {
  return {
    localStorageKeys: Object.keys(storage?.local ?? {}).sort(),
    sessionStorageKeys: Object.keys(storage?.session ?? {}).sort(),
    databases: (indexedDB?.databases ?? []).map((database) => ({
      name: database.name,
      version: database.version,
      stores: (database.stores ?? []).map((store) => ({ name: store.name, count: store.count ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

export function projectApprovedSemanticState(runtime, { url, storage, indexedDB } = {}) {
  const output = {};
  for (const item of runtime?.projections ?? []) {
    if (item.id === "route-identity") output[item.id] = routeIdentity(url ?? "/");
    else if (item.id === "persistence-summary") output[item.id] = persistenceSummary({ storage, indexedDB });
  }
  return Object.keys(output).length ? output : null;
}

function parsePath(path) {
  if (typeof path !== "string" || !path.startsWith("$")) throw new Error(`normalizer path must start with $: ${path}`);
  const tokens = [];
  let index = 1;
  while (index < path.length) {
    if (path[index] === ".") {
      index += 1;
      const match = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(path.slice(index));
      if (!match) throw new Error(`unsupported normalizer path: ${path}`);
      tokens.push(match[0]);
      index += match[0].length;
    } else if (path[index] === "[") {
      const end = path.indexOf("]", index);
      if (end < 0) throw new Error(`unterminated normalizer path: ${path}`);
      const body = path.slice(index + 1, end);
      if (/^\d+$/.test(body)) tokens.push(Number(body));
      else if (/^".*"$/.test(body)) tokens.push(JSON.parse(body));
      else throw new Error(`unsupported normalizer path segment: ${body}`);
      index = end + 1;
    } else throw new Error(`unsupported normalizer path: ${path}`);
  }
  return tokens;
}

function replaceAtPath(root, path, replacement) {
  const tokens = parsePath(path);
  if (tokens.length === 0) return replacement;
  let current = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (current == null || typeof current !== "object" || !(token in current)) return root;
    current = current[token];
  }
  const leaf = tokens.at(-1);
  if (current != null && typeof current === "object" && leaf in current) current[leaf] = replacement;
  return root;
}

export function applyApprovedSemanticNormalizers(value, runtime) {
  let output = clone(value);
  for (const rule of runtime?.normalizers ?? []) output = replaceAtPath(output, rule.path, rule.replacement);
  return output;
}

export function applyApprovedServerHooks(existing, hints) {
  validateApprovedSemanticHints(hints);
  const base = validateWebServerHooks(existing ?? { reset: null, readOnly: [] });
  let reset = base.reset;
  const readOnly = new Map(base.readOnly.map((hook) => [hook.id, hook]));
  for (const item of approvedList(hints, "server-hook")) {
    const proposal = item.serverHook;
    if (proposal.hookKind === "readOnly") {
      const hook = validateWebServerHooks({ reset: null, readOnly: [proposal.config] }).readOnly[0];
      const previous = readOnly.get(hook.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(hook)) throw new Error(`approved read-only server hook conflicts with existing id ${hook.id}`);
      readOnly.set(hook.id, hook);
    } else {
      const hook = validateWebServerHooks({ reset: proposal.config, readOnly: [] }).reset;
      if (reset && JSON.stringify(reset) !== JSON.stringify(hook)) throw new Error("multiple conflicting reset server hooks were approved");
      reset = hook;
    }
  }
  return validateWebServerHooks({ reset, readOnly: [...readOnly.values()].sort((a, b) => a.id.localeCompare(b.id)) });
}
