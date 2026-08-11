#!/usr/bin/env node
import assert from "node:assert/strict";
import { classifyWebFailure, clusterWebFailures } from "../protocol/web-failure-classifier.mjs";

const left = {
  code: "browser_uncaught_exception",
  trace: ['click|button|Crash|input="a"', 'inject|entity|12345|generation=91'],
  route: "/items/12345?request=req-123",
  message: "TypeError: boom at token deadbeefdeadbeef",
  evidence: { errors: ["TypeError: boom"], selectedId: "deadbeefdeadbeef" },
};
const right = {
  code: "browser_uncaught_exception",
  trace: ['click|button|Crash|input="b"', 'inject|entity|98765|generation=44'],
  route: "/items/98765?request=req-999",
  message: "TypeError: boom at token feedfacefeedface",
  evidence: { errors: ["TypeError: boom"], selectedId: "feedfacefeedface" },
};
const a = classifyWebFailure(left);
const b = classifyWebFailure(right);
assert.equal(a.id, b.id);
assert.equal(a.oracleFamily, "browser-safety");
assert.equal(a.routeFamily, "/items/:id?request=:value");
assert.equal(a.exceptionKind, "TypeError");
assert.deepEqual(a.semanticDeltaPaths, b.semanticDeltaPaths);

const different = classifyWebFailure({ ...right, code: "reload_persistence_storage_drift", message: "state drift" });
assert.notEqual(a.id, different.id);
assert.equal(different.oracleFamily, "reload-persistence");

const clusters = clusterWebFailures([left, right, { property: "delete_table_undo_preserves_order", trace: ["delete|table|123", "undo|table|123"], expected: ["a", "b"], actual: ["b", "a"] }]);
assert.equal(clusters.inputCount, 3);
assert.equal(clusters.clusterCount, 2);
assert.equal(clusters.clusters.find((cluster) => cluster.id === a.id).count, 2);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-failure-classifier-test",
  equivalentId: a.id,
  clusterCount: clusters.clusterCount,
  routeFamily: a.routeFamily,
  exceptionKind: a.exceptionKind,
}));
