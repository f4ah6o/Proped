import { performance } from "node:perf_hooks";
import { semanticHash } from "./ui-driver-v1.mjs";
import {
  buildPropertyFailure,
  evaluateWebProperties,
} from "./web-property-pack.mjs";

export const WEB_MUTATION_BENCHMARK_VERSION = "1";
export const DEFAULT_BENCHMARK_ITERATIONS = 1_000;

const noop = (id) => ({ id, kind: "noop" });

function baseState(overrides = {}) {
  return {
    generation: 0,
    result: null,
    pending: [],
    disposed: false,
    dialog: { open: false },
    focus: { role: "button", name: "Open dialog", withinDialog: false, disabled: false },
    entityIds: [1, 2],
    selectedEntityId: null,
    console: [],
    ...structuredClone(overrides),
  };
}

function stateSnapshot(state) {
  const canonical = {
    pending: state.pending,
    disposed: state.disposed,
    dialog: state.dialog,
    focus: state.focus,
    applicationState: {
      generation: state.generation,
      result: state.result,
      entityIds: state.entityIds,
      selectedEntityId: state.selectedEntityId,
    },
    console: state.console,
  };
  return {
    ...canonical,
    fingerprint: semanticHash(canonical),
  };
}

function cloneState(state) {
  return structuredClone(state);
}

export const WEB_MUTATION_SCENARIOS = Object.freeze([
  {
    id: "remove_stale_generation_guard",
    property: "stale_response",
    expectedMinimalLength: 3,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|stale-start"),
      { id: 'issue|network|search|query="a"', kind: "issue", input: { query: "a" } },
      { id: 'issue|network|search|query="ab"', kind: "issue", input: { query: "ab" } },
      { id: 'inject|network|Search response|generation=1|query="a"', kind: "inject", input: { generation: 1, query: "a" } },
      noop("noop|benchmark|stale-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "issue") {
        state.generation += 1;
        state.pending.push({ kind: "network", key: `search:${action.input.query}`, generation: state.generation });
      } else if (action.kind === "inject" && mutant && action.input.generation < state.generation) {
        state.result = `results:${action.input.query}`;
      }
    },
  },
  {
    id: "allow_duplicate_submit",
    property: "duplicate_submit",
    expectedMinimalLength: 2,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|submit-start"),
      { id: "submit|form|Profile", kind: "submit" },
      { id: "submit|form|Profile", kind: "submit" },
      noop("noop|benchmark|submit-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind !== "submit") return;
      const existing = state.pending.filter((effect) => effect.kind === "submit").length;
      if (existing === 0 || mutant) {
        state.pending.push({ kind: "submit", key: "submit:Profile", generation: existing + 1 });
      }
    },
  },
  {
    id: "skip_effect_cleanup",
    property: "pending_effect_leak",
    expectedMinimalLength: 2,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|cleanup-start"),
      { id: "schedule|timer|refresh", kind: "schedule" },
      { id: "dispose|fixture|Profile", kind: "dispose" },
      noop("noop|benchmark|cleanup-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "schedule") {
        state.pending.push({ kind: "timer", key: "refresh", generation: 1 });
      } else if (action.kind === "dispose") {
        state.disposed = true;
        if (!mutant) state.pending = [];
      }
    },
  },
  {
    id: "retain_dialog_focus",
    property: "focus_integrity",
    expectedMinimalLength: 2,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|focus-start"),
      { id: "open|dialog|Confirm", kind: "open" },
      { id: "close|dialog|Confirm", kind: "close" },
      noop("noop|benchmark|focus-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "open") {
        state.dialog = { open: true };
        state.focus = { role: "button", name: "Confirm", withinDialog: true, disabled: false };
      } else if (action.kind === "close" && state.dialog.open) {
        state.dialog = { open: false };
        state.focus = mutant
          ? { role: "button", name: "Confirm", withinDialog: true, disabled: false }
          : { role: "button", name: "Open dialog", withinDialog: false, disabled: false };
      }
    },
  },
  {
    id: "retain_deleted_selection",
    property: "entity_consistency",
    expectedMinimalLength: 2,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|entity-start"),
      { id: "select|entity|2", kind: "select", input: { entityId: 2 } },
      { id: "delete|entity|2", kind: "delete", input: { entityId: 2 } },
      noop("noop|benchmark|entity-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "select" && state.entityIds.includes(action.input.entityId)) {
        state.selectedEntityId = action.input.entityId;
      } else if (action.kind === "delete") {
        state.entityIds = state.entityIds.filter((id) => id !== action.input.entityId);
        if (!mutant && state.selectedEntityId === action.input.entityId) state.selectedEntityId = null;
      }
    },
  },
  {
    id: "render_hydration_drift",
    property: "hydration_warning",
    expectedMinimalLength: 1,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|hydration-start"),
      { id: "hydrate|document|Profile", kind: "hydrate" },
      noop("noop|benchmark|hydration-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "hydrate" && mutant) {
        state.console.push({ kind: "hydration", message: "Hydration completed but contains mismatches." });
      }
    },
  },
  {
    id: "drop_exception_boundary",
    property: "unhandled_exception",
    expectedMinimalLength: 1,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|exception-start"),
      { id: "click|button|Crash", kind: "click" },
      noop("noop|benchmark|exception-end"),
    ],
    apply(state, action, mutant) {
      if (action.kind === "click" && mutant) {
        state.console.push({ kind: "uncaught", message: "synthetic render failure" });
      }
    },
  },
  {
    id: "randomize_replay_state",
    property: "deterministic_replay",
    expectedMinimalLength: 1,
    initial: () => baseState(),
    trace: [
      noop("noop|benchmark|replay-start"),
      { id: "replay|fixture|Profile", kind: "replay" },
      noop("noop|benchmark|replay-end"),
    ],
    apply() {},
    replay(mutant) {
      return mutant
        ? { firstHash: "fresh-a", secondHash: "fresh-b" }
        : { firstHash: "fresh-a", secondHash: "fresh-a" };
    },
  },
]);

export function runMutationScenario(scenario, { mutant, trace = scenario.trace } = {}) {
  const state = scenario.initial();
  const violations = [];
  const transitions = [];
  for (const action of trace) {
    const before = stateSnapshot(state);
    const next = cloneState(state);
    scenario.apply(next, action, mutant);
    const after = stateSnapshot(next);
    const detected = evaluateWebProperties({
      before,
      action,
      after,
      replay: action.kind === "replay" ? scenario.replay?.(mutant) : undefined,
    });
    transitions.push({ action, before, after, violations: detected });
    violations.push(...detected);
    Object.assign(state, next);
  }
  return {
    mutant,
    trace,
    transitions,
    violations,
    targeted: violations.find((violation) => violation.code === scenario.property) ?? null,
    finalSnapshot: transitions.at(-1)?.after ?? stateSnapshot(state),
  };
}

export function shrinkMutationTrace(scenario, trace = scenario.trace) {
  let current = [...trace];
  let attempts = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.length; index += 1) {
      const candidate = current.filter((_, candidateIndex) => candidateIndex !== index);
      attempts += 1;
      if (runMutationScenario(scenario, { mutant: true, trace: candidate }).targeted) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return { trace: current, attempts };
}

export function evaluateMutationCatalog({ seed = 43 } = {}) {
  const mutations = [];
  const controls = [];
  for (const scenario of WEB_MUTATION_SCENARIOS) {
    const shrunk = shrinkMutationTrace(scenario);
    const first = runMutationScenario(scenario, { mutant: true, trace: shrunk.trace });
    const second = runMutationScenario(scenario, { mutant: true, trace: shrunk.trace });
    const healthy = runMutationScenario(scenario, { mutant: false, trace: scenario.trace });
    const killed = Boolean(first.targeted);
    const firstFailure = killed
      ? buildPropertyFailure({
          fixture: `web-mutation-${scenario.id}`,
          trace: shrunk.trace,
          snapshot: first.finalSnapshot,
          violation: first.targeted,
          seed,
        })
      : null;
    const secondFailure = killed
      ? buildPropertyFailure({
          fixture: `web-mutation-${scenario.id}`,
          trace: shrunk.trace,
          snapshot: second.finalSnapshot,
          violation: second.targeted,
          seed,
        })
      : null;
    mutations.push({
      operator: scenario.id,
      property: scenario.property,
      killed,
      originalTraceLength: scenario.trace.length,
      minimalTraceLength: shrunk.trace.length,
      minimalTrace: shrunk.trace.map((action) => action.id),
      shrinkAttempts: shrunk.attempts,
      expectedMinimalLength: scenario.expectedMinimalLength,
      signature: firstFailure?.signature.semanticHash ?? null,
      deterministicReplay: firstFailure?.signature.semanticHash === secondFailure?.signature.semanticHash,
      snapshotHash: first.finalSnapshot.fingerprint,
    });
    controls.push({
      operator: scenario.id,
      property: scenario.property,
      violationCount: healthy.violations.length,
      targetedViolation: Boolean(healthy.targeted),
    });
  }

  const killed = mutations.filter((mutation) => mutation.killed).length;
  const falsePositiveCount = controls.filter((control) => control.violationCount > 0).length;
  return {
    benchmarkVersion: WEB_MUTATION_BENCHMARK_VERSION,
    seed,
    mutationCount: mutations.length,
    killedCount: killed,
    survivedCount: mutations.length - killed,
    mutationScore: killed / mutations.length,
    falsePositiveControlCount: controls.length,
    falsePositiveCount,
    falsePositiveRate: falsePositiveCount / controls.length,
    originalTraceActions: mutations.reduce((total, mutation) => total + mutation.originalTraceLength, 0),
    minimalTraceActions: mutations.reduce((total, mutation) => total + mutation.minimalTraceLength, 0),
    mutations,
    controls,
  };
}

export function measureMutationThroughput({ iterations = DEFAULT_BENCHMARK_ITERATIONS } = {}) {
  const transitionsPerIteration = WEB_MUTATION_SCENARIOS.reduce(
    (total, scenario) => total + (scenario.trace.length * 2),
    0,
  );
  const started = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const scenario of WEB_MUTATION_SCENARIOS) {
      runMutationScenario(scenario, { mutant: true });
      runMutationScenario(scenario, { mutant: false });
    }
  }
  const elapsedMs = performance.now() - started;
  const transitionCount = transitionsPerIteration * iterations;
  return {
    iterations,
    transitionCount,
    elapsedMs,
    transitionsPerSecond: transitionCount / (elapsedMs / 1_000),
  };
}
