#!/usr/bin/env node
import assert from "node:assert/strict";
import { exploreMultiContextSchedules, replayMultiContextSchedule } from "../protocol/web-multi-context-scheduler.mjs";

const scenario = {
  initialState() {
    return {
      shared: { value: 0, version: 0, writes: [] },
      contexts: {
        a: { readValue: null, readVersion: null, wrote: false },
        b: { readValue: null, readVersion: null, wrote: false },
      },
    };
  },
  actions(state, contextId) {
    const local = state.contexts[contextId];
    if (local.readVersion === null) return [{ id: "read" }];
    if (!local.wrote) return [{ id: "write-increment" }];
    return [];
  },
  transition(state, contextId, action) {
    const local = state.contexts[contextId];
    if (action.id === "read") {
      local.readValue = state.shared.value;
      local.readVersion = state.shared.version;
      return state;
    }
    if (action.id === "write-increment") {
      state.shared.value = local.readValue + 1;
      state.shared.version += 1;
      state.shared.writes.push({ contextId, basedOnVersion: local.readVersion });
      local.wrote = true;
      return state;
    }
    throw new Error(`unknown action ${action.id}`);
  },
  invariant(state) {
    const bothWrote = state.contexts.a.wrote && state.contexts.b.wrote;
    if (!bothWrote) return [];
    if (state.shared.value !== 2) {
      return [{ property: "lost_update", failureClass: "shared_state_race", message: "two successful increments produced a value other than 2", evidence: { value: state.shared.value, writes: state.shared.writes } }];
    }
    return [];
  },
};

const first = exploreMultiContextSchedules(scenario, { contextIds: ["a", "b"], maxDepth: 4, maxTransitions: 200, maxStates: 100 });
assert.ok(first.states > 1);
assert.ok(first.transitions > 1);
assert.ok(first.failures.some((failure) => failure.property === "lost_update"));
const failure = first.failures.find((candidate) => candidate.property === "lost_update");
assert.equal(failure.trace.length, 4);
assert.equal(new Set(failure.trace.map((step) => step.contextId)).size, 2);

const replay = replayMultiContextSchedule(scenario, failure.trace);
assert.equal(replay.ok, true);
assert.ok(replay.violations.some((violation) => violation.property === "lost_update"));
assert.equal(replay.violations[0].signature.semanticHash, failure.signature.semanticHash);

const second = exploreMultiContextSchedules(scenario, { contextIds: ["a", "b"], maxDepth: 4, maxTransitions: 200, maxStates: 100 });
assert.equal(second.semanticHash, first.semanticHash);
assert.deepEqual(second.transitionGraph, first.transitionGraph);

const shallow = exploreMultiContextSchedules(scenario, { contextIds: ["a", "b"], maxDepth: 3, maxTransitions: 200, maxStates: 100 });
assert.equal(shallow.failures.length, 0);
assert.equal(shallow.depthBoundReached, true);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-multi-context-scheduler-test",
  contexts: first.contextIds,
  states: first.states,
  transitions: first.transitions,
  failure: failure.property,
  failureTrace: failure.trace,
  deterministic: second.semanticHash === first.semanticHash,
  replaySignatureMatches: replay.violations[0].signature.semanticHash === failure.signature.semanticHash,
}));
