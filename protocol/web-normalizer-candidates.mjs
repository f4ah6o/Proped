import { semanticHash } from "./ui-driver-v1.mjs";
import { collectWebSemanticSignals } from "./web-semantic-property-candidates.mjs";

export const WEB_NORMALIZER_CANDIDATES_VERSION = "1";

function sourceCorroboration(signals, kind) {
  const patterns = {
    "generated-id": /\b(useId|randomUUID|uuid|nanoid|uniqueId|generatedId|crypto\.getRandomValues)\b/i,
    "generated-token": /\b(randomUUID|uuid|nanoid|token|crypto\.getRandomValues)\b/i,
    timestamp: /\b(Date\.now|new\s+Date|performance\.now|timestamp|createdAt|updatedAt)\b/i,
  };
  const pattern = patterns[kind];
  if (!pattern) return [];
  const evidence = [];
  for (const record of signals.sourceRecords) {
    const match = pattern.exec(record.text);
    if (!match) continue;
    const line = 1 + record.text.slice(0, match.index).split("\n").length - 1;
    evidence.push({ kind: "source", path: record.path, line, excerpt: match[0] });
    if (evidence.length >= 8) break;
  }
  return evidence;
}

function decision(candidate, corroboration) {
  const stateBearing = candidate.candidateSafety === "review-required" || /\.storage\.|\.forms\[|\.applicationState|\.indexedDB/i.test(candidate.path);
  if (stateBearing) {
    return {
      semanticRisk: "high",
      recommendedDecision: "review-semantic-state",
      reason: "state-bearing volatility may encode real user or domain state and must not be normalized automatically",
      proposedRule: null,
    };
  }
  if (candidate.candidateSafety === "likely-noise" && candidate.proposal) {
    return {
      semanticRisk: corroboration.length ? "low" : "medium",
      recommendedDecision: "review-replacement",
      reason: corroboration.length
        ? "fresh-run volatility is corroborated by source-level generated-value evidence"
        : "fresh-run volatility matches a built-in generated-value classifier but lacks source corroboration",
      proposedRule: { ...candidate.proposal },
    };
  }
  return {
    semanticRisk: "medium",
    recommendedDecision: "keep-observed-until-reviewed",
    reason: "the candidate is volatile but does not have enough evidence for a safe replacement rule",
    proposedRule: null,
  };
}

export function explainWebNormalizerCandidates(volatility, signals = { sourceRecords: [] }) {
  if (!volatility?.ok || !Array.isArray(volatility.candidates)) throw new Error("normalizer candidates require a successful volatility report");
  const candidates = volatility.candidates.map((candidate) => {
    const corroboration = sourceCorroboration(signals, candidate.kind);
    const recommendation = decision(candidate, corroboration);
    const confidenceBoost = recommendation.semanticRisk === "low" && corroboration.length ? 0.04 : 0;
    const confidence = Math.min(0.99, candidate.confidence + confidenceBoost);
    const runtimeEvidence = {
      kind: "fresh-run-volatility",
      path: candidate.path,
      volatilityKind: candidate.kind,
      observedRuns: candidate.observedRuns,
      distinctValueCount: candidate.distinctValueCount,
      missingRunCount: candidate.missingRunCount,
      originalSafety: candidate.candidateSafety,
    };
    return {
      id: `${candidate.kind}:${candidate.path}`,
      path: candidate.path,
      kind: candidate.kind,
      status: "review-only",
      confidence: Number(confidence.toFixed(2)),
      semanticRisk: recommendation.semanticRisk,
      recommendedDecision: recommendation.recommendedDecision,
      explanation: recommendation.reason,
      evidenceKinds: [...new Set(["fresh-run-volatility", ...corroboration.map((item) => item.kind)])].sort(),
      evidence: [runtimeEvidence, ...corroboration],
      proposedRule: recommendation.proposedRule,
      automaticActivation: false,
      applied: false,
    };
  }).sort((a, b) => {
    const riskOrder = { low: 0, medium: 1, high: 2 };
    if (riskOrder[a.semanticRisk] !== riskOrder[b.semanticRisk]) return riskOrder[a.semanticRisk] - riskOrder[b.semanticRisk];
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  });
  const stable = candidates.map(({ id, path, kind, confidence, semanticRisk, recommendedDecision, evidenceKinds, proposedRule, automaticActivation, applied }) => ({
    id, path, kind, confidence, semanticRisk, recommendedDecision, evidenceKinds, proposedRule, automaticActivation, applied,
  }));
  return {
    ok: true,
    runtime: "web-normalizer-candidates",
    version: WEB_NORMALIZER_CANDIDATES_VERSION,
    candidateCount: candidates.length,
    replacementCandidateCount: candidates.filter((candidate) => candidate.proposedRule).length,
    highRiskCount: candidates.filter((candidate) => candidate.semanticRisk === "high").length,
    candidates,
    automaticActivationCount: 0,
    appliedCount: 0,
    semanticHash: semanticHash(stable),
  };
}

export function analyzeWebNormalizerCandidates(root, volatility, options = {}) {
  const signals = collectWebSemanticSignals(root, options);
  return explainWebNormalizerCandidates(volatility, signals);
}
