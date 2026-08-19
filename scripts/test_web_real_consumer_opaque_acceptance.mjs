#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  buildOpaqueWebRealConsumerAcceptanceV1,
  validateOpaqueWebRealConsumerEvidenceV1,
} from "../protocol/opaque-web-real-consumer-acceptance-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-evidence-v1.json");
const evidence = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

const validated = validateOpaqueWebRealConsumerEvidenceV1(evidence);
assert.equal(validated.consumerSpecificAdapterLoc, 0);
assert.deepEqual(
  validated.source.steps.map(({ kind, ordinal }) => ({ kind, ordinal })),
  validated.peer.steps.map(({ kind, ordinal }) => ({ kind, ordinal })),
);
assert.deepEqual(
  validated.source.steps.map(({ kind, ordinal }) => ({ kind, ordinal })),
  validated.consumerAfter.steps.map(({ kind, ordinal }) => ({ kind, ordinal })),
);

const acceptance = buildOpaqueWebRealConsumerAcceptanceV1(evidence);
const committedAcceptance = JSON.parse(fs.readFileSync(path.join(ROOT, "protocol/fixtures/opaque-web-real-consumer-acceptance-v1.json"), "utf8"));
assert.deepEqual(committedAcceptance, acceptance);
assert.equal(acceptance.version, "OpaqueWebRealConsumerAcceptanceV1");
assert.equal(acceptance.portableActionCount, 1);
assert.equal(acceptance.source.minimality, "one-minimal");
assert.equal(acceptance.peer.minimality, "not-one-minimal");
assert.equal(acceptance.before.classification, "consumer_boundary_divergence");
assert.equal(acceptance.before.productionQualified, false);
assert.deepEqual(acceptance.before.firstDivergence, {
  index: 0,
  kind: "dom_activate",
  ordinal: 9,
  sourceTransition: "changed",
  peerTransition: "changed",
  consumerTransition: "unchanged",
});
assert.equal(acceptance.after.classification, "portable_replay_agrees");
assert.equal(acceptance.after.productionQualified, true);
assert.equal(acceptance.after.firstDivergence, null);
assert.equal(acceptance.after.mutableStateIsolation, "isolated");

assert.throws(
  () => validateOpaqueWebRealConsumerEvidenceV1({ ...evidence, consumerSpecificAdapterLoc: 1 }),
  /adapter LOC must remain zero/,
);
assert.throws(
  () => validateOpaqueWebRealConsumerEvidenceV1({ ...evidence, source: { ...evidence.source, selector: "PRIVATE_SELECTOR" } }),
  /unsupported field/,
);
assert.throws(
  () => validateOpaqueWebRealConsumerEvidenceV1({ ...evidence, peer: { ...evidence.peer, minimality: "one-minimal" } }),
  /must not inherit source-engine one-minimality/,
);
assert.throws(
  () => validateOpaqueWebRealConsumerEvidenceV1({
    ...evidence,
    consumerAfter: {
      ...evidence.consumerAfter,
      steps: [{ ...evidence.consumerAfter.steps[0], ordinal: 8 }],
    },
  }),
  /exact portable kind\+ordinal action vector/,
);

const cli = spawnSync(process.execPath, [path.join(ROOT, "scripts/web_real_consumer_opaque_acceptance.mjs")], {
  cwd: ROOT,
  input: JSON.stringify(evidence),
  encoding: "utf8",
});
assert.equal(cli.status, 0, cli.stderr);
assert.deepEqual(JSON.parse(cli.stdout.trim()), acceptance);

const privateSentinel = "PRIVATE_CONSUMER_NAME_SHOULD_NOT_ESCAPE";
const rejected = spawnSync(process.execPath, [path.join(ROOT, "scripts/web_real_consumer_opaque_acceptance.mjs")], {
  cwd: ROOT,
  input: JSON.stringify({ ...evidence, consumerName: privateSentinel }),
  encoding: "utf8",
});
assert.equal(rejected.status, 2);
assert.equal(rejected.stdout, "");
assert.equal(rejected.stderr.includes(privateSentinel), false);
assert.deepEqual(JSON.parse(rejected.stderr.trim()), { ok: false, diagnostic: "opaque_real_consumer_acceptance_invalid" });

const serialized = JSON.stringify(acceptance);
for (const forbidden of ["selector", "url", "text", "accessibility", "screenshot", "pixel", "console", "source", "storageValue"]) {
  if (forbidden === "source") continue;
  assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, `acceptance contains forbidden surface ${forbidden}`);
}

console.log(JSON.stringify({
  ok: true,
  runtime: "opaque-real-consumer-acceptance-test",
  before: acceptance.before.classification,
  after: acceptance.after.classification,
  afterProductionQualified: acceptance.after.productionQualified,
  consumerSpecificAdapterLoc: acceptance.consumerSpecificAdapterLoc,
}));
