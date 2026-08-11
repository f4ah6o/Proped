import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SEMANTIC_PROPERTY_CANDIDATES_VERSION = "1";
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".output", "coverage", "protocol", ".proped"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".svelte", ".html"]);
const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)|\.(test|spec)\.[^.]+$/i;

function boundedFiles(root, { maxFiles = 200, maxBytes = 2 * 1024 * 1024 } = {}) {
  const stack = [root];
  const files = [];
  let bytes = 0;
  while (stack.length && files.length < maxFiles && bytes < maxBytes) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= maxFiles || bytes >= maxBytes) break;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) stack.push(file);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = fs.statSync(file);
        if (stat.size > 256 * 1024) continue;
        files.push(file); bytes += stat.size;
      } catch {}
    }
  }
  return { files, bytes, truncated: files.length >= maxFiles || bytes >= maxBytes };
}

function snippets(text, pattern, limit = 6) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let index = 0; index < lines.length && out.length < limit; index += 1) {
    if (!pattern.test(lines[index])) continue;
    out.push({ line: index + 1, text: lines[index].trim().slice(0, 220) });
    pattern.lastIndex = 0;
  }
  return out;
}

function uiLabels(text) {
  const values = new Set();
  const patterns = [
    /aria-label\s*=\s*["'`]([^"'`]{1,80})["'`]/gi,
    /title\s*=\s*["'`]([^"'`]{1,80})["'`]/gi,
    /<(?:button|a)[^>]*>\s*([^<>{}]{1,80})\s*<\/(?:button|a)>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) values.add(match[1].replace(/\s+/g, " ").trim());
  }
  return [...values].filter(Boolean).sort();
}

function testTitles(text) {
  const titles = new Set();
  const pattern = /\b(?:it|test|describe)\s*\(\s*["'`]([^"'`]{1,160})["'`]/g;
  for (const match of text.matchAll(pattern)) titles.add(match[1].replace(/\s+/g, " ").trim());
  return [...titles].sort();
}

function evidenceFor(records, pattern, sourceKind) {
  const evidence = [];
  for (const record of records) {
    const found = snippets(record.text, new RegExp(pattern.source, pattern.flags.replace("g", "")));
    for (const item of found) evidence.push({ kind: sourceKind, path: record.path, line: item.line, excerpt: item.text });
  }
  return evidence.slice(0, 12);
}

const RULES = [
  {
    id: "undo-redo-inverse",
    title: "Undo followed by redo restores the post-action semantic state",
    oracleFamily: "reversible-actions",
    source: /\bundo\b[\s\S]{0,1200}\bredo\b|\bredo\b[\s\S]{0,1200}\bundo\b/i,
    ui: /^(undo|redo)$/i,
    tests: /undo|redo/i,
  },
  {
    id: "import-export-roundtrip",
    title: "Export followed by import preserves the semantic document state",
    oracleFamily: "roundtrip",
    source: /\bexport\b[\s\S]{0,1600}\bimport\b|\bimport\b[\s\S]{0,1600}\bexport\b/i,
    ui: /import|export/i,
    tests: /round.?trip|import.*export|export.*import/i,
  },
  {
    id: "escape-cancels-edit",
    title: "Escape cancels an in-progress edit without committing the draft",
    oracleFamily: "reversible-actions",
    source: /Escape|keydown|keyup/i,
    ui: /edit|cancel/i,
    tests: /escape.*cancel|cancel.*edit|edit.*escape/i,
  },
  {
    id: "delete-clears-selection",
    title: "Deleting the selected entity clears or moves selection to a valid entity",
    oracleFamily: "entity-consistency",
    source: /\b(delete|remove|destroy)\b[\s\S]{0,1600}\b(select|selected|selection)\b|\b(select|selected|selection)\b[\s\S]{0,1600}\b(delete|remove|destroy)\b/i,
    ui: /delete|remove/i,
    tests: /delete.*select|select.*delete|remove.*select/i,
  },
  {
    id: "saved-state-survives-reload",
    title: "A saved change remains semantically equivalent after reload",
    oracleFamily: "reload-persistence",
    source: /\b(save|persist|storage|indexedDB|localStorage)\b/i,
    ui: /save/i,
    tests: /reload|persist|save.*reload/i,
  },
  {
    id: "filter-does-not-mutate-source",
    title: "Changing a filter does not mutate the underlying entity set",
    oracleFamily: "semantic-contract",
    source: /\b(filter|search|query)\b/i,
    ui: /filter|search/i,
    tests: /filter.*(preserve|not mutate|unchanged)|search.*(preserve|unchanged)/i,
  },
];

export function collectWebSemanticSignals(root, options = {}) {
  const resolved = fs.realpathSync(root);
  const scan = boundedFiles(resolved, options);
  const sourceRecords = [];
  const testRecords = [];
  const ui = new Set();
  const tests = new Set();
  for (const file of scan.files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    const relative = path.relative(resolved, file).split(path.sep).join("/");
    const record = { path: relative, text };
    if (TEST_PATH.test(relative)) testRecords.push(record);
    else sourceRecords.push(record);
    for (const label of uiLabels(text)) ui.add(label);
    if (TEST_PATH.test(relative)) for (const title of testTitles(text)) tests.add(title);
  }
  return {
    root: resolved,
    sourceRecords,
    testRecords,
    uiVocabulary: [...ui].sort(),
    testTitles: [...tests].sort(),
    scan: { files: scan.files.length, bytes: scan.bytes, truncated: scan.truncated },
  };
}

export function proposeWebSemanticProperties(signals) {
  const candidates = [];
  for (const rule of RULES) {
    const sourceEvidence = evidenceFor(signals.sourceRecords, rule.source, "source");
    const testEvidence = signals.testTitles.filter((title) => rule.tests.test(title)).slice(0, 8).map((title) => ({ kind: "test-title", title }));
    const uiEvidence = signals.uiVocabulary.filter((label) => rule.ui.test(label)).slice(0, 8).map((label) => ({ kind: "ui-vocabulary", label }));
    const evidence = [...sourceEvidence, ...testEvidence, ...uiEvidence];
    if (evidence.length === 0) continue;
    const kinds = new Set(evidence.map((item) => item.kind));
    const confidence = Math.min(0.98, 0.5 + (sourceEvidence.length ? 0.18 : 0) + (testEvidence.length ? 0.2 : 0) + (uiEvidence.length ? 0.1 : 0));
    candidates.push({
      id: rule.id,
      title: rule.title,
      oracleFamily: rule.oracleFamily,
      status: "review-only",
      confidence: Number(confidence.toFixed(2)),
      evidenceKinds: [...kinds].sort(),
      evidence,
      automaticActivation: false,
    });
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  const report = {
    ok: true,
    runtime: "web-semantic-property-candidates",
    version: WEB_SEMANTIC_PROPERTY_CANDIDATES_VERSION,
    scan: signals.scan,
    uiVocabularyCount: signals.uiVocabulary.length,
    testTitleCount: signals.testTitles.length,
    candidateCount: candidates.length,
    candidates,
    automaticActivationCount: 0,
  };
  report.semanticHash = semanticHash({
    version: report.version,
    scan: report.scan,
    uiVocabularyCount: report.uiVocabularyCount,
    testTitleCount: report.testTitleCount,
    candidates: candidates.map(({ id, oracleFamily, status, confidence, evidenceKinds, automaticActivation }) => ({ id, oracleFamily, status, confidence, evidenceKinds, automaticActivation })),
  });
  return report;
}

export function analyzeWebSemanticProperties(root, options = {}) {
  return proposeWebSemanticProperties(collectWebSemanticSignals(root, options));
}
