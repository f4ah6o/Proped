import { evaluateWebProperties } from "./web-property-pack.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_HEALTHY_TRANSITION_BENCHMARK_VERSION = "1";

function snapshot({
  id,
  generation = 1,
  selectedEntityId = 1,
  entityIds = [1, 2, 3],
  pending = [],
  focus = { role: "button", name: "Primary", disabled: false, withinDialog: false },
  dialog = { open: false },
  disposed = false,
  console = [],
} = {}) {
  const semantic = { id, generation, selectedEntityId, entityIds, pending, focus, dialog, disposed, console };
  return {
    fingerprint: semanticHash(semantic),
    pending,
    focus,
    dialog,
    disposed,
    console,
    applicationState: { generation, selectedEntityId, entityIds },
  };
}

function healthyTransition(index) {
  const family = index % 10;
  const id = `healthy-${index}`;
  if (family === 0) {
    const before = snapshot({ id: `${id}-before` });
    const after = snapshot({ id: `${id}-after` });
    return { family: "click", before, action: { id: `${id}-click`, kind: "click" }, after };
  }
  if (family === 1) {
    const before = snapshot({ id: `${id}-before`, pending: [] });
    const after = snapshot({ id: `${id}-after`, pending: [{ kind: "submit", key: `submit-${index}`, generation: 1 }] });
    return { family: "submit", before, action: { id: `${id}-submit`, kind: "submit" }, after };
  }
  if (family === 2) {
    const before = snapshot({ id: `${id}-before`, pending: [{ kind: "submit", key: `submit-${index}`, generation: 1 }] });
    const after = snapshot({ id: `${id}-after`, pending: [] });
    return { family: "effect-complete", before, action: { id: `${id}-complete`, kind: "inject", input: { generation: 1 } }, after };
  }
  if (family === 3) {
    const before = snapshot({ id: `${id}-before`, selectedEntityId: 1 });
    const after = snapshot({ id: `${id}-after`, selectedEntityId: 2 });
    return { family: "select-valid-entity", before, action: { id: `${id}-select`, kind: "click" }, after };
  }
  if (family === 4) {
    const before = snapshot({ id: `${id}-before`, selectedEntityId: 2, entityIds: [1, 2, 3] });
    const after = snapshot({ id: `${id}-after`, selectedEntityId: null, entityIds: [1, 3] });
    return { family: "delete-selected-clear-selection", before, action: { id: `${id}-delete`, kind: "click" }, after };
  }
  if (family === 5) {
    const before = snapshot({ id: `${id}-before`, dialog: { open: false } });
    const after = snapshot({ id: `${id}-after`, dialog: { open: true }, focus: { role: "button", name: "Confirm", disabled: false, withinDialog: true } });
    return { family: "dialog-open", before, action: { id: `${id}-open`, kind: "click" }, after };
  }
  if (family === 6) {
    const before = snapshot({ id: `${id}-before`, dialog: { open: true }, focus: { role: "button", name: "Confirm", disabled: false, withinDialog: true } });
    const after = snapshot({ id: `${id}-after`, dialog: { open: false }, focus: { role: "button", name: "Open", disabled: false, withinDialog: false } });
    return { family: "dialog-close-focus-restored", before, action: { id: `${id}-close`, kind: "click" }, after };
  }
  if (family === 7) {
    const before = snapshot({ id: `${id}-before`, generation: 3 });
    const after = snapshot({ id: `${id}-after`, generation: 3 });
    return { family: "current-generation-response", before, action: { id: `${id}-response`, kind: "inject", input: { generation: 3 } }, after };
  }
  if (family === 8) {
    const before = snapshot({ id: `${id}-before`, pending: [] });
    const after = snapshot({ id: `${id}-after`, pending: [], disposed: true, selectedEntityId: null, entityIds: [] });
    return { family: "dispose-clean", before, action: { id: `${id}-dispose`, kind: "dispose" }, after };
  }
  const before = snapshot({ id: `${id}-before` });
  const after = snapshot({ id: `${id}-after` });
  return {
    family: "deterministic-replay",
    before,
    action: { id: `${id}-replay`, kind: "replay" },
    after,
    replay: { firstHash: "same", secondHash: "same" },
  };
}

export function runHealthyTransitionBenchmark({ transitions = 10_000, maximumFalsePositivesPerThousand = 1 } = {}) {
  if (!Number.isSafeInteger(transitions) || transitions < 1_000) throw new Error("healthy transition benchmark requires at least 1000 transitions");
  if (typeof maximumFalsePositivesPerThousand !== "number" || maximumFalsePositivesPerThousand <= 0) throw new Error("maximumFalsePositivesPerThousand must be positive");
  const families = new Map();
  const violations = [];
  for (let index = 0; index < transitions; index += 1) {
    const item = healthyTransition(index);
    families.set(item.family, (families.get(item.family) ?? 0) + 1);
    const found = evaluateWebProperties(item);
    for (const violation of found) violations.push({ transition: index, family: item.family, code: violation.code, severity: violation.severity });
  }
  const falsePositiveCount = violations.length;
  const falsePositiveRate = falsePositiveCount / transitions;
  const falsePositivesPerThousand = falsePositiveRate * 1000;

  // Sensitivity controls prove that the benchmark is exercising live property checks.
  const invalidEntityBefore = snapshot({ id: "control-entity-before", selectedEntityId: 1, entityIds: [1, 2] });
  const invalidEntityAfter = snapshot({ id: "control-entity-after", selectedEntityId: 99, entityIds: [1, 2] });
  const duplicateBefore = snapshot({ id: "control-submit-before", pending: [{ kind: "submit", key: "first", generation: 1 }] });
  const duplicateAfter = snapshot({ id: "control-submit-after", pending: [{ kind: "submit", key: "first", generation: 1 }, { kind: "submit", key: "second", generation: 1 }] });
  const controls = [
    ...evaluateWebProperties({ before: invalidEntityBefore, action: { id: "control-invalid-entity", kind: "click" }, after: invalidEntityAfter }),
    ...evaluateWebProperties({ before: duplicateBefore, action: { id: "control-duplicate-submit", kind: "submit" }, after: duplicateAfter }),
  ];
  const qualityGate = {
    ok: falsePositivesPerThousand < maximumFalsePositivesPerThousand && controls.length >= 2,
    target: `< ${maximumFalsePositivesPerThousand} / 1000 transitions`,
    falsePositivesPerThousand,
    sensitivityControlViolationCodes: [...new Set(controls.map((item) => item.code))].sort(),
  };
  const stable = {
    version: WEB_HEALTHY_TRANSITION_BENCHMARK_VERSION,
    transitions,
    familyCounts: Object.fromEntries([...families.entries()].sort(([a], [b]) => a.localeCompare(b))),
    falsePositiveCount,
    falsePositiveRate,
    falsePositivesPerThousand,
    violations,
    qualityGate,
  };
  return {
    ok: qualityGate.ok,
    runtime: "web-healthy-transition-benchmark",
    ...stable,
    semanticHash: semanticHash(stable),
  };
}
