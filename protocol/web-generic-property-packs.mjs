import { semanticHash } from "./ui-driver-v1.mjs";
import { clusterWebFailures } from "./web-failure-classifier.mjs";

export const GENERIC_PROPERTY_PACKS = Object.freeze([
  "browser-safety",
  "navigation",
  "reload-persistence",
  "stateful-server",
]);

function stateProjection(snapshot) {
  let route = snapshot.url;
  try {
    const url = new URL(snapshot.url);
    route = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Preserve the raw value when the URL is not parseable.
  }
  return {
    route,
    dom: snapshot.dom,
    forms: snapshot.forms,
    storage: snapshot.storage,
    applicationState: snapshot.applicationState ?? null,
  };
}

function stateHash(snapshot) {
  return semanticHash(stateProjection(snapshot));
}

function serverProjectionHash(snapshot) {
  const serverHooks = snapshot.applicationState?.serverHooks;
  return serverHooks == null ? null : semanticHash(serverHooks);
}

function storageHash(snapshot) {
  return semanticHash(snapshot.storage ?? { local: {}, session: {} });
}

function finding(code, severity, confidence, trace, message, evidence = {}) {
  const value = { code, failureClass: code, severity, confidence, trace, message, evidence };
  value.semanticHash = semanticHash(value);
  return value;
}

function uncaughtErrors(snapshot) {
  return (snapshot.console ?? []).filter((entry) => entry.kind === "uncaught");
}

function simpleProbeActions(inventory, { allowBoundedMutations }) {
  return inventory.actions.filter((action) => {
    if (action.kind === "clear") return false;
    if (action.kind === "type") return false;
    if (action.kind === "press") return false;
    if (action.target.role === "form") return false;
    if (action.destructiveRisk === "destructive") return false;
    if (action.destructiveRisk === "bounded-mutation" && !allowBoundedMutations) return false;
    return true;
  });
}

function formMutationSequences(inventory, { allowBoundedMutations }) {
  if (!allowBoundedMutations) return [];
  const sequences = [];
  for (const press of inventory.actions.filter((action) => action.kind === "press" && action.input === "Enter")) {
    const type = inventory.actions.find((action) =>
      action.kind === "type" &&
      action.target.role === press.target.role &&
      action.target.name === press.target.name &&
      JSON.stringify(action.target.within ?? []) === JSON.stringify(press.target.within ?? []) &&
      typeof action.input === "string" &&
      action.input.trim().length > 0,
    );
    if (type) sequences.push([type, press]);
  }
  return sequences;
}

function selectActionById(inventory, id) {
  return inventory.actions.find((action) => action.id === id) ?? null;
}

async function executeIds(driver, ids) {
  const trace = [];
  let snapshot = await driver.snapshot();
  for (const id of ids) {
    const inventory = await driver.actions();
    const action = selectActionById(inventory, id);
    if (!action) throw new Error(`generic property probe action disappeared: ${id}`);
    const result = await driver.execute(action);
    trace.push(id);
    snapshot = result.snapshot;
  }
  return { trace, snapshot };
}

async function runBrowserSafety(driver, options) {
  const failures = [];
  const advisories = [];
  let probes = 0;
  await driver.reset();
  const inventory = await driver.actions();
  const sequences = [
    ...simpleProbeActions(inventory, options).map((action) => [action]),
    ...formMutationSequences(inventory, options),
  ].slice(0, options.maxProbes);
  for (const sequence of sequences) {
    await driver.reset();
    probes += 1;
    try {
      const { trace, snapshot } = await executeIds(driver, sequence.map((action) => action.id));
      const errors = uncaughtErrors(snapshot);
      if (errors.length > 0) {
        failures.push(finding(
          "browser_uncaught_exception",
          "error",
          0.99,
          trace,
          "a discovered action produced an uncaught browser exception",
          { errors },
        ));
      }
    } catch (error) {
      advisories.push(finding(
        "generic_action_execution_diagnostic",
        "advisory",
        0.6,
        sequence.map((action) => action.id),
        "a discovered action could not be executed from a fresh state",
        { error: error.message },
      ));
    }
  }
  return { id: "browser-safety", probes, failures, advisories };
}

async function runNavigation(driver, options) {
  const failures = [];
  const advisories = [];
  let probes = 0;
  await driver.reset();
  const inventory = await driver.actions();
  const links = inventory.actions
    .filter((action) => action.kind === "click" && action.target.role === "link" && action.destructiveRisk === "safe")
    .slice(0, options.maxProbes);
  for (const candidate of links) {
    const before = await driver.reset();
    const beforeHash = stateHash(before);
    const refreshed = await driver.actions();
    const action = selectActionById(refreshed, candidate.id);
    if (!action) continue;
    probes += 1;
    try {
      const forward = await driver.execute(action);
      if (forward.snapshot.url === before.url) continue;
      const restored = await driver.goBack();
      const restoredHash = stateHash(restored);
      if (restoredHash !== beforeHash) {
        advisories.push(finding(
          "navigation_back_state_drift",
          "advisory",
          0.8,
          [candidate.id, "browser:back"],
          "back navigation did not restore the same generic semantic state",
          { before: beforeHash, restored: restoredHash },
        ));
      }
    } catch (error) {
      advisories.push(finding(
        "navigation_probe_diagnostic",
        "advisory",
        0.5,
        [candidate.id],
        "navigation probe could not complete",
        { error: error.message },
      ));
    }
  }
  return { id: "navigation", probes, failures, advisories };
}

async function runReloadPersistence(driver, options) {
  const failures = [];
  const advisories = [];
  let probes = 0;
  const initial = await driver.reset();
  const inventory = await driver.actions();
  const sequences = [
    ...simpleProbeActions(inventory, options)
      .filter((action) => action.target.role !== "link")
      .map((action) => [action]),
    ...formMutationSequences(inventory, options),
  ].slice(0, options.maxProbes);

  for (const sequence of sequences) {
    const before = await driver.reset();
    const refreshed = await driver.actions();
    const ids = sequence.map((action) => action.id);
    if (ids.some((id) => !selectActionById(refreshed, id))) continue;
    probes += 1;
    let after;
    try {
      after = (await executeIds(driver, ids)).snapshot;
    } catch (error) {
      advisories.push(finding(
        "reload_probe_execution_diagnostic",
        "advisory",
        0.5,
        ids,
        "reload persistence probe action sequence could not complete",
        { error: error.message },
      ));
      continue;
    }
    const beforeState = stateHash(before);
    const afterState = stateHash(after);
    if (afterState === beforeState) continue;
    const beforeStorage = storageHash(before);
    const afterStorage = storageHash(after);
    const storageChanged = beforeStorage !== afterStorage;
    const reloaded = await driver.reload();
    const reloadedState = stateHash(reloaded);
    const reloadedStorage = storageHash(reloaded);

    if (storageChanged && reloadedStorage !== afterStorage) {
      failures.push(finding(
        "reload_persistence_storage_drift",
        "error",
        0.99,
        [...ids, "browser:reload"],
        "local/session storage written by the action sequence changed across reload",
        { beforeStorage, afterStorage, reloadedStorage, storage: { after: after.storage, reloaded: reloaded.storage } },
      ));
    } else if (!storageChanged && reloadedState === beforeState) {
      advisories.push(finding(
        "reload_state_loss_without_persistence_evidence",
        "advisory",
        0.65,
        [...ids, "browser:reload"],
        "visible semantic state changed after an action but returned to the initial state on reload without observable storage evidence",
        { beforeState, afterState, reloadedState },
      ));
    } else if (reloadedState !== afterState && reloadedState !== beforeState) {
      advisories.push(finding(
        "reload_semantic_state_drift",
        "advisory",
        0.55,
        [...ids, "browser:reload"],
        "semantic state after reload differs from both the pre-action and post-action states",
        { beforeState, afterState, reloadedState },
      ));
    }
  }
  return { id: "reload-persistence", probes, failures, advisories, initialState: stateHash(initial) };
}


function mutationFamily(action) {
  const text = `${action?.target?.name ?? ""} ${action?.label ?? ""}`.toLowerCase();
  if (/\b(delete|remove|archive)\b|删除|移除|归档/.test(text)) return "delete";
  if (/\b(update|edit|save|rename)\b|更新|修改|保存|编辑/.test(text)) return "update";
  if (/\b(create|add|new|submit)\b|创建|新增|添加|提交/.test(text)) return "create";
  if (/\b(read|view|open|details?)\b|查看|打开|详情/.test(text)) return "read";
  if (/\b(login|log in|sign in|logout|log out|sign out|session|auth)\b|登录|登入|登出|退出/.test(text)) return "session";
  return null;
}

function statefulMutationSequences(inventory, options) {
  const bounded = simpleProbeActions(inventory, options)
    .filter((action) => action.destructiveRisk === "bounded-mutation")
    .map((action) => [action]);
  return [...formMutationSequences(inventory, options), ...bounded]
    .filter((sequence) => sequence.some((action) => mutationFamily(action) !== null))
    .slice(0, options.maxProbes);
}

function invalidOperationSequence(inventory) {
  const invalidType = inventory.actions.find((action) =>
    action.kind === "type" && action.input === "invalid" &&
    ["textbox", "searchbox", "spinbutton"].includes(action.target.role),
  );
  if (!invalidType) return null;
  const press = inventory.actions.find((action) =>
    action.kind === "press" && action.input === "Enter" &&
    action.target.role === invalidType.target.role &&
    action.target.name === invalidType.target.name &&
    JSON.stringify(action.target.within ?? []) === JSON.stringify(invalidType.target.within ?? []),
  );
  return press ? [invalidType, press] : [invalidType];
}

async function runStatefulServer(driver, options) {
  const failures = [];
  const advisories = [];
  let probes = 0;
  const families = new Set();
  let reloadPersistenceObserved = false;
  let restartPersistenceObserved = false;
  let stateMutationObserved = false;
  let serverProjectionObserved = false;
  const initial = await driver.reset();
  const initialInventory = await driver.actions();
  const sessionBoundaryObserved = initialInventory.actions.some((action) => mutationFamily(action) === "session");
  let invalidOperationStatus = "not-observed";

  const readCandidate = simpleProbeActions(initialInventory, options).find((action) => mutationFamily(action) === "read");
  if (readCandidate) {
    try {
      await driver.reset();
      const inventory = await driver.actions();
      const action = selectActionById(inventory, readCandidate.id);
      if (action) {
        const result = await driver.execute(action);
        probes += 1;
        if (uncaughtErrors(result.snapshot).length === 0) families.add("read");
      }
    } catch (error) {
      advisories.push(finding(
        "stateful_read_execution_diagnostic",
        "advisory",
        0.55,
        [readCandidate.id],
        "a discovered read candidate could not complete",
        { error: error.message },
      ));
    }
  }

  const invalidSequence = invalidOperationSequence(initialInventory);
  if (invalidSequence) {
    const before = await driver.reset();
    const ids = invalidSequence.map((action) => action.id);
    try {
      const after = (await executeIds(driver, ids)).snapshot;
      probes += 1;
      const errors = uncaughtErrors(after);
      if (errors.length > 0) {
        failures.push(finding(
          "stateful_invalid_operation_uncaught_exception",
          "error",
          0.99,
          ids,
          "an invalid-input candidate produced an uncaught browser exception",
          { errors },
        ));
        invalidOperationStatus = "browser-failure";
      } else {
        invalidOperationStatus = stateHash(after) === stateHash(before) ? "generic-safe-rejection" : "domain-unverified";
        if (invalidOperationStatus === "domain-unverified") {
          advisories.push(finding(
            "stateful_invalid_operation_domain_unverified",
            "advisory",
            0.7,
            ids,
            "the invalid-input candidate completed without a browser failure, but generic projection cannot prove domain rejection",
          ));
        }
      }
    } catch (error) {
      probes += 1;
      invalidOperationStatus = "generic-safe-rejection";
      advisories.push(finding(
        "stateful_invalid_operation_rejected",
        "advisory",
        0.85,
        ids,
        "the invalid-input candidate was rejected before producing an uncaught browser failure",
        { error: error.message },
      ));
    }
  }

  const sequences = statefulMutationSequences(initialInventory, options);

  for (const sequence of sequences) {
    const before = await driver.reset();
    const refreshed = await driver.actions();
    const ids = sequence.map((action) => action.id);
    if (ids.some((id) => !selectActionById(refreshed, id))) continue;
    probes += 1;
    let after;
    try {
      after = (await executeIds(driver, ids)).snapshot;
    } catch (error) {
      advisories.push(finding(
        "stateful_mutation_execution_diagnostic",
        "advisory",
        0.55,
        ids,
        "a discovered stateful mutation candidate could not complete",
        { error: error.message },
      ));
      continue;
    }
    const sequenceFamilies = sequence.map(mutationFamily).filter(Boolean);
    const beforeState = stateHash(before);
    const afterState = stateHash(after);
    const beforeServerProjection = serverProjectionHash(before);
    const afterServerProjection = serverProjectionHash(after);
    const hasServerProjection = beforeServerProjection !== null && afterServerProjection !== null;
    if (hasServerProjection) serverProjectionObserved = true;
    const mutationChanged = hasServerProjection
      ? afterServerProjection !== beforeServerProjection
      : afterState !== beforeState;
    if (!mutationChanged) {
      advisories.push(finding(
        "stateful_mutation_no_observable_change",
        "advisory",
        0.6,
        ids,
        "a stateful mutation candidate produced no observable generic state change",
        { family: sequence.map(mutationFamily).filter(Boolean) },
      ));
      continue;
    }
    stateMutationObserved = true;
    for (const family of sequenceFamilies) if (["create", "update", "delete"].includes(family)) families.add(family);

    const reloaded = await driver.reload();
    const reloadedState = stateHash(reloaded);
    const reloadedServerProjection = serverProjectionHash(reloaded);
    const reloadMatchesAfter = hasServerProjection
      ? reloadedServerProjection === afterServerProjection
      : reloadedState === afterState;
    const reloadMatchesBefore = hasServerProjection
      ? reloadedServerProjection === beforeServerProjection
      : reloadedState === beforeState;
    if (reloadMatchesAfter) {
      reloadPersistenceObserved = true;
    } else if (reloadMatchesBefore) {
      failures.push(finding(
        "stateful_reload_state_loss",
        "error",
        0.95,
        [...ids, "browser:reload"],
        "observable state created by a bounded mutation was lost on reload",
        { beforeState, afterState, reloadedState },
      ));
      continue;
    } else {
      advisories.push(finding(
        "stateful_reload_state_drift",
        "advisory",
        0.65,
        [...ids, "browser:reload"],
        "state after reload differs from both the pre-mutation and post-mutation projections",
        { beforeState, afterState, reloadedState },
      ));
    }

    if (typeof driver.restartManagedServer === "function") {
      try {
        const restarted = await driver.restartManagedServer();
        const restartedState = stateHash(restarted);
        const restartedServerProjection = serverProjectionHash(restarted);
        const restartMatchesPersisted = hasServerProjection
          ? restartedServerProjection === reloadedServerProjection || restartedServerProjection === afterServerProjection
          : restartedState === reloadedState || restartedState === afterState;
        const restartMatchesBefore = hasServerProjection
          ? restartedServerProjection === beforeServerProjection
          : restartedState === beforeState;
        if (restartMatchesPersisted) {
          restartPersistenceObserved = true;
        } else if (restartMatchesBefore) {
          failures.push(finding(
            "stateful_server_restart_state_loss",
            "error",
            0.99,
            [...ids, "browser:reload", "server:restart"],
            "observable persisted state was lost after managed server restart",
            { beforeState, afterState, reloadedState, restartedState },
          ));
        } else {
          advisories.push(finding(
            "stateful_server_restart_state_drift",
            "advisory",
            0.7,
            [...ids, "browser:reload", "server:restart"],
            "state after managed server restart differs from the post-mutation projections",
            { beforeState, afterState, reloadedState, restartedState },
          ));
        }
      } catch (error) {
        advisories.push(finding(
          "stateful_server_restart_unavailable",
          "advisory",
          0.9,
          [...ids, "server:restart"],
          "managed server restart verification could not complete",
          { error: error.message },
        ));
      }
    }
  }

  const requiredFamilies = ["create", "read", "update", "delete"];
  const missingFamilies = requiredFamilies.filter((family) => !families.has(family));
  if (!stateMutationObserved || missingFamilies.length > 0 || !reloadPersistenceObserved || !restartPersistenceObserved || !sessionBoundaryObserved || invalidOperationStatus === "not-observed" || !serverProjectionObserved) {
    advisories.push(finding(
      "stateful_campaign_incomplete",
      "advisory",
      0.99,
      [],
      "stateful server coverage is incomplete and must not be treated as domain verification",
      {
        stateMutationObserved,
        serverProjectionObserved,
        mutationFamilies: [...families].sort(),
        missingFamilies,
        reloadPersistenceObserved,
        restartPersistenceObserved,
        sessionBoundaryObserved,
        invalidOperationStatus,
      },
    ));
  }

  const coverage = {
    status: missingFamilies.length === 0 && stateMutationObserved && serverProjectionObserved && reloadPersistenceObserved && restartPersistenceObserved && sessionBoundaryObserved && invalidOperationStatus !== "not-observed" ? "generic-covered" : "generic-unverified",
    stateMutationObserved,
    serverProjectionObserved,
    mutationFamilies: [...families].sort(),
    missingFamilies,
    reloadPersistenceObserved,
    restartPersistenceObserved,
    sessionBoundaryObserved,
    invalidOperationStatus,
    initialState: stateHash(initial),
  };
  coverage.semanticHash = semanticHash({
    status: coverage.status,
    stateMutationObserved: coverage.stateMutationObserved,
    serverProjectionObserved: coverage.serverProjectionObserved,
    mutationFamilies: coverage.mutationFamilies,
    missingFamilies: coverage.missingFamilies,
    reloadPersistenceObserved: coverage.reloadPersistenceObserved,
    restartPersistenceObserved: coverage.restartPersistenceObserved,
    sessionBoundaryObserved: coverage.sessionBoundaryObserved,
    invalidOperationStatus: coverage.invalidOperationStatus,
  });
  return { id: "stateful-server", probes, failures, advisories, coverage };
}

export async function runGenericPropertyPacks(driver, {
  packs = ["browser-safety"],
  allowBoundedMutations = false,
  maxProbes = 12,
} = {}) {
  const selected = [...new Set(packs)];
  const results = [];
  const diagnostics = [];
  const options = { allowBoundedMutations, maxProbes };
  for (const pack of selected) {
    if (pack === "browser-safety") results.push(await runBrowserSafety(driver, options));
    else if (pack === "navigation") results.push(await runNavigation(driver, options));
    else if (pack === "reload-persistence") results.push(await runReloadPersistence(driver, options));
    else if (pack === "stateful-server") results.push(await runStatefulServer(driver, options));
    else diagnostics.push({ kind: "unsupported_generic_property_pack", pack, message: "property pack is not implemented by Generic Browser Mode" });
  }
  const failures = results.flatMap((result) => result.failures);
  const advisories = results.flatMap((result) => result.advisories);
  const replayProjection = results.map((result) => ({
    id: result.id,
    failureCodes: result.failures.map((item) => item.code).sort(),
    coverageSemanticHash: result.coverage?.semanticHash ?? null,
  }));
  const report = {
    ok: failures.length === 0,
    runtime: "generic-web-property-packs",
    selected,
    results,
    failures,
    advisories,
    diagnostics,
    canonicalFailures: clusterWebFailures(failures),
    metrics: {
      probeCount: results.reduce((sum, result) => sum + result.probes, 0),
      failureCount: failures.length,
      advisoryCount: advisories.length,
    },
    replayProjectionHash: semanticHash(replayProjection),
  };
  report.semanticHash = semanticHash(report);
  return report;
}
