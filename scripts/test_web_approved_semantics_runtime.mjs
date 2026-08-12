#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import { createPropertyHintContract, createProjectionHintContract } from "../protocol/web-domain-hint-contract.mjs";
import {
  applyApprovedSemanticNormalizers,
  projectApprovedSemanticState,
  resolveApprovedSemanticRuntime,
  validateApprovedSemanticHints,
} from "../protocol/web-approved-semantics-runtime.mjs";
import {
  compileWebProjectManifestV2,
  createWebProjectManifestV2FromInspection,
  withApprovedWebSemantics,
} from "../protocol/web-project-manifest-v2.mjs";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const approved = [
  {
    ref: "property:saved-state-survives-reload", id: "saved-state-survives-reload", kind: "property",
    confidence: 0.98, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: "expected persistence", activation: "human-approved",
    contract: createPropertyHintContract({ inputKind: "generic-property-pack", inputId: "reload-persistence", predicateOp: "no-failures" }),
  },
  {
    ref: "projection:route-identity", id: "route-identity", kind: "projection",
    confidence: 0.96, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: null, activation: "human-approved",
    projection: { kind: "state-projection", name: "route-identity", outputShape: { type: "route-family" }, executableCode: null },
    contract: createProjectionHintContract({ selector: "route-identity" }),
  },
  {
    ref: "projection:persistence-summary", id: "persistence-summary", kind: "projection",
    confidence: 0.92, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: null, activation: "human-approved",
    projection: { kind: "state-projection", name: "persistence-summary", outputShape: { type: "metadata" }, executableCode: null },
    contract: createProjectionHintContract({ selector: "persistence-summary" }),
  },
  {
    ref: "normalizer:generated-id:$.semanticDom.attributes.id", id: "generated-id:$.semanticDom.attributes.id", kind: "normalizer",
    confidence: 0.94, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
    note: null, activation: "human-approved",
    normalizer: { action: "replace", path: "$.semanticDom.attributes.id", replacement: "<generated-id>" },
  },
];
const stable = {
  reviewSemanticHash: "review-fixture",
  approved,
  rejected: [],
  deferred: [],
  pending: [],
};
const hints = {
  ok: true,
  runtime: "web-semantic-approved-hints",
  version: "1",
  reviewSemanticHash: stable.reviewSemanticHash,
  approvalPlanSemanticHash: "approval-fixture",
  counts: { approved: approved.length, rejected: 0, deferred: 0, pending: 0 },
  ...stable,
  automaticActivation: false,
  semanticHash: semanticHash(stable),
};

validateApprovedSemanticHints(hints);
const runtime = resolveApprovedSemanticRuntime(hints);
assert.deepEqual(runtime.propertyPacks, ["reload-persistence"]);
assert.deepEqual(runtime.properties.map((item) => item.ref), ["property:saved-state-survives-reload"]);
assert.deepEqual(runtime.projections.map((item) => item.id), ["route-identity", "persistence-summary"]);
assert.equal(runtime.normalizers.length, 1);
assert.equal(runtime.diagnostics.length, 0);

const unsupportedApproved = [{
  ref: "property:undo-redo-inverse", id: "undo-redo-inverse", kind: "property",
  confidence: 0.9, confidenceBand: "high", approvedByHuman: true, riskAcknowledged: false,
  note: null, activation: "human-approved",
  contract: createPropertyHintContract({ inputKind: "semantic-transition", inputId: "undo-redo-inverse", predicateOp: "domain-invariant", predicateId: "undo-redo-inverse" }),
}];
const unsupportedStable = { reviewSemanticHash: "unsupported-review", approved: unsupportedApproved, rejected: [], deferred: [], pending: [] };
const unsupportedHints = {
  ok: true, runtime: "web-semantic-approved-hints", version: "1", reviewSemanticHash: unsupportedStable.reviewSemanticHash,
  approvalPlanSemanticHash: "unsupported-plan", counts: { approved: 1, rejected: 0, deferred: 0, pending: 0 },
  ...unsupportedStable, automaticActivation: false, semanticHash: semanticHash(unsupportedStable),
};
const unsupportedRuntime = resolveApprovedSemanticRuntime(unsupportedHints);
assert.deepEqual(unsupportedRuntime.propertyPacks, []);
assert.deepEqual(unsupportedRuntime.properties, []);
assert.equal(unsupportedRuntime.diagnostics[0].kind, "approved_semantic_contract_unsupported");

const normalized = applyApprovedSemanticNormalizers({ semanticDom: { attributes: { id: "volatile-123" } } }, runtime);
assert.equal(normalized.semanticDom.attributes.id, "<generated-id>");
const projection = projectApprovedSemanticState(runtime, {
  url: "http://example.test/items/42?b=2&a=1#details",
  storage: { local: { draft: "1" }, session: { tab: "2" } },
  indexedDB: { databases: [{ name: "app", version: 3, stores: [{ name: "docs", count: 2 }] }] },
});
assert.deepEqual(projection["route-identity"], { pathname: "/items/42", queryKeys: ["a", "b"], fragmentPresent: true });
assert.deepEqual(projection["persistence-summary"].localStorageKeys, ["draft"]);
assert.deepEqual(projection["persistence-summary"].databases[0].stores, [{ name: "docs", count: 2 }]);

const tampered = { ...hints, approved: hints.approved.map((item, index) => index === 0 ? { ...item, note: "tampered" } : item) };
assert.throws(() => validateApprovedSemanticHints(tampered), /semantic hash mismatch/);

const inspection = inspectWebProject(path.join(ROOT, "web/next-ssr-hydration"));
const generated = createWebProjectManifestV2FromInspection(inspection, { projectRoot: "web/next-ssr-hydration" });
const attached = withApprovedWebSemantics(generated, hints);
assert.equal(attached.semantics.approved.semanticHash, hints.semanticHash);
const resolvedManifest = { ...attached, server: { ...attached.server, mode: "external", url: "http://127.0.0.1:3000", outputDir: null, start: null } };
const compiled = compileWebProjectManifestV2(resolvedManifest, ROOT);
const browserCommand = compiled.manifest.stages.at(-1).command;
const semanticArg = browserCommand[browserCommand.indexOf("--semantic-hints-json") + 1];
assert.equal(JSON.parse(semanticArg).semanticHash, hints.semanticHash);

let requestSequence = 0;
const server = http.createServer((request, response) => {
  requestSequence += 1;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(`<!doctype html><html><body><main id="volatile-${requestSequence}"><h1>Approved semantics</h1></main><script>localStorage.setItem('draft','1')</script></body></html>`);
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;

let approvedDriver = null;
let baselineDriver = null;
try {
  approvedDriver = new GenericPlaywrightBrowserDriver({
    url: `${origin}/items/42?b=2&a=1#details`,
    approvedSemanticRuntime: runtime,
    timeoutMs: 5_000,
  });
  const approvedFirst = await approvedDriver.reset();
  const approvedSecond = await approvedDriver.reset();
  assert.equal(approvedFirst.fingerprint, approvedSecond.fingerprint);
  assert.match(approvedFirst.dom, /<generated-id>/);
  assert.deepEqual(approvedFirst.applicationState.semanticProjections["route-identity"], {
    pathname: "/items/42", queryKeys: ["a", "b"], fragmentPresent: true,
  });
  assert.deepEqual(approvedFirst.applicationState.semanticProjections["persistence-summary"].localStorageKeys, ["draft"]);

  baselineDriver = new GenericPlaywrightBrowserDriver({ url: `${origin}/items/42?b=2&a=1#details`, timeoutMs: 5_000 });
  const baselineFirst = await baselineDriver.reset();
  const baselineSecond = await baselineDriver.reset();
  assert.notEqual(baselineFirst.fingerprint, baselineSecond.fingerprint);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-approved-semantics-runtime-test",
    propertyPacks: runtime.propertyPacks,
    projectionIds: runtime.projections.map((item) => item.id),
    normalizerCount: runtime.normalizers.length,
    approvedFingerprintStable: approvedFirst.fingerprint === approvedSecond.fingerprint,
    baselineFingerprintStable: baselineFirst.fingerprint === baselineSecond.fingerprint,
    manifestCompiled: true,
    automaticActivation: false,
  }));
} finally {
  if (approvedDriver) await approvedDriver.dispose();
  if (baselineDriver) await baselineDriver.dispose();
  await new Promise((resolve) => server.close(resolve));
}
