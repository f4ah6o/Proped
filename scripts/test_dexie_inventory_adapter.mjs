#!/usr/bin/env node
import assert from "node:assert/strict";
import { enrichIndexedDbInventoryWithDexie } from "../web/playwright-browser/dexie-inventory-adapter.mjs";

const raw = {
  version: "1",
  supported: true,
  databases: [{
    name: "drawDB",
    nativeVersion: 670,
    stores: [
      {
        name: "diagrams",
        keyPath: "id",
        autoIncrement: true,
        count: 0,
        indexes: [
          { name: "diagramId", keyPath: "diagramId", unique: false, multiEntry: false },
          { name: "lastModified", keyPath: "lastModified", unique: false, multiEntry: false },
          { name: "loadedFromGistId", keyPath: "loadedFromGistId", unique: false, multiEntry: false },
        ],
      },
      {
        name: "templates",
        keyPath: "id",
        autoIncrement: true,
        count: 0,
        indexes: [
          { name: "custom", keyPath: "custom", unique: false, multiEntry: false },
          { name: "templateId", keyPath: "templateId", unique: false, multiEntry: false },
        ],
      },
    ],
  }],
  diagnostics: [],
};

const enriched = enrichIndexedDbInventoryWithDexie(raw, {
  declaredVersion: "^3.2.4",
  resolvedVersion: "3.2.7",
});
assert.equal(enriched.adapter.kind, "dexie");
assert.equal(enriched.adapter.mappingSupported, true);
assert.equal(enriched.adapter.major, 3);
assert.equal(enriched.adapter.confidence, 1);
assert.equal(enriched.databases[0].dexie.logicalVersion, 67);
assert.equal(enriched.databases[0].dexie.nativeVersionScale, 10);
assert.equal(enriched.databases[0].dexie.stores.find((store) => store.name === "diagrams").schema, "++id,diagramId,lastModified,loadedFromGistId");
assert.equal(enriched.databases[0].dexie.stores.find((store) => store.name === "templates").schema, "++id,custom,templateId");

const declaredOnly = enrichIndexedDbInventoryWithDexie(raw, { declaredVersion: "^3.2.4" });
assert.equal(declaredOnly.databases[0].dexie.logicalVersion, 67);
assert.equal(declaredOnly.adapter.confidence, 0.9);

const unsupported = enrichIndexedDbInventoryWithDexie(raw, { resolvedVersion: "4.0.0" });
assert.equal(unsupported.adapter.mappingSupported, false);
assert.equal(unsupported.databases[0].dexie.logicalVersion, null);
assert.ok(unsupported.diagnostics.some((diagnostic) => diagnostic.code === "dexie_version_mapping_unsupported"));

console.log(JSON.stringify({
  ok: true,
  runtime: "dexie-inventory-adapter-test",
  nativeVersion: 670,
  logicalVersion: enriched.databases[0].dexie.logicalVersion,
  resolvedVersion: enriched.adapter.resolvedVersion,
  mappingEvidence: enriched.databases[0].dexie.mappingEvidence,
}));
