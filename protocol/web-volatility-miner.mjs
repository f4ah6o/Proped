import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_VOLATILITY_MINER_VERSION = "1";
const MISSING = Symbol("missing");

function pathJoin(base, key, arrayIndex = false) {
  if (arrayIndex) return `${base}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key)) return `${base}.${key}`;
  return `${base}[${JSON.stringify(key)}]`;
}

function flatten(value, path = "$", output = new Map()) {
  if (value == null || typeof value !== "object") {
    output.set(path, value);
    return output;
  }
  if (Array.isArray(value)) {
    output.set(`${path}.__length`, value.length);
    value.forEach((item, index) => flatten(item, pathJoin(path, index, true), output));
    return output;
  }
  const keys = Object.keys(value).sort();
  output.set(`${path}.__keys`, keys);
  for (const key of keys) flatten(value[key], pathJoin(path, key), output);
  return output;
}

function canonicalLeaf(value) {
  if (value === MISSING) return "<missing>";
  return JSON.stringify(value);
}

function allStrings(values) {
  return values.every((value) => value === MISSING || typeof value === "string");
}

function presentStrings(values) {
  return values.filter((value) => typeof value === "string");
}

function looksTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
    || /^\d{10,13}$/.test(value);
}

function looksToken(value) {
  return /^[0-9a-f]{16,}$/i.test(value)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    || /^[A-Za-z0-9_-]{20,}$/.test(value);
}

function classify(path, values) {
  const strings = presentStrings(values);
  const pathLower = path.toLowerCase();
  const sensitiveState = pathLower.includes(".storage.")
    || pathLower.includes(".forms[")
    || pathLower.includes(".applicationstate")
    || pathLower.includes(".indexeddb");
  if (sensitiveState) {
    return {
      kind: "semantic-state-volatility",
      confidence: 0.35,
      candidateSafety: "review-required",
      suggestedReplacement: null,
      reason: "state-bearing paths are never proposed as automatic noise",
    };
  }
  if (pathLower.includes(".url")) {
    return {
      kind: "route-volatility",
      confidence: 0.45,
      candidateSafety: "review-required",
      suggestedReplacement: null,
      reason: "URL volatility may encode meaningful navigation state",
    };
  }
  if (pathLower.endsWith(".attributes.id") || pathLower.endsWith(".attributes.for")) {
    return {
      kind: "generated-id",
      confidence: 0.9,
      candidateSafety: "likely-noise",
      suggestedReplacement: "<generated-id>",
      reason: "DOM id/for values changed across no-action fresh contexts",
    };
  }
  if (allStrings(values) && strings.length > 0 && strings.every(looksTimestamp)) {
    return {
      kind: "timestamp",
      confidence: 0.98,
      candidateSafety: "likely-noise",
      suggestedReplacement: "<timestamp>",
      reason: "all observed values match timestamp-like formats",
    };
  }
  if (allStrings(values) && strings.length > 0 && strings.every(looksToken)) {
    return {
      kind: "generated-token",
      confidence: 0.92,
      candidateSafety: "likely-noise",
      suggestedReplacement: "<token>",
      reason: "all observed values match high-entropy token-like formats",
    };
  }
  if (pathLower.endsWith(".text") || pathLower.endsWith(".name")) {
    return {
      kind: "content-volatility",
      confidence: 0.3,
      candidateSafety: "review-required",
      suggestedReplacement: null,
      reason: "visible content changed across no-action fresh contexts",
    };
  }
  if (pathLower.endsWith(".__length") || pathLower.endsWith(".__keys")) {
    return {
      kind: "structural-volatility",
      confidence: 0.3,
      candidateSafety: "review-required",
      suggestedReplacement: null,
      reason: "object or array structure changed across no-action fresh contexts",
    };
  }
  return {
    kind: "scalar-volatility",
    confidence: 0.4,
    candidateSafety: "review-required",
    suggestedReplacement: null,
    reason: "scalar value changed across no-action fresh contexts",
  };
}

export function mineVolatility(samples, { minimumRuns = 2 } = {}) {
  if (!Array.isArray(samples) || samples.length < minimumRuns) {
    throw new Error(`volatility mining requires at least ${minimumRuns} samples`);
  }
  const flattened = samples.map((sample) => flatten(sample));
  const paths = [...new Set(flattened.flatMap((sample) => [...sample.keys()]))].sort();
  const candidates = [];
  for (const path of paths) {
    const values = flattened.map((sample) => sample.has(path) ? sample.get(path) : MISSING);
    const distinct = new Set(values.map(canonicalLeaf));
    if (distinct.size <= 1) continue;
    const classification = classify(path, values);
    candidates.push({
      path,
      ...classification,
      observedRuns: samples.length,
      distinctValueCount: distinct.size,
      missingRunCount: values.filter((value) => value === MISSING).length,
      applied: false,
      proposal: classification.suggestedReplacement
        ? { action: "replace", path, replacement: classification.suggestedReplacement }
        : null,
    });
  }
  const report = {
    ok: true,
    runtime: "web-volatility-miner",
    version: WEB_VOLATILITY_MINER_VERSION,
    runs: samples.length,
    candidateCount: candidates.length,
    likelyNoiseCount: candidates.filter((candidate) => candidate.candidateSafety === "likely-noise").length,
    reviewRequiredCount: candidates.filter((candidate) => candidate.candidateSafety === "review-required").length,
    candidates,
    appliedCount: 0,
  };
  report.semanticHash = semanticHash({
    ...report,
    candidates: candidates.map(({ path, kind, confidence, candidateSafety, suggestedReplacement, reason, observedRuns, distinctValueCount, missingRunCount, applied, proposal }) => ({
      path, kind, confidence, candidateSafety, suggestedReplacement, reason, observedRuns, distinctValueCount, missingRunCount, applied, proposal,
    })),
  });
  return report;
}

export async function mineDriverVolatility(driver, { runs = 3 } = {}) {
  if (!Number.isSafeInteger(runs) || runs < 2) throw new Error("driver volatility mining requires at least 2 runs");
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    await driver.reset();
    const raw = await driver.rawSnapshot();
    const indexedDB = await driver.indexedDbInventory();
    samples.push({
      url: raw.url,
      semanticDom: raw.semanticDom,
      forms: raw.forms,
      focus: raw.focus ?? null,
      storage: raw.storage,
      applicationState: indexedDB ? { indexedDB } : null,
    });
  }
  return mineVolatility(samples);
}
