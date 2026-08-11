import { semanticHash } from "./ui-driver-v1.mjs";
import { clusterWebFailures } from "./web-failure-classifier.mjs";

export const GENERIC_PROPERTY_PACKS = Object.freeze([
  "browser-safety",
  "navigation",
  "reload-persistence",
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
    else diagnostics.push({ kind: "unsupported_generic_property_pack", pack, message: "property pack is not implemented by Generic Browser Mode" });
  }
  const failures = results.flatMap((result) => result.failures);
  const advisories = results.flatMap((result) => result.advisories);
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
  };
  report.semanticHash = semanticHash(report);
  return report;
}
