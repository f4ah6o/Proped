import { collectWebSemanticSignals } from "./web-semantic-property-candidates.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SERVER_HOOK_CANDIDATES_VERSION = "1";

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function sourceEvidence(record, index, excerpt, origin) {
  return { kind: "source", path: record.path, line: lineNumber(record.text, index), excerpt: excerpt.replace(/\s+/g, " ").trim().slice(0, 220), origin };
}

function safePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("${") || /(^|\/)[:*][^/]+/.test(value)) return null;
  try {
    const parsed = new URL(value, "http://proped.invalid");
    if (parsed.origin !== "http://proped.invalid") return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function methodFromOptions(options) {
  if (!options) return "GET";
  const match = /\bmethod\s*:\s*["'`](GET|HEAD|POST|PUT|PATCH|DELETE)["'`]/i.exec(options);
  return match ? match[1].toUpperCase() : "GET";
}

function observations(signals) {
  const result = new Map();
  const add = (method, path, evidence) => {
    const key = `${method} ${path}`;
    const current = result.get(key) ?? { method, path, evidence: [] };
    const evidenceKey = `${evidence.path}:${evidence.line}:${evidence.origin}:${evidence.excerpt}`;
    if (!current.evidence.some((item) => `${item.path}:${item.line}:${item.origin}:${item.excerpt}` === evidenceKey)) current.evidence.push(evidence);
    result.set(key, current);
  };
  const fetchPattern = /\bfetch\s*\(\s*(["'`])([^"'`]{1,200})\1\s*(?:,\s*\{([\s\S]{0,600}?)\})?/g;
  const routePattern = /\b(?:app|router)\.(get|head|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]{1,200})\2/gi;
  for (const record of signals.sourceRecords ?? []) {
    for (const match of record.text.matchAll(fetchPattern)) {
      const path = safePath(match[2]);
      if (!path) continue;
      const method = methodFromOptions(match[3]);
      add(method, path, sourceEvidence(record, match.index ?? 0, match[0], "client-fetch"));
    }
    for (const match of record.text.matchAll(routePattern)) {
      const path = safePath(match[3]);
      if (!path) continue;
      add(match[1].toUpperCase(), path, sourceEvidence(record, match.index ?? 0, match[0], "server-route"));
    }
  }
  return [...result.values()];
}

function slug(value) {
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
  return compact || "root";
}

function hookId(prefix, method, path) {
  return `${prefix}-${slug(path)}-${semanticHash({ method, path }).slice(0, 8)}`;
}

function isResetPath(path) {
  return /(?:^|\/)(?:reset|reseed|test-reset|reset-test|restore-defaults|clear-test-data)(?:\/|$)/i.test(path);
}

export function proposeWebServerHookCandidates(signals) {
  const candidates = [];
  for (const observation of observations(signals)) {
    const origins = new Set(observation.evidence.map((item) => item.origin));
    const corroborated = origins.has("client-fetch") && origins.has("server-route");
    if (["GET", "HEAD"].includes(observation.method)) {
      const id = hookId("read-only", observation.method, observation.path);
      const confidence = corroborated ? 0.96 : origins.has("client-fetch") ? 0.85 : 0.75;
      candidates.push({
        id,
        title: `Observe ${observation.method} ${observation.path} as bounded server state`,
        status: "review-only",
        confidence,
        semanticRisk: "low",
        recommendedDecision: "approve-only-if-endpoint-is-side-effect-free",
        evidence: observation.evidence,
        automaticActivation: false,
        proposedHook: {
          hookKind: "readOnly",
          config: { id, method: observation.method, path: observation.path, expectedStatus: [200], timeoutMs: 5000, maxBytes: 65536 },
        },
      });
      continue;
    }
    if (observation.method === "POST" && isResetPath(observation.path)) {
      const id = hookId("reset", observation.method, observation.path);
      candidates.push({
        id,
        title: `Reset server fixture through POST ${observation.path}`,
        status: "review-only",
        confidence: corroborated ? 0.9 : 0.72,
        semanticRisk: "high",
        recommendedDecision: "approve-only-for-dedicated-test-reset-endpoint",
        evidence: observation.evidence,
        automaticActivation: false,
        proposedHook: {
          hookKind: "reset",
          config: { method: "POST", path: observation.path, expectedStatus: [200, 204], timeoutMs: 5000 },
        },
      });
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  const report = {
    ok: true,
    runtime: "web-server-hook-candidates",
    version: WEB_SERVER_HOOK_CANDIDATES_VERSION,
    scan: signals.scan,
    candidateCount: candidates.length,
    readOnlyCount: candidates.filter((candidate) => candidate.proposedHook.hookKind === "readOnly").length,
    resetCount: candidates.filter((candidate) => candidate.proposedHook.hookKind === "reset").length,
    candidates,
    automaticActivationCount: 0,
  };
  report.semanticHash = semanticHash({
    version: report.version,
    candidateCount: report.candidateCount,
    candidates: candidates.map(({ id, status, confidence, semanticRisk, recommendedDecision, automaticActivation, proposedHook }) => ({ id, status, confidence, semanticRisk, recommendedDecision, automaticActivation, proposedHook })),
  });
  return report;
}

export function analyzeWebServerHookCandidates(root, options = {}) {
  return proposeWebServerHookCandidates(collectWebSemanticSignals(root, options));
}
