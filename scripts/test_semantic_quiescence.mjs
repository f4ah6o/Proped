#!/usr/bin/env node
import assert from "node:assert/strict";
import { waitForSemanticQuiescence } from "../protocol/semantic-quiescence.mjs";

{
  let index = 0;
  let clock = 0;
  const fingerprints = ["a", "b", "b", "b"];
  const pending = [1, 0, 0, 0];
  const result = await waitForSemanticQuiescence({
    sampleFingerprint: async () => fingerprints[Math.min(index, fingerprints.length - 1)],
    pendingCount: async () => pending[Math.min(index++, pending.length - 1)],
    advanceFrame: async () => {},
    timeoutMs: 500,
    stableSamples: 3,
    sampleIntervalMs: 10,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  });
  assert.equal(result.status, "settled");
  assert.equal(result.samples, 4);
  assert.equal(result.pendingRequests, 0);
  assert.equal(result.stableSamples, 3);
  assert.equal(result.distinctFingerprints, 2);
  assert.equal(result.networkIdleUsed, false);
}

{
  let index = 0;
  let clock = 0;
  const result = await waitForSemanticQuiescence({
    sampleFingerprint: async () => `state-${index++}`,
    pendingCount: async () => 0,
    advanceFrame: async () => {},
    timeoutMs: 30,
    stableSamples: 3,
    sampleIntervalMs: 10,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  });
  assert.equal(result.status, "timeout");
  assert.equal(result.diagnostic.code, "semantic_quiescence_timeout");
  assert.equal(result.pendingRequests, 0);
  assert.equal(result.networkIdleUsed, false);
}

{
  let index = 0;
  let clock = 0;
  const ready = [false, true, true, true];
  const result = await waitForSemanticQuiescence({
    sampleFingerprint: async () => "stable",
    pendingCount: async () => 0,
    readyCheck: async () => ready[Math.min(index++, ready.length - 1)],
    advanceFrame: async () => {},
    timeoutMs: 100,
    stableSamples: 2,
    sampleIntervalMs: 5,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  });
  assert.equal(result.status, "settled");
  assert.equal(result.strategy, "explicit-ready+semantic-quiescence");
  assert.equal(result.explicitReady, true);
}

console.log(JSON.stringify({
  ok: true,
  runtime: "semantic-quiescence-test",
  classifications: ["settled", "timeout", "explicit-ready"],
}));
