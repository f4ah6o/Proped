import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SEMANTIC_REVIEW_REPORT_VERSION = "1";

export function confidenceBand(value) {
  if (value >= 0.9) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}

function bounded(value, limit = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function displayEvidence(item) {
  if (!item || typeof item !== "object") return { kind: "unknown", label: "unknown evidence" };
  if (item.kind === "source") return { kind: "source", label: `${item.path ?? "<source>"}${item.line ? `:${item.line}` : ""} ${bounded(item.excerpt)}`.trim() };
  if (item.kind === "test-title") return { kind: "test-title", label: `test: ${bounded(item.title)}` };
  if (item.kind === "ui-vocabulary") return { kind: "ui-vocabulary", label: `ui: ${bounded(item.label)}` };
  if (item.kind === "runtime-inspection") return { kind: "runtime-inspection", label: `runtime: ${bounded(item.detail)}` };
  if (item.kind === "fresh-run-volatility") {
    return { kind: "fresh-run-volatility", label: `volatility: ${item.path} · ${item.volatilityKind} · ${item.distinctValueCount}/${item.observedRuns} distinct` };
  }
  return { kind: item.kind ?? "unknown", label: bounded(JSON.stringify(item)) };
}

function normalizeCandidate(kind, candidate) {
  const evidence = (candidate.evidence ?? []).map(displayEvidence);
  const confidence = Number(candidate.confidence ?? 0);
  return {
    ref: `${kind}:${candidate.id}`,
    kind,
    id: candidate.id,
    title: candidate.title ?? candidate.explanation ?? candidate.id,
    status: candidate.status ?? "review-only",
    confidence,
    confidenceBand: confidenceBand(confidence),
    semanticRisk: candidate.semanticRisk ?? null,
    recommendedDecision: candidate.recommendedDecision ?? null,
    evidenceKinds: [...new Set(evidence.map((item) => item.kind))].sort(),
    evidence,
    automaticActivation: candidate.automaticActivation === true,
    proposedChange: kind === "property" ? candidate.suggestedPredicate ?? null : kind === "normalizer" ? candidate.proposedRule ?? null : kind === "projection" ? candidate.suggestedHook ?? null : kind === "server-hook" ? candidate.proposedHook ?? null : null,
  };
}

export function buildWebSemanticReviewReport({ properties, projections, normalizers = null, serverHooks = null } = {}) {
  const candidates = [
    ...(properties?.candidates ?? []).map((candidate) => normalizeCandidate("property", candidate)),
    ...(projections?.candidates ?? []).map((candidate) => normalizeCandidate("projection", candidate)),
    ...(normalizers?.candidates ?? []).map((candidate) => normalizeCandidate("normalizer", candidate)),
    ...(serverHooks?.candidates ?? []).map((candidate) => normalizeCandidate("server-hook", candidate)),
  ].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  });
  const refs = candidates.map((candidate) => candidate.ref);
  if (new Set(refs).size !== refs.length) throw new Error("semantic review candidate refs must be unique");
  const stable = candidates.map(({ ref, kind, id, status, confidence, confidenceBand, semanticRisk, recommendedDecision, evidenceKinds, automaticActivation, proposedChange }) => ({
    ref, kind, id, status, confidence, confidenceBand, semanticRisk, recommendedDecision, evidenceKinds, automaticActivation, proposedChange,
  }));
  return {
    ok: true,
    runtime: "web-semantic-review-report",
    version: WEB_SEMANTIC_REVIEW_REPORT_VERSION,
    candidateCount: candidates.length,
    counts: {
      property: candidates.filter((candidate) => candidate.kind === "property").length,
      projection: candidates.filter((candidate) => candidate.kind === "projection").length,
      normalizer: candidates.filter((candidate) => candidate.kind === "normalizer").length,
      serverHook: candidates.filter((candidate) => candidate.kind === "server-hook").length,
      highConfidence: candidates.filter((candidate) => candidate.confidenceBand === "high").length,
      mediumConfidence: candidates.filter((candidate) => candidate.confidenceBand === "medium").length,
      lowConfidence: candidates.filter((candidate) => candidate.confidenceBand === "low").length,
    },
    candidates,
    automaticActivationCount: candidates.filter((candidate) => candidate.automaticActivation).length,
    semanticHash: semanticHash(stable),
  };
}

export function formatWebSemanticReview(report) {
  const lines = [
    `Proped Web semantic review · ${report.candidateCount} candidates`,
    `property ${report.counts.property} · projection ${report.counts.projection} · normalizer ${report.counts.normalizer} · server-hook ${report.counts.serverHook}`,
    "",
  ];
  for (const candidate of report.candidates) {
    const meta = [candidate.kind, candidate.confidenceBand.toUpperCase(), candidate.confidence.toFixed(2), candidate.status];
    if (candidate.semanticRisk) meta.push(`risk=${candidate.semanticRisk}`);
    lines.push(`[${meta.join(" · ")}] ${candidate.ref}`);
    lines.push(`  ${candidate.title}`);
    if (candidate.recommendedDecision) lines.push(`  decision: ${candidate.recommendedDecision}`);
    lines.push(`  automatic activation: ${candidate.automaticActivation ? "yes" : "no"}`);
    if (candidate.evidence.length === 0) lines.push("  evidence: none");
    else {
      lines.push("  evidence:");
      for (const evidence of candidate.evidence) lines.push(`    - ${evidence.label}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
