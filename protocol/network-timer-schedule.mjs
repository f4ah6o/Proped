import {
  ERROR_CODES,
  ProtocolError,
  failureSignature,
  semanticHash,
} from "./ui-driver-v1.mjs";

export const SCHEDULE_PROPERTY_CODES = Object.freeze({
  STALE_RESPONSE: "stale_response",
  ABORTED_RESPONSE_COMMIT: "aborted_response_commit",
  RETRY_BUDGET_EXCEEDED: "retry_budget_exceeded",
  CALLBACK_COUNT_EXCEEDED: "callback_count_exceeded",
});

export const DEFAULT_SCHEDULE_POLICY = Object.freeze({
  realNetwork: "deny",
  realTimers: "deny",
  maxGenerations: 2,
  retryBudget: 1,
  retryDelayMs: 100,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  ));
}

function violation(code, message, evidence) {
  return { code, severity: "error", message, evidence };
}

export class VirtualNetworkTimerRuntime {
  constructor({
    inputCorpus = ["a", "ab"],
    policy = {},
    faults = {},
  } = {}) {
    this.inputCorpus = [...inputCorpus];
    this.policy = { ...DEFAULT_SCHEDULE_POLICY, ...policy };
    this.faults = {
      commitStaleResponses: false,
      commitAbortedResponses: false,
      duplicateRetryTimers: false,
      duplicateCallbacks: false,
      ...faults,
    };
    this.reset();
  }

  reset(seed = 1, fixture = "network-timer-faults") {
    this.seed = seed;
    this.fixture = fixture;
    this.nowMs = 0;
    this.generation = 0;
    this.nextRequestId = 1;
    this.nextTimerId = 1;
    this.result = "initial";
    this.requests = [];
    this.timers = [];
    this.retryCounts = {};
    this.callbackCounts = {};
    this.commitLog = [];
    this.eventLog = [];
    this.disposed = false;
    return this.snapshot();
  }

  ensureActive() {
    if (this.disposed) {
      throw new ProtocolError(ERROR_CODES.DISPOSED, "virtual schedule is disposed");
    }
  }

  attemptExternalEffect(kind, descriptor = {}) {
    const denied = kind === "network" || kind === "timer";
    if (denied) {
      throw new ProtocolError(
        ERROR_CODES.UNSUPPORTED_EFFECT,
        `real ${kind} is denied; inject a deterministic descriptor instead`,
        { kind, descriptor, policy: kind === "network" ? this.policy.realNetwork : this.policy.realTimers },
      );
    }
    throw new ProtocolError(
      ERROR_CODES.UNSUPPORTED_EFFECT,
      `unsupported external effect: ${kind}`,
      { kind, descriptor },
    );
  }

  issueRequest(query, { generation = null, attempt = 1, retryOf = null } = {}) {
    const requestGeneration = generation ?? this.generation + 1;
    if (generation == null) this.generation = requestGeneration;
    const id = `req-${this.nextRequestId}`;
    this.nextRequestId += 1;
    const logicalKey = `search:${requestGeneration}`;
    const request = {
      id,
      logicalKey,
      query,
      generation: requestGeneration,
      attempt,
      retryBudget: this.policy.retryBudget,
      retryOf,
      status: "pending",
    };
    this.requests.push(request);
    this.callbackCounts[id] = 0;
    this.eventLog.push({ kind: "issue", requestId: id, generation: requestGeneration, attempt });
    return request;
  }

  scheduleRetry(request) {
    const copies = this.faults.duplicateRetryTimers ? 2 : 1;
    for (let index = 0; index < copies; index += 1) {
      const timer = {
        id: `timer-${this.nextTimerId}`,
        ownerRequestId: request.id,
        logicalKey: request.logicalKey,
        dueAtMs: this.nowMs + this.policy.retryDelayMs,
        status: "pending",
      };
      this.nextTimerId += 1;
      this.timers.push(timer);
      this.eventLog.push({ kind: "schedule_timer", timerId: timer.id, ownerRequestId: request.id });
    }
  }

  actions() {
    this.ensureActive();
    const actions = [];
    if (this.generation < this.policy.maxGenerations) {
      for (const query of this.inputCorpus) {
        actions.push({
          id: `issue|network|search|query=${JSON.stringify(query)}`,
          kind: "issue",
          target: { role: "network", name: "Search request" },
          input: { query },
          label: `Issue search ${JSON.stringify(query)}`,
        });
      }
    }

    for (const request of this.requests) {
      if (request.status === "pending") {
        actions.push({
          id: `abort|network|${request.id}`,
          kind: "abort",
          target: { role: "network", name: request.id },
          input: { requestId: request.id },
          label: `Abort ${request.id}`,
        });
        actions.push({
          id: `fail|network|${request.id}`,
          kind: "fail",
          target: { role: "network", name: request.id },
          input: { requestId: request.id },
          label: `Reject ${request.id}`,
        });
      }
      if (request.status === "pending" || request.status === "aborted") {
        actions.push({
          id: `deliver|network|${request.id}`,
          kind: "deliver",
          target: { role: "network", name: request.id },
          input: { requestId: request.id },
          label: `Deliver ${request.id}`,
        });
      }
    }

    const futureDueTimes = [...new Set(this.timers
      .filter((timer) => timer.status === "pending" && timer.dueAtMs > this.nowMs)
      .map((timer) => timer.dueAtMs))].sort((left, right) => left - right);
    for (const dueAtMs of futureDueTimes) {
      actions.push({
        id: `advance|timer|to=${dueAtMs}`,
        kind: "advance",
        target: { role: "timer", name: "Virtual clock" },
        input: { nowMs: dueAtMs },
        label: `Advance virtual time to ${dueAtMs}`,
      });
    }
    for (const timer of this.timers) {
      if (timer.status === "pending" && timer.dueAtMs <= this.nowMs) {
        actions.push({
          id: `fire|timer|${timer.id}`,
          kind: "fire",
          target: { role: "timer", name: timer.id },
          input: { timerId: timer.id },
          label: `Fire ${timer.id}`,
        });
      }
    }

    return actions.sort((left, right) => left.id.localeCompare(right.id));
  }

  findRequest(id) {
    const request = this.requests.find((candidate) => candidate.id === id);
    if (!request) throw new Error(`unknown request: ${id}`);
    return request;
  }

  findTimer(id) {
    const timer = this.timers.find((candidate) => candidate.id === id);
    if (!timer) throw new Error(`unknown timer: ${id}`);
    return timer;
  }

  execute(action) {
    this.ensureActive();
    const available = this.actions().find((candidate) => candidate.id === action.id);
    if (!available) throw new Error(`schedule action is not currently available: ${action.id}`);
    const before = this.snapshot();

    if (available.kind === "issue") {
      this.issueRequest(available.input.query);
    } else if (available.kind === "abort") {
      const request = this.findRequest(available.input.requestId);
      request.status = "aborted";
      this.eventLog.push({ kind: "abort", requestId: request.id });
    } else if (available.kind === "fail") {
      const request = this.findRequest(available.input.requestId);
      request.status = "failed";
      this.eventLog.push({ kind: "fail", requestId: request.id, attempt: request.attempt });
      if (request.attempt <= request.retryBudget) this.scheduleRetry(request);
    } else if (available.kind === "advance") {
      this.nowMs = available.input.nowMs;
      this.eventLog.push({ kind: "advance", nowMs: this.nowMs });
    } else if (available.kind === "fire") {
      const timer = this.findTimer(available.input.timerId);
      timer.status = "fired";
      const owner = this.findRequest(timer.ownerRequestId);
      this.retryCounts[owner.logicalKey] = (this.retryCounts[owner.logicalKey] ?? 0) + 1;
      const retry = this.issueRequest(owner.query, {
        generation: owner.generation,
        attempt: owner.attempt + 1,
        retryOf: owner.id,
      });
      this.eventLog.push({ kind: "fire", timerId: timer.id, requestId: retry.id });
    } else if (available.kind === "deliver") {
      const request = this.findRequest(available.input.requestId);
      const callbackInvocations = this.faults.duplicateCallbacks ? 2 : 1;
      for (let index = 0; index < callbackInvocations; index += 1) {
        this.callbackCounts[request.id] += 1;
        const stale = request.generation < this.generation;
        const aborted = request.status === "aborted";
        const shouldCommit = (!stale && !aborted) ||
          (stale && this.faults.commitStaleResponses) ||
          (aborted && this.faults.commitAbortedResponses);
        if (shouldCommit) {
          this.result = `result:${request.query}:attempt:${request.attempt}`;
          this.commitLog.push({
            requestId: request.id,
            generation: request.generation,
            attempt: request.attempt,
            callback: this.callbackCounts[request.id],
          });
        }
      }
      request.status = "completed";
      this.eventLog.push({ kind: "deliver", requestId: request.id, callbacks: callbackInvocations });
    }

    const after = this.snapshot();
    return {
      snapshot: after,
      violations: evaluateNetworkTimerProperties({ before, action: available, after }),
      settle: {
        status: "settled",
        microtasks: 0,
        timers: available.kind === "fire" ? 1 : 0,
        renders: 0,
        elapsedMs: 0,
        virtualNowMs: this.nowMs,
      },
      emittedEffects: after.effects,
    };
  }

  snapshot() {
    const requests = this.requests.map((request) => ({ ...request }));
    const timers = this.timers.map((timer) => ({ ...timer }));
    const retryCounts = sortedObject(this.retryCounts);
    const callbackCounts = sortedObject(this.callbackCounts);
    const pending = [
      ...requests.filter((request) => request.status === "pending" || request.status === "aborted").map((request) => ({
        kind: "network",
        key: request.logicalKey,
        generation: request.generation,
        attempt: request.attempt,
        status: request.status,
      })),
      ...timers.filter((timer) => timer.status === "pending").map((timer) => ({
        kind: "timer",
        key: timer.logicalKey,
        dueAtMs: timer.dueAtMs,
      })),
    ];
    const applicationState = {
      fixture: this.fixture,
      seed: this.seed,
      nowMs: this.nowMs,
      generation: this.generation,
      result: this.result,
      requests,
      timers,
      retryCounts,
      callbackCounts,
      commitLog: clone(this.commitLog),
      policy: clone(this.policy),
    };
    return {
      url: `virtual://${this.fixture}`,
      pending,
      effects: clone(pending),
      console: [],
      disposed: this.disposed,
      applicationState,
      fingerprint: semanticHash(applicationState),
    };
  }

  dispose() {
    this.disposed = true;
    return { disposed: true };
  }
}

export function evaluateNetworkTimerProperties({ before, action, after }) {
  const out = [];
  const beforeState = before.applicationState;
  const afterState = after.applicationState;
  if (action.kind === "deliver") {
    const request = beforeState.requests.find((candidate) =>
      candidate.id === action.input.requestId
    );
    if (request) {
      const resultChanged = beforeState.result !== afterState.result;
      if (request.generation < beforeState.generation && resultChanged) {
        out.push(violation(
          SCHEDULE_PROPERTY_CODES.STALE_RESPONSE,
          "stale response changed the current result",
          { requestId: request.id, requestGeneration: request.generation, currentGeneration: beforeState.generation },
        ));
      }
      if (request.status === "aborted" && resultChanged) {
        out.push(violation(
          SCHEDULE_PROPERTY_CODES.ABORTED_RESPONSE_COMMIT,
          "aborted response committed application state",
          { requestId: request.id, result: afterState.result },
        ));
      }
    }
  }

  for (const [requestId, count] of Object.entries(afterState.callbackCounts)) {
    if (count > 1) {
      out.push(violation(
        SCHEDULE_PROPERTY_CODES.CALLBACK_COUNT_EXCEEDED,
        "a network completion callback ran more than once",
        { requestId, count },
      ));
      break;
    }
  }

  for (const request of afterState.requests) {
    const count = afterState.retryCounts[request.logicalKey] ?? 0;
    if (count > request.retryBudget) {
      out.push(violation(
        SCHEDULE_PROPERTY_CODES.RETRY_BUDGET_EXCEEDED,
        "retry schedule exceeded the request budget",
        { logicalKey: request.logicalKey, count, retryBudget: request.retryBudget },
      ));
      break;
    }
  }
  return out;
}

export function replaySchedule({ createRuntime, trace, seed = 1, fixture = "network-timer-faults" }) {
  const runtime = createRuntime();
  runtime.reset(seed, fixture);
  let last = null;
  for (const actionId of trace) {
    const action = runtime.actions().find((candidate) => candidate.id === actionId);
    if (!action) {
      return { ok: false, missingAction: actionId, snapshot: runtime.snapshot(), violations: [] };
    }
    last = runtime.execute(action);
  }
  return {
    ok: true,
    snapshot: runtime.snapshot(),
    violations: last?.violations ?? [],
    last,
  };
}

export function shrinkSchedule({ createRuntime, trace, property, seed = 1, fixture = "network-timer-faults" }) {
  let current = [...trace];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.length; index += 1) {
      const candidate = current.filter((_, candidateIndex) => candidateIndex !== index);
      const replay = replaySchedule({ createRuntime, trace: candidate, seed, fixture });
      if (replay.ok && replay.violations.some((item) => item.code === property)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

export function buildScheduleFailure({ fixture, trace, snapshot, violation: item, seed = 1 }) {
  return {
    property: item.code,
    message: item.message,
    severity: item.severity,
    evidence: item.evidence,
    trace: [...trace],
    signature: failureSignature({
      fixture,
      property: item.code,
      failureClass: item.code,
      trace,
      snapshotHash: snapshot.fingerprint,
      seed,
      normalizerVersion: "network-timer-1",
    }),
  };
}

export function exploreSchedules({
  createRuntime,
  seed = 1,
  fixture = "network-timer-faults",
  maxDepth = 6,
  maxTransitions = 2_000,
} = {}) {
  if (typeof createRuntime !== "function") throw new TypeError("createRuntime is required");
  const initial = createRuntime();
  initial.reset(seed, fixture);
  const states = new Set([initial.snapshot().fingerprint]);
  const queue = [[]];
  const firstFailures = new Map();
  let transitions = 0;
  let depthBoundReached = false;
  let transitionLimitReached = false;

  while (queue.length > 0 && transitions < maxTransitions) {
    const trace = queue.shift();
    const base = replaySchedule({ createRuntime, trace, seed, fixture });
    if (!base.ok || trace.length >= maxDepth) continue;
    const runtime = createRuntime();
    runtime.reset(seed, fixture);
    for (const actionId of trace) {
      const action = runtime.actions().find((candidate) => candidate.id === actionId);
      if (!action) break;
      runtime.execute(action);
    }
    const actions = runtime.actions();
    for (const action of actions) {
      if (transitions >= maxTransitions) {
        transitionLimitReached = true;
        break;
      }
      const candidateTrace = [...trace, action.id];
      const replay = replaySchedule({ createRuntime, trace: candidateTrace, seed, fixture });
      if (!replay.ok) continue;
      transitions += 1;
      const isNewState = !states.has(replay.snapshot.fingerprint);
      states.add(replay.snapshot.fingerprint);
      for (const item of replay.violations) {
        if (!firstFailures.has(item.code)) {
          firstFailures.set(item.code, { trace: candidateTrace, violation: item, snapshot: replay.snapshot });
        }
      }
      if (isNewState) {
        if (candidateTrace.length < maxDepth) queue.push(candidateTrace);
        else depthBoundReached = true;
      }
    }
  }
  if (queue.length > 0) transitionLimitReached = true;

  const failures = [...firstFailures.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([property, found]) => {
    const trace = shrinkSchedule({ createRuntime, trace: found.trace, property, seed, fixture });
    const replay = replaySchedule({ createRuntime, trace, seed, fixture });
    const item = replay.violations.find((candidate) => candidate.code === property);
    return buildScheduleFailure({ fixture, trace, snapshot: replay.snapshot, violation: item, seed });
  });

  return {
    transitions,
    states: states.size,
    maxDepth,
    maxTransitions,
    truncated: depthBoundReached || transitionLimitReached,
    depthBoundReached,
    transitionLimitReached,
    failures,
  };
}
