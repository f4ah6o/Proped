import { semanticHash } from "./ui-driver-v1.mjs";

export const SNAPSHOT_NORMALIZER_VERSION = "1";
const DROP_ATTRS = [/^data-react/, /^data-v-/, /^data-n-/, /^nonce$/, /^integrity$/, /^aria-owns$/];
const DROP_VALUES = [/^[0-9a-f]{8,}$/i, /^_?r_[0-9]+_?$/, /^:r[0-9]+:$/];

function normalizeScalar(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<token>")
    .replace(/\b(?:request|req|job|trace)-?\d+\b/gi, "<request-id>")
    .replace(/\s+/g, " ").trim();
}

export function normalizeElementIdentity(value) {
  if (!value) return undefined;
  return {
    role: normalizeScalar(value.role ?? ""),
    name: normalizeScalar(value.name ?? ""),
    ...(value.within?.length ? { within: value.within.map(normalizeScalar) } : {}),
    ...(value.testIdentity ? { testIdentity: normalizeScalar(value.testIdentity) } : {}),
  };
}

export function normalizeSemanticNode(node) {
  if (node == null || typeof node !== "object") return normalizeScalar(node);
  const attrs = {};
  for (const [key, raw] of Object.entries(node.attributes ?? {}).sort(([a],[b]) => a.localeCompare(b))) {
    if (DROP_ATTRS.some((pattern) => pattern.test(key))) continue;
    const value = normalizeScalar(raw);
    if ((key === "id" || key === "for") && DROP_VALUES.some((pattern) => pattern.test(value))) continue;
    attrs[key] = value;
  }
  return {
    role: normalizeScalar(node.role ?? node.tag ?? "generic"),
    name: normalizeScalar(node.name ?? ""),
    text: normalizeScalar(node.text ?? ""),
    attributes: attrs,
    children: (node.children ?? []).map(normalizeSemanticNode),
  };
}

function sortedObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, normalizeScalar(v)]));
}

export function createSemanticSnapshot(input) {
  const semanticDom = normalizeSemanticNode(input.semanticDom ?? { role: "document", children: [] });
  const forms = [...(input.forms ?? [])].map((form) => ({
    identity: normalizeElementIdentity(form.identity),
    value: normalizeScalar(form.value ?? ""),
    checked: Boolean(form.checked),
    selected: [...(form.selected ?? [])].map(normalizeScalar).sort(),
  })).sort((a,b) => semanticHash(a.identity).localeCompare(semanticHash(b.identity)));
  const pending = [...(input.pending ?? [])].map((effect) => ({
    kind: effect.kind,
    key: normalizeScalar(effect.key ?? effect.id ?? ""),
    generation: effect.generation ?? 0,
  })).sort((a,b) => semanticHash(a).localeCompare(semanticHash(b)));
  const canonical = {
    normalizerVersion: SNAPSHOT_NORMALIZER_VERSION,
    url: normalizeScalar(input.url ?? "/"),
    semanticDom, forms, focus: normalizeElementIdentity(input.focus),
    storage: { local: sortedObject(input.storage?.local), session: sortedObject(input.storage?.session) },
    pending, applicationState: input.applicationState ?? null,
  };
  const semanticDomHash = semanticHash(semanticDom);
  return {
    fingerprint: semanticHash(canonical), semanticDomHash,
    url: canonical.url, dom: JSON.stringify(semanticDom), focus: canonical.focus, forms,
    storage: canonical.storage, effects: input.effects ?? [], console: input.console ?? [], pending,
    applicationState: canonical.applicationState, normalizerVersion: SNAPSHOT_NORMALIZER_VERSION,
  };
}

export function compareSnapshotIdentity(previous, next) {
  if (previous.fingerprint !== next.fingerprint) return null;
  const evidence = {};
  for (const field of ["semanticDomHash", "url", "forms", "focus", "storage", "pending", "applicationState"]) {
    if (semanticHash(previous[field] ?? null) !== semanticHash(next[field] ?? null)) evidence[field] = { previous: previous[field], next: next[field] };
  }
  return Object.keys(evidence).length ? { kind: "state_identity_collision", fingerprint: previous.fingerprint, evidence } : null;
}
