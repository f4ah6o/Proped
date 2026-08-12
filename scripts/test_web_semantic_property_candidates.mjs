#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeWebSemanticProperties } from "../protocol/web-semantic-property-candidates.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-semantic-candidates-"));
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "editor.tsx"), `
    export function Editor() {
      const undo = () => history.undo();
      const redo = () => history.redo();
      const removeSelected = () => { deleteEntity(selectedId); setSelectedId(null); };
      const save = () => localStorage.setItem('doc', JSON.stringify(model));
      const exportDocument = () => model;
      const importDocument = (value) => value;
      return <main><button aria-label="Undo">Undo</button><button aria-label="Redo">Redo</button><button aria-label="Save">Save</button><button aria-label="Export">Export</button><button aria-label="Import">Import</button></main>;
    }
  `);
  fs.writeFileSync(path.join(root, "tests", "editor.test.ts"), `
    test('undo and redo restore the document', () => {});
    test('export import roundtrip preserves document', () => {});
    test('escape cancels edit', () => {});
    test('delete clears selected entity', () => {});
    test('save survives reload', () => {});
  `);
  const report = analyzeWebSemanticProperties(root);
  const byId = new Map(report.candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of ["undo-redo-inverse", "import-export-roundtrip", "escape-cancels-edit", "delete-clears-selection", "saved-state-survives-reload"]) {
    assert.ok(byId.has(id), `missing ${id}`);
    assert.equal(byId.get(id).status, "review-only");
    assert.equal(byId.get(id).automaticActivation, false);
    assert.equal(byId.get(id).suggestedPredicate.version, "1");
    assert.equal(byId.get(id).suggestedPredicate.kind, "property");
    assert.ok(byId.get(id).confidence >= 0.7);
  }
  assert.ok(byId.get("undo-redo-inverse").evidenceKinds.includes("source"));
  assert.ok(byId.get("undo-redo-inverse").evidenceKinds.includes("test-title"));
  assert.ok(byId.get("undo-redo-inverse").evidenceKinds.includes("ui-vocabulary"));
  assert.equal(byId.get("saved-state-survives-reload").suggestedPredicate.input.kind, "generic-property-pack");
  assert.equal(byId.get("undo-redo-inverse").suggestedPredicate.input.kind, "semantic-transition");
  assert.equal(report.automaticActivationCount, 0);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-semantic-property-candidates-test",
    candidateCount: report.candidateCount,
    candidates: report.candidates.map((candidate) => ({ id: candidate.id, confidence: candidate.confidence, evidenceKinds: candidate.evidenceKinds })),
    automaticActivationCount: report.automaticActivationCount,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
