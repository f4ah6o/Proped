import { performance } from "node:perf_hooks";

export const SEMANTIC_QUIESCENCE_VERSION = "1";

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampConfidence(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Wait until observable semantic state remains unchanged for N samples and
 * tracked pending requests reach zero. The caller owns browser-specific
 * sampling and animation-frame advancement; this protocol never uses
 * networkidle.
 */
export async function waitForSemanticQuiescence({
  sampleFingerprint,
  pendingCount = async () => 0,
  advanceFrame = async () => {},
  readyCheck = null,
  timeoutMs = 5_000,
  stableSamples = 3,
  sampleIntervalMs = 25,
  sleep = defaultSleep,
  now = () => performance.now(),
} = {}) {
  if (typeof sampleFingerprint !== "function") throw new Error("semantic quiescence requires sampleFingerprint");
  if (typeof pendingCount !== "function") throw new Error("semantic quiescence pendingCount must be a function");
  if (typeof advanceFrame !== "function") throw new Error("semantic quiescence advanceFrame must be a function");
  if (readyCheck != null && typeof readyCheck !== "function") throw new Error("semantic quiescence readyCheck must be a function when provided");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("semantic quiescence timeoutMs must be a positive safe integer");
  if (!Number.isSafeInteger(stableSamples) || stableSamples < 1) throw new Error("semantic quiescence stableSamples must be a positive safe integer");
  if (!Number.isSafeInteger(sampleIntervalMs) || sampleIntervalMs < 0) throw new Error("semantic quiescence sampleIntervalMs must be a non-negative safe integer");

  const started = now();
  let samples = 0;
  let consecutiveStable = 0;
  let lastFingerprint = null;
  let lastPending = 0;
  let explicitReady = null;
  const observedFingerprints = new Set();

  while (true) {
    await advanceFrame();
    const [fingerprint, pending, ready] = await Promise.all([
      sampleFingerprint(),
      pendingCount(),
      readyCheck ? readyCheck() : Promise.resolve(null),
    ]);
    if (typeof fingerprint !== "string" || fingerprint.length === 0) {
      throw new Error("semantic quiescence sampleFingerprint must return a non-empty string");
    }
    if (!Number.isSafeInteger(pending) || pending < 0) {
      throw new Error("semantic quiescence pendingCount must return a non-negative safe integer");
    }

    samples += 1;
    observedFingerprints.add(fingerprint);
    lastPending = pending;
    explicitReady = readyCheck ? Boolean(ready) : null;

    if (pending === 0 && (!readyCheck || explicitReady)) {
      consecutiveStable = fingerprint === lastFingerprint ? consecutiveStable + 1 : 1;
    } else {
      consecutiveStable = 0;
    }
    lastFingerprint = fingerprint;

    const elapsedMs = Math.max(0, Math.round(now() - started));
    if (consecutiveStable >= stableSamples) {
      return {
        status: "settled",
        strategy: readyCheck ? "explicit-ready+semantic-quiescence" : "semantic-quiescence",
        version: SEMANTIC_QUIESCENCE_VERSION,
        samples,
        stableSamples: consecutiveStable,
        requiredStableSamples: stableSamples,
        pendingRequests: pending,
        elapsedMs,
        confidence: 1,
        explicitReady,
        lastFingerprint: fingerprint,
        distinctFingerprints: observedFingerprints.size,
        networkIdleUsed: false,
      };
    }

    if (elapsedMs >= timeoutMs) {
      const stability = consecutiveStable / stableSamples;
      const pendingFactor = lastPending === 0 ? 1 : 0.5;
      const readyFactor = readyCheck && !explicitReady ? 0.5 : 1;
      return {
        status: "timeout",
        strategy: readyCheck ? "explicit-ready+semantic-quiescence" : "semantic-quiescence",
        version: SEMANTIC_QUIESCENCE_VERSION,
        samples,
        stableSamples: consecutiveStable,
        requiredStableSamples: stableSamples,
        pendingRequests: lastPending,
        elapsedMs,
        confidence: clampConfidence(stability * pendingFactor * readyFactor),
        explicitReady,
        lastFingerprint,
        distinctFingerprints: observedFingerprints.size,
        networkIdleUsed: false,
        diagnostic: {
          code: "semantic_quiescence_timeout",
          message: "semantic state did not reach the requested stable sample count before timeout",
        },
      };
    }

    if (sampleIntervalMs > 0) await sleep(sampleIntervalMs);
  }
}
