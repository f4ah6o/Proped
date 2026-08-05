import { failureSignature, semanticHash } from "./ui-driver-v1.mjs";

export const PROPERTY_CODES = Object.freeze({
  STALE_RESPONSE: "stale_response",
  DUPLICATE_SUBMIT: "duplicate_submit",
  PENDING_EFFECT_LEAK: "pending_effect_leak",
  FOCUS_INTEGRITY: "focus_integrity",
  ENTITY_CONSISTENCY: "entity_consistency",
  HYDRATION_WARNING: "hydration_warning",
  UNHANDLED_EXCEPTION: "unhandled_exception",
  DETERMINISTIC_REPLAY: "deterministic_replay",
});

export const DEFAULT_POLICY = Object.freeze({
  stale_response: "error", duplicate_submit: "error", pending_effect_leak: "error",
  focus_integrity: "warning", entity_consistency: "error", hydration_warning: "error",
  unhandled_exception: "error", deterministic_replay: "error",
});

function violation(code, message, evidence, policy) {
  return { code, severity: policy[code] ?? "off", message, evidence };
}

export function evaluateWebProperties({ before, action, after, replay, policy = DEFAULT_POLICY }) {
  const out = [];
  const pendingBefore = before.pending ?? [];
  const pendingAfter = after.pending ?? [];
  if (action?.kind === "inject" && action?.input?.generation != null &&
      action.input.generation < (before.applicationState?.generation ?? 0) &&
      after.fingerprint !== before.fingerprint) {
    out.push(violation(PROPERTY_CODES.STALE_RESPONSE, "stale response changed current state", { generation: action.input.generation, currentGeneration: before.applicationState?.generation }, policy));
  }
  if (action?.kind === "submit" && pendingBefore.some((x) => x.kind === "submit") &&
      pendingAfter.filter((x) => x.kind === "submit").length > pendingBefore.filter((x) => x.kind === "submit").length) {
    out.push(violation(PROPERTY_CODES.DUPLICATE_SUBMIT, "submit created a duplicate pending effect", { before: pendingBefore, after: pendingAfter }, policy));
  }
  if (after.disposed && pendingAfter.length > 0) {
    out.push(violation(PROPERTY_CODES.PENDING_EFFECT_LEAK, "disposed state retained pending work", { pending: pendingAfter }, policy));
  }
  if (after.focus?.disabled === true || (before.dialog?.open && !after.dialog?.open && after.focus?.withinDialog)) {
    out.push(violation(PROPERTY_CODES.FOCUS_INTEGRITY, "focus points to an invalid target", { focus: after.focus }, policy));
  }
  const selected = after.applicationState?.selectedEntityId;
  const entities = after.applicationState?.entityIds;
  if (selected != null && Array.isArray(entities) && !entities.includes(selected)) {
    out.push(violation(PROPERTY_CODES.ENTITY_CONSISTENCY, "selected entity does not exist", { selected, entities }, policy));
  }
  const consoleEntries = after.console ?? [];
  if (consoleEntries.some((entry) => entry.kind === "hydration" || /hydration/i.test(entry.message ?? ""))) {
    out.push(violation(PROPERTY_CODES.HYDRATION_WARNING, "hydration warning was recorded", { console: consoleEntries }, policy));
  }
  if (consoleEntries.some((entry) => entry.kind === "uncaught" || entry.kind === "unhandledrejection")) {
    out.push(violation(PROPERTY_CODES.UNHANDLED_EXCEPTION, "unhandled runtime failure was recorded", { console: consoleEntries }, policy));
  }
  if (replay && replay.firstHash !== replay.secondHash) {
    out.push(violation(PROPERTY_CODES.DETERMINISTIC_REPLAY, "fresh replay produced a different semantic hash", replay, policy));
  }
  return out.filter((item) => item.severity !== "off");
}

export function buildPropertyFailure({ fixture, trace, snapshot, violation: item, seed = 1 }) {
  return {
    property: item.code,
    message: item.message,
    severity: item.severity,
    evidence: item.evidence,
    signature: failureSignature({
      fixture, property: item.code, failureClass: item.code, trace,
      snapshotHash: snapshot.fingerprint, seed, normalizerVersion: "1",
    }),
  };
}

export function propertyPackSemanticHash(result) { return semanticHash(result); }
