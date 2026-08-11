import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_FAILURE_CLASSIFIER_VERSION = "1";

function baseCode(failure) {
  return failure?.code ?? failure?.property ?? failure?.failureClass ?? "unknown_failure";
}

function normalizeGenerated(value) {
  return String(value ?? "")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<token>")
    .replace(/\b(?:request|req|job|trace|generation)-?\d+\b/gi, "<runtime-id>")
    .replace(/(^|[|:/])\d{2,}(?=($|[|:/]))/g, "$1<id>");
}

function normalizeAction(action) {
  const raw = typeof action === "string" ? action : action?.id ?? JSON.stringify(action ?? null);
  return normalizeGenerated(raw)
    .replace(/input=(?:"(?:[^"\\]|\\.)*"|[^|]+)/g, "input=<value>")
    .replace(/generation=\d+/g, "generation=<id>");
}

function evidencePaths(value, base = "$") {
  if (value == null || typeof value !== "object") return [base];
  if (Array.isArray(value)) {
    if (value.length === 0) return [base];
    return [...new Set(value.flatMap((item) => evidencePaths(item, `${base}[]`)))].sort();
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return [base];
  return [...new Set(keys.flatMap((key) => evidencePaths(value[key], `${base}.${key}`)))].sort();
}

function routeCandidate(failure) {
  return failure?.route
    ?? failure?.url
    ?? failure?.evidence?.route
    ?? failure?.evidence?.url
    ?? null;
}

function routeFamily(value) {
  if (!value) return null;
  try {
    const url = new URL(value, "http://proped.invalid");
    const pathname = url.pathname
      .split("/")
      .map((segment) => {
        if (/^\d+$/.test(segment)) return ":id";
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
        if (/^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment)) return ":id";
        return normalizeGenerated(segment);
      })
      .join("/");
    const keys = [...url.searchParams.keys()].sort();
    return `${pathname}${keys.length ? `?${keys.map((key) => `${key}=:value`).join("&")}` : ""}${url.hash ? "#<fragment>" : ""}`;
  } catch {
    return normalizeGenerated(value);
  }
}

function exceptionKind(failure) {
  const sources = [];
  if (Array.isArray(failure?.evidence?.errors)) sources.push(...failure.evidence.errors.map(String));
  if (typeof failure?.message === "string") sources.push(failure.message);
  for (const value of sources) {
    const match = /\b(AbortError|AggregateError|DOMException|EvalError|RangeError|ReferenceError|SyntaxError|TypeError|URIError|Error)\b/.exec(value);
    if (match) return match[1];
  }
  return null;
}

function oracleFamily(failure) {
  if (typeof failure?.oracleFamily === "string" && failure.oracleFamily) return failure.oracleFamily;
  if (typeof failure?.pack === "string" && failure.pack) return failure.pack;
  const code = baseCode(failure);
  if (/reload|persist/i.test(code)) return "reload-persistence";
  if (/uncaught|exception|crash/i.test(code)) return "browser-safety";
  if (/navigation|route|back|forward/i.test(code)) return "navigation";
  if (/undo|redo|reversible|order|selection/i.test(code)) return "reversible-actions";
  if (/stale|response|async|generation/i.test(code)) return "async-causality";
  if (/roundtrip|round_trip|import|export/i.test(code)) return "roundtrip";
  return "semantic-contract";
}

export function classifyWebFailure(failure) {
  const code = baseCode(failure);
  const semantic = {
    version: WEB_FAILURE_CLASSIFIER_VERSION,
    oracleFamily: oracleFamily(failure),
    baseCode: normalizeGenerated(code),
    actionPattern: (failure?.trace ?? []).map(normalizeAction),
    semanticDeltaPaths: evidencePaths(failure?.evidence ?? {
      expected: failure?.expected,
      actual: failure?.actual,
    }),
    routeFamily: routeFamily(routeCandidate(failure)),
    exceptionKind: exceptionKind(failure),
  };
  const hash = semanticHash(semantic);
  return {
    ...semantic,
    id: `${semantic.baseCode}@${hash.slice(0, 12)}`,
    semanticHash: hash,
  };
}

export function clusterWebFailures(failures = []) {
  const clusters = new Map();
  for (const failure of failures) {
    const classification = classifyWebFailure(failure);
    const current = clusters.get(classification.id) ?? {
      id: classification.id,
      classification,
      count: 0,
      originalCodes: [],
    };
    current.count += 1;
    const code = baseCode(failure);
    if (!current.originalCodes.includes(code)) current.originalCodes.push(code);
    clusters.set(classification.id, current);
  }
  const result = [...clusters.values()]
    .map((cluster) => ({ ...cluster, originalCodes: cluster.originalCodes.sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    classifierVersion: WEB_FAILURE_CLASSIFIER_VERSION,
    inputCount: failures.length,
    clusterCount: result.length,
    clusters: result,
    semanticHash: semanticHash(result.map((cluster) => ({
      id: cluster.id,
      count: cluster.count,
      originalCodes: cluster.originalCodes,
    }))),
  };
}
