import { semanticHash } from "./ui-driver-v1.mjs";

const ACTION_ROLES = new Map([
  ["button", ["click"]], ["link", ["click"]], ["checkbox", ["check", "uncheck"]],
  ["radio", ["select"]], ["textbox", ["clear", "type"]], ["searchbox", ["clear", "type"]],
  ["spinbutton", ["clear", "type"]], ["combobox", ["select"]], ["listbox", ["select"]],
  ["form", ["submit"]], ["dialog", ["confirm", "cancel", "close"]],
]);

export const DEFAULT_INPUT_CORPUS = Object.freeze(["", " ", "0", "-1", "1", "valid", "invalid", "😀", "a".repeat(64)]);

function normalizeText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function scopeIdentity(element) { return (element.within ?? []).map(normalizeText).filter(Boolean); }
function targetIdentity(element) {
  const target = { role: normalizeText(element.role), name: normalizeText(element.name), within: scopeIdentity(element) };
  if (element.testIdentity) target.testIdentity = normalizeText(element.testIdentity);
  return target;
}
function canonicalTarget(target) {
  return [target.role, target.name, ...(target.within ?? []).map((v) => `within=${v}`), target.testIdentity ? `test=${target.testIdentity}` : ""].filter(Boolean).join("|");
}
function actionId(kind, target, input) {
  const inputPart = input === undefined ? "" : `|input=${JSON.stringify(input)}`;
  return `${kind}|${canonicalTarget(target)}${inputPart}`;
}
function actionLabel(kind, target, input) {
  const base = `${kind} ${target.role} "${target.name}"`;
  return input === undefined ? base : `${base} with ${JSON.stringify(input)}`;
}
function optionsFor(element) {
  if (Array.isArray(element.options)) return element.options.map(normalizeText).filter(Boolean);
  return [];
}

export function discoverAccessibleActions(elements, { inputCorpus = DEFAULT_INPUT_CORPUS } = {}) {
  const candidates = [];
  const diagnostics = [];
  for (const raw of elements) {
    if (!raw || raw.hidden || raw.disabled) continue;
    const role = normalizeText(raw.role);
    const name = normalizeText(raw.name ?? raw.label);
    if (!role || !name || !ACTION_ROLES.has(role)) continue;
    const target = targetIdentity({ ...raw, role, name });
    for (const kind of ACTION_ROLES.get(role)) {
      if (kind === "check" && raw.checked === true) continue;
      if (kind === "uncheck" && raw.checked !== true) continue;
      if (kind === "type") {
        for (const input of inputCorpus) candidates.push({ id: actionId(kind, target, input), kind, target, input, label: actionLabel(kind, target, input), ambiguity: "none" });
      } else if (kind === "select") {
        const options = optionsFor(raw);
        if (role === "radio" && options.length === 0) candidates.push({ id: actionId(kind, target), kind, target, label: actionLabel(kind, target), ambiguity: "none" });
        else for (const input of options) candidates.push({ id: actionId(kind, target, input), kind, target, input, label: actionLabel(kind, target, input), ambiguity: "none" });
      } else {
        candidates.push({ id: actionId(kind, target), kind, target, label: actionLabel(kind, target), ambiguity: "none" });
      }
    }
  }

  const byId = new Map();
  for (const action of candidates) {
    const bucket = byId.get(action.id) ?? [];
    bucket.push(action);
    byId.set(action.id, bucket);
  }
  const actions = [];
  for (const [id, bucket] of [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (bucket.length === 1) actions.push(bucket[0]);
    else diagnostics.push({ kind: "ambiguous_action", actionId: id, count: bucket.length, target: bucket[0].target, message: "multiple accessible elements share the same stable action identity" });
  }
  return { actions, diagnostics, semanticHash: semanticHash({ actions, diagnostics }) };
}
