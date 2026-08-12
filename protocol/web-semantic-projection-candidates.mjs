import { semanticHash } from "./ui-driver-v1.mjs";
import { createProjectionHintContract } from "./web-domain-hint-contract.mjs";
import { collectWebSemanticSignals } from "./web-semantic-property-candidates.mjs";
import { inspectWebProject } from "./web-project-inspect.mjs";

export const WEB_SEMANTIC_PROJECTION_CANDIDATES_VERSION = "1";

function matches(records, regex, limit = 8) {
  const out = [];
  for (const record of records) {
    const re = new RegExp(regex.source, regex.flags.replaceAll("g", ""));
    const match = re.exec(record.text);
    if (!match) continue;
    const line = 1 + record.text.slice(0, match.index).split("\n").length - 1;
    out.push({
      kind: "source",
      path: record.path,
      line,
      excerpt: match[0].replace(/\s+/g, " ").trim().slice(0, 220),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function uiEvidence(vocabulary, regex, limit = 8) {
  return vocabulary.filter((label) => regex.test(label)).slice(0, limit).map((label) => ({ kind: "ui-vocabulary", label }));
}

function testEvidence(titles, regex, limit = 8) {
  return titles.filter((title) => regex.test(title)).slice(0, limit).map((title) => ({ kind: "test-title", title }));
}

function runtimeEvidence(inspection, predicate, detail) {
  return predicate(inspection) ? [{ kind: "runtime-inspection", detail }] : [];
}

const RULES = [
  {
    id: "selected-entity-identity",
    title: "Track the stable identity of the currently selected entity",
    shape: { type: "scalar-or-null", semanticRole: "entity-id" },
    sourceKind: "application-state",
    source: /\b(selected|selection|active|current)(?:[A-Z_][A-Za-z0-9_]*)?(?:Id|ID|Key)?\b/i,
    ui: /select|selected|active|current/i,
    tests: /select|selection|active/i,
    confidence: { source: 0.28, ui: 0.1, tests: 0.16, base: 0.42 },
  },
  {
    id: "entity-collection-count",
    title: "Track the semantic entity collection count",
    shape: { type: "integer", semanticRole: "entity-count" },
    sourceKind: "dom-or-application-state",
    source: /\b(items|todos|documents|diagrams|entities|records|nodes|rows|tasks)\b[\s\S]{0,500}\.(?:map|filter|length)\b/i,
    ui: /todo|document|diagram|record|node|row|task|item/i,
    tests: /count|items|todos|documents|diagrams|records|nodes|rows|tasks/i,
    confidence: { source: 0.24, ui: 0.1, tests: 0.14, base: 0.38 },
  },
  {
    id: "history-position",
    title: "Track undo/redo history position or availability",
    shape: { type: "object", fields: ["canUndo", "canRedo", "position"] },
    sourceKind: "application-state",
    source: /\b(undo|redo|history|historyIndex|historyPointer|canUndo|canRedo)\b/i,
    ui: /^(undo|redo)$/i,
    tests: /undo|redo|history/i,
    confidence: { source: 0.28, ui: 0.12, tests: 0.16, base: 0.4 },
  },
  {
    id: "persistence-summary",
    title: "Track persistence structure without storing record payloads",
    shape: { type: "metadata", fields: ["storageKeys", "databaseStores", "recordCounts"] },
    sourceKind: "storage-metadata",
    source: /\b(localStorage|sessionStorage|indexedDB|Dexie)\b/i,
    ui: /save|persist|storage/i,
    tests: /persist|reload|save|storage/i,
    runtime: (inspection) => inspection.runtime.stateSources.some((source) => ["localStorage", "sessionStorage", "indexedDB"].includes(source)),
    runtimeDetail: "persistent state source detected",
    confidence: { source: 0.22, ui: 0.08, tests: 0.14, runtime: 0.2, base: 0.36 },
  },
  {
    id: "route-identity",
    title: "Track normalized route identity separately from rendered content",
    shape: { type: "route-family", fields: ["pathname", "queryKeys", "fragmentPresent"] },
    sourceKind: "url",
    source: /\b(useParams|useRouter|useRoute|router|pathname|location\.(?:pathname|search|hash))\b/i,
    ui: /back|open|details|settings/i,
    tests: /route|navigation|back|url/i,
    runtime: (inspection) => inspection.runtime.routing.model !== "unknown",
    runtimeDetail: "router model detected",
    confidence: { source: 0.2, ui: 0.06, tests: 0.12, runtime: 0.24, base: 0.34 },
  },
  {
    id: "domain-graph-summary",
    title: "Track graph-like domain structure as stable counts and identities",
    shape: { type: "object", fields: ["nodeCount", "edgeCount", "selectedNodeId"] },
    sourceKind: "application-state",
    source: /\bdiagram\b|\b(nodes?|tables?)\b[\s\S]{0,1000}\b(edges?|relationships?|connections?)\b|\b(edges?|relationships?|connections?)\b[\s\S]{0,1000}\b(nodes?|tables?)\b/i,
    ui: /node|edge|relationship|diagram|table/i,
    tests: /node|edge|relationship|diagram|graph/i,
    confidence: { source: 0.26, ui: 0.1, tests: 0.16, base: 0.36 },
  },
];

export function proposeWebSemanticProjections(signals, inspection) {
  const candidates = [];
  for (const rule of RULES) {
    const source = matches(signals.sourceRecords, rule.source);
    const ui = uiEvidence(signals.uiVocabulary, rule.ui);
    const tests = testEvidence(signals.testTitles, rule.tests);
    const runtime = rule.runtime ? runtimeEvidence(inspection, rule.runtime, rule.runtimeDetail) : [];
    const evidence = [...source, ...tests, ...ui, ...runtime];
    if (evidence.length === 0) continue;
    let confidence = rule.confidence.base;
    if (source.length) confidence += rule.confidence.source ?? 0;
    if (ui.length) confidence += rule.confidence.ui ?? 0;
    if (tests.length) confidence += rule.confidence.tests ?? 0;
    if (runtime.length) confidence += rule.confidence.runtime ?? 0;
    confidence = Math.min(0.98, confidence);
    candidates.push({
      id: rule.id,
      title: rule.title,
      status: "review-only",
      sourceKind: rule.sourceKind,
      shape: rule.shape,
      confidence: Number(confidence.toFixed(2)),
      evidenceKinds: [...new Set(evidence.map((item) => item.kind))].sort(),
      evidence,
      suggestedHook: {
        kind: "state-projection",
        name: rule.id,
        outputShape: rule.shape,
        executableCode: null,
        contract: createProjectionHintContract({ selector: rule.id }),
      },
      automaticActivation: false,
    });
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  const stable = candidates.map(({ id, sourceKind, shape, confidence, evidenceKinds, automaticActivation }) => ({ id, sourceKind, shape, confidence, evidenceKinds, automaticActivation }));
  return {
    ok: true,
    runtime: "web-semantic-projection-candidates",
    version: WEB_SEMANTIC_PROJECTION_CANDIDATES_VERSION,
    candidateCount: candidates.length,
    candidates,
    automaticActivationCount: 0,
    executableCodeGenerated: false,
    semanticHash: semanticHash(stable),
  };
}

export function analyzeWebSemanticProjections(root, options = {}) {
  const signals = collectWebSemanticSignals(root, options);
  const inspection = inspectWebProject(root);
  return proposeWebSemanticProjections(signals, inspection);
}
