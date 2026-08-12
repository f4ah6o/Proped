#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createProjectionHintContract,
  createPropertyHintContract,
  evaluateWebDomainPropertyContract,
  projectWebDomainHintContract,
  validateWebDomainHintContract,
  webDomainHintContractSupport,
} from "../protocol/web-domain-hint-contract.mjs";

const property = createPropertyHintContract({
  inputKind: "generic-property-pack",
  inputId: "reload-persistence",
  predicateOp: "no-failures",
});
validateWebDomainHintContract(property, "property");
assert.equal(webDomainHintContractSupport(property).executable, true);
assert.deepEqual(evaluateWebDomainPropertyContract(property, {
  results: [{ id: "reload-persistence", failures: [] }],
}), { status: "pass", failureCount: 0, inputId: "reload-persistence" });
assert.deepEqual(evaluateWebDomainPropertyContract(property, {
  results: [{ id: "reload-persistence", failures: [{ code: "drift" }] }],
}), { status: "fail", failureCount: 1, inputId: "reload-persistence" });
assert.deepEqual(evaluateWebDomainPropertyContract(property, { results: [] }), {
  status: "not_executed", failureCount: null, inputId: "reload-persistence",
});

const unsupported = createPropertyHintContract({
  inputKind: "semantic-transition",
  inputId: "undo-redo-inverse",
  predicateOp: "domain-invariant",
  predicateId: "undo-redo-inverse",
});
assert.equal(webDomainHintContractSupport(unsupported).executable, false);
assert.equal(evaluateWebDomainPropertyContract(unsupported, { results: [] }).status, "unsupported");

const route = createProjectionHintContract({ selector: "route-identity" });
validateWebDomainHintContract(route, "projection");
assert.equal(webDomainHintContractSupport(route).executable, true);
assert.deepEqual(projectWebDomainHintContract(route, {
  url: "http://example.test/items/42?b=2&a=1#details",
}).value, {
  pathname: "/items/42",
  queryKeys: ["a", "b"],
  fragmentPresent: true,
});

const persistence = createProjectionHintContract({ selector: "persistence-summary" });
const projected = projectWebDomainHintContract(persistence, {
  storage: { local: { draft: "secret-value" }, session: { tab: "2" } },
  indexedDB: { databases: [{ name: "app", version: 1, stores: [{ name: "docs", count: 3 }] }] },
});
assert.deepEqual(projected.value.localStorageKeys, ["draft"]);
assert.deepEqual(projected.value.sessionStorageKeys, ["tab"]);
assert.deepEqual(projected.value.databases[0].stores, [{ name: "docs", count: 3 }]);
assert.equal(JSON.stringify(projected).includes("secret-value"), false);

const unsupportedProjection = createProjectionHintContract({ selector: "domain-graph-summary" });
assert.equal(webDomainHintContractSupport(unsupportedProjection).executable, false);
assert.equal(projectWebDomainHintContract(unsupportedProjection, {}).status, "unsupported");

assert.throws(() => validateWebDomainHintContract({ ...property, semanticHash: "tampered" }), /semantic hash mismatch/);
assert.equal(createPropertyHintContract({ inputKind: "generic-property-pack", inputId: "reload-persistence", predicateOp: "no-failures" }).semanticHash, property.semanticHash);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-domain-hint-contract-test",
  version: property.version,
  propertyExecutable: true,
  unsupportedPropertyExecutable: false,
  projectionExecutable: true,
  payloadValuesExcluded: true,
  deterministic: true,
}));
