#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildWebSemanticOracleBoundary } from "../protocol/web-semantic-oracle-boundary.mjs";

const cleanCampaign = {
  ok: true,
  results: [{ id: "browser-safety", failures: [] }, { id: "reload-persistence", failures: [] }],
  failures: [],
};
const cleanReplay = { ok: true };
const snapshot = {
  applicationState: {
    semanticProjections: {
      "route-identity": { pathname: "/items/42", queryKeys: [], fragmentPresent: false },
    },
  },
};

const genericOnly = buildWebSemanticOracleBoundary({
  semanticHints: null,
  approvedSemanticRuntime: { approvedHintSemanticHash: null, properties: [], projections: [], diagnostics: [] },
  propertyCampaign: cleanCampaign,
  replayGate: cleanReplay,
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(genericOnly.generic.verdict, "generic_verified");
assert.equal(genericOnly.domain.verdict, "domain_unverified");
assert.deepEqual(genericOnly.domain.verifiedPropertyRefs, []);
assert.equal(genericOnly.domain.automaticOracle, false);

const routeProjection = {
  ref: "projection:route-identity",
  id: "route-identity",
  kind: "projection",
  approvedByHuman: true,
  activation: "human-approved",
};
const projectionOnly = buildWebSemanticOracleBoundary({
  semanticHints: { approved: [routeProjection] },
  approvedSemanticRuntime: {
    approvedHintSemanticHash: "projection-hints",
    properties: [],
    projections: [routeProjection],
    diagnostics: [],
  },
  propertyCampaign: cleanCampaign,
  replayGate: cleanReplay,
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(projectionOnly.domain.verdict, "domain_unverified");
assert.deepEqual(projectionOnly.domain.observedProjectionRefs, ["projection:route-identity"]);

const persistenceProperty = {
  ref: "property:saved-state-survives-reload",
  id: "saved-state-survives-reload",
  kind: "property",
  approvedByHuman: true,
  activation: "human-approved",
};
const verified = buildWebSemanticOracleBoundary({
  semanticHints: { approved: [routeProjection, persistenceProperty] },
  approvedSemanticRuntime: {
    approvedHintSemanticHash: "verified-hints",
    properties: [persistenceProperty],
    projections: [routeProjection],
    diagnostics: [],
  },
  propertyCampaign: cleanCampaign,
  replayGate: cleanReplay,
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(verified.domain.verdict, "domain_verified");
assert.deepEqual(verified.domain.verifiedPropertyRefs, ["property:saved-state-survives-reload"]);
assert.deepEqual(verified.domain.observedProjectionRefs, ["projection:route-identity"]);

const unsupportedProperty = {
  ref: "property:undo-is-business-correct",
  id: "undo-is-business-correct",
  kind: "property",
  approvedByHuman: true,
  activation: "human-approved",
};
const unsupported = buildWebSemanticOracleBoundary({
  semanticHints: { approved: [unsupportedProperty] },
  approvedSemanticRuntime: {
    approvedHintSemanticHash: "unsupported-hints",
    properties: [],
    projections: [],
    diagnostics: [{ kind: "approved_semantic_runtime_unsupported", ref: unsupportedProperty.ref }],
  },
  propertyCampaign: cleanCampaign,
  replayGate: cleanReplay,
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(unsupported.domain.verdict, "domain_unverified");
assert.deepEqual(unsupported.domain.unsupportedApprovedRefs, [unsupportedProperty.ref]);
assert.deepEqual(unsupported.domain.verifiedPropertyRefs, []);

const failedCampaign = {
  ok: false,
  results: [{ id: "reload-persistence", failures: [{ code: "reload_persistence_storage_drift" }] }],
  failures: [{ code: "reload_persistence_storage_drift" }],
};
const failed = buildWebSemanticOracleBoundary({
  semanticHints: { approved: [persistenceProperty] },
  approvedSemanticRuntime: {
    approvedHintSemanticHash: "failed-hints",
    properties: [persistenceProperty],
    projections: [],
    diagnostics: [],
  },
  propertyCampaign: failedCampaign,
  replayGate: { ok: false },
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(failed.generic.verdict, "generic_failed");
assert.equal(failed.domain.verdict, "domain_failed");
assert.deepEqual(failed.domain.failedPropertyRefs, [persistenceProperty.ref]);

const repeated = buildWebSemanticOracleBoundary({
  semanticHints: { approved: [routeProjection, persistenceProperty] },
  approvedSemanticRuntime: {
    approvedHintSemanticHash: "verified-hints",
    properties: [persistenceProperty],
    projections: [routeProjection],
    diagnostics: [],
  },
  propertyCampaign: cleanCampaign,
  replayGate: cleanReplay,
  explorationReplayGate: cleanReplay,
  snapshot,
  actionCount: 3,
});
assert.equal(repeated.semanticHash, verified.semanticHash);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-semantic-oracle-boundary-test",
  genericOnly: genericOnly.domain.verdict,
  projectionOnly: projectionOnly.domain.verdict,
  verified: verified.domain.verdict,
  unsupported: unsupported.domain.verdict,
  failed: failed.domain.verdict,
  deterministic: repeated.semanticHash === verified.semanticHash,
}));
