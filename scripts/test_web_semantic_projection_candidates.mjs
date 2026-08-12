#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeWebSemanticProjections } from "../protocol/web-semantic-projection-candidates.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-projection-candidates-"));
try {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "vite build" }, dependencies: { vite: "1.0.0", dexie: "3.2.7", "react-router-dom": "6.0.0" } }));
  fs.writeFileSync(path.join(root, "src", "editor.tsx"), `
    const db = new Dexie('app');
    const selectedNodeId = state.selectedNodeId;
    const visibleNodes = state.nodes.filter(node => node.visible);
    const edgeCount = state.edges.length;
    const canUndo = history.canUndo;
    const canRedo = history.canRedo;
    const route = useParams();
    localStorage.setItem('layout', JSON.stringify(state.layout));
    export function Editor(){ return <main><button aria-label="Undo">Undo</button><button aria-label="Redo">Redo</button><button aria-label="Save">Save</button><button aria-label="Open details">Open details</button></main> }
  `);
  fs.writeFileSync(path.join(root, "tests", "editor.test.ts"), `
    test('selection remains valid after deleting a node', () => {});
    test('undo redo history restores diagram', () => {});
    test('saved layout survives reload', () => {});
    test('route opens node details', () => {});
  `);
  const report = analyzeWebSemanticProjections(root);
  const byId = new Map(report.candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of ["selected-entity-identity", "entity-collection-count", "history-position", "persistence-summary", "route-identity", "domain-graph-summary"]) {
    assert.ok(byId.has(id), `missing ${id}`);
    assert.equal(byId.get(id).status, "review-only");
    assert.equal(byId.get(id).automaticActivation, false);
    assert.equal(byId.get(id).suggestedHook.executableCode, null);
    assert.equal(byId.get(id).suggestedHook.contract.version, "1");
    assert.equal(byId.get(id).suggestedHook.contract.kind, "projection");
    assert.equal(byId.get(id).suggestedHook.contract.source.selector, id);
    assert.ok(byId.get(id).confidence >= 0.6);
  }
  assert.ok(byId.get("persistence-summary").evidenceKinds.includes("runtime-inspection"));
  assert.ok(byId.get("route-identity").evidenceKinds.includes("runtime-inspection"));
  assert.equal(report.automaticActivationCount, 0);
  assert.equal(report.executableCodeGenerated, false);
  console.log(JSON.stringify({
    ok: true,
    runtime: "web-semantic-projection-candidates-test",
    candidateCount: report.candidateCount,
    candidates: report.candidates.map((candidate) => ({ id: candidate.id, confidence: candidate.confidence, sourceKind: candidate.sourceKind, evidenceKinds: candidate.evidenceKinds })),
    automaticActivationCount: report.automaticActivationCount,
    executableCodeGenerated: report.executableCodeGenerated,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
