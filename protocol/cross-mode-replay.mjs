import {
  PROTOCOL_VERSION,
  failureSignature,
  semanticHash,
} from "./ui-driver-v1.mjs";

export const CROSS_MODE_REPLAY_VERSION = "1";
export const ACTION_IDENTITY_VERSION = "1";

function parseValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseStableActionId(id) {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("stable action ID must be a non-empty string");
  }
  const parts = id.split("|");
  if (parts.length < 3) {
    throw new TypeError(`stable action ID requires kind, role, and name: ${id}`);
  }
  const [kind, role, name, ...rest] = parts;
  const within = [];
  const attributes = {};
  for (const part of rest) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      attributes[part] = true;
      continue;
    }
    const key = part.slice(0, separator);
    const raw = part.slice(separator + 1);
    if (key === "within") within.push(raw);
    else attributes[key] = parseValue(raw);
  }
  return { id, kind, role, name, within, attributes };
}

function canonicalComparable(parsed) {
  const attributes = Object.fromEntries(
    Object.entries(parsed.attributes)
      .filter(([key]) => key !== "within")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    kind: parsed.kind,
    role: parsed.role,
    name: parsed.name,
    attributes,
  };
}

function sameComparable(left, right) {
  return semanticHash(canonicalComparable(left)) === semanticHash(canonicalComparable(right));
}

function scopeCompatibility(source, target) {
  if (semanticHash(source.within) === semanticHash(target.within)) {
    return { compatible: true, score: 30, mode: "exact-scope" };
  }
  if (source.within.length === 0 || target.within.length === 0) {
    return {
      compatible: true,
      score: 10,
      mode: source.within.length === 0 ? "source-scope-omitted" : "target-scope-omitted",
    };
  }
  return { compatible: false, score: 0, mode: "scope-conflict" };
}

export function mapStableActionId(sourceId, targetActions) {
  const exact = targetActions.filter((action) => action.id === sourceId);
  if (exact.length === 1) {
    return {
      ok: true,
      sourceId,
      targetId: exact[0].id,
      action: exact[0],
      mapping: "exact",
      evidence: { sourceWithin: parseStableActionId(sourceId).within, targetWithin: parseStableActionId(exact[0].id).within },
    };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      diagnostic: {
        kind: "ambiguous_cross_mode_action",
        sourceId,
        candidates: exact.map((action) => action.id),
        message: "multiple target actions exactly match the source stable action ID",
      },
    };
  }

  let source;
  try {
    source = parseStableActionId(sourceId);
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        kind: "invalid_source_action_id",
        sourceId,
        message: error.message,
      },
    };
  }

  const candidates = [];
  for (const action of targetActions) {
    let target;
    try {
      target = parseStableActionId(action.id);
    } catch {
      continue;
    }
    if (!sameComparable(source, target)) continue;
    const scope = scopeCompatibility(source, target);
    if (!scope.compatible) continue;
    candidates.push({ action, target, score: 100 + scope.score, mapping: scope.mode });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      diagnostic: {
        kind: "missing_cross_mode_action",
        sourceId,
        source: canonicalComparable(source),
        message: "no compatible Browser Mode action exists for the Component Mode action",
      },
    };
  }

  candidates.sort((left, right) => right.score - left.score || left.action.id.localeCompare(right.action.id));
  const top = candidates.filter((candidate) => candidate.score === candidates[0].score);
  if (top.length !== 1) {
    return {
      ok: false,
      diagnostic: {
        kind: "ambiguous_cross_mode_action",
        sourceId,
        candidates: top.map((candidate) => candidate.action.id),
        message: "relaxed semantic action matching is ambiguous",
      },
    };
  }

  return {
    ok: true,
    sourceId,
    targetId: top[0].action.id,
    action: top[0].action,
    mapping: top[0].mapping,
    evidence: { sourceWithin: source.within, targetWithin: top[0].target.within },
  };
}

export function compareRuntimeMetadata(source, target) {
  const diagnostics = [];
  const requiredEqual = [
    "protocolVersion",
    "normalizerVersion",
    "actionIdentityVersion",
    "fixtureContract",
  ];
  for (const field of requiredEqual) {
    if (source?.[field] !== target?.[field]) {
      diagnostics.push({
        kind: "runtime_metadata_mismatch",
        field,
        source: source?.[field] ?? null,
        target: target?.[field] ?? null,
        message: `${field} must match before cross-mode replay`,
      });
    }
  }
  if (source?.mode !== "component") {
    diagnostics.push({
      kind: "unsupported_source_mode",
      sourceMode: source?.mode ?? null,
      message: "cross-mode replay source must be Component Mode",
    });
  }
  if (target?.mode !== "browser") {
    diagnostics.push({
      kind: "unsupported_target_mode",
      targetMode: target?.mode ?? null,
      message: "cross-mode replay target must be Browser Mode",
    });
  }
  return {
    compatible: diagnostics.length === 0,
    diagnostics,
    semanticHash: semanticHash({ source, target, diagnostics }),
  };
}

function defaultOutcome({ property, results }) {
  for (const result of results) {
    const violation = result.violations?.find((candidate) => candidate.code === property);
    if (violation) return { matched: true, violation };
  }
  return { matched: false, violation: null };
}

async function replayOnce({
  targetDriver,
  sourceTrace,
  sourceMetadata,
  targetMetadata,
  sourceFailure,
  targetFixture,
  seed,
  evaluateOutcome,
}) {
  const metadata = compareRuntimeMetadata(sourceMetadata, targetMetadata);
  if (!metadata.compatible) {
    return { ok: false, diagnostics: metadata.diagnostics, metadata };
  }
  if (!sourceFailure?.property || !sourceFailure?.failureClass) {
    return {
      ok: false,
      diagnostics: [{
        kind: "invalid_source_failure_identity",
        property: sourceFailure?.property ?? null,
        failureClass: sourceFailure?.failureClass ?? null,
        message: "source property and failure class are both required for cross-mode replay",
      }],
      metadata,
    };
  }

  const initial = await targetDriver.reset(seed, targetFixture);
  const mappings = [];
  const results = [];
  for (const sourceId of sourceTrace) {
    const available = await targetDriver.actions();
    const mapped = mapStableActionId(sourceId, available.actions);
    if (!mapped.ok) {
      return {
        ok: false,
        diagnostics: [mapped.diagnostic, ...(available.diagnostics ?? [])],
        metadata,
        mappings,
      };
    }
    mappings.push({
      sourceId: mapped.sourceId,
      targetId: mapped.targetId,
      mapping: mapped.mapping,
      evidence: mapped.evidence,
    });
    results.push(await targetDriver.execute(mapped.action));
  }

  const finalSnapshot = results.at(-1)?.snapshot ?? initial;
  const outcome = evaluateOutcome
    ? evaluateOutcome({ property: sourceFailure.property, initial, finalSnapshot, results })
    : defaultOutcome({ property: sourceFailure.property, results });
  if (!outcome.matched) {
    return {
      ok: false,
      diagnostics: [{
        kind: "cross_mode_failure_not_reproduced",
        property: sourceFailure.property,
        failureClass: sourceFailure.failureClass,
        message: "Browser Mode replay did not reproduce the Component Mode failure class",
      }],
      metadata,
      mappings,
      finalSnapshot,
    };
  }

  const targetTrace = mappings.map((mapping) => mapping.targetId);
  const signature = failureSignature({
    fixture: targetFixture,
    property: sourceFailure.property,
    failureClass: sourceFailure.failureClass,
    trace: targetTrace,
    snapshotHash: finalSnapshot.fingerprint,
    seed,
    normalizerVersion: targetMetadata.normalizerVersion,
  });
  return {
    ok: true,
    property: sourceFailure.property,
    failureClass: sourceFailure.failureClass,
    sourceTrace,
    targetTrace,
    sourceSignature: sourceFailure.sourceSignature ?? null,
    mappings,
    finalSnapshotHash: finalSnapshot.fingerprint,
    targetRuntime: finalSnapshot.browser ? {
      name: finalSnapshot.browser.name,
      version: finalSnapshot.browser.version,
      ephemeralProfile: finalSnapshot.browser.ephemeralProfile,
      serviceWorkers: finalSnapshot.browser.serviceWorkers,
      networkPolicy: finalSnapshot.browser.networkPolicy,
    } : null,
    violation: outcome.violation ?? null,
    signature,
    metadata,
    diagnostics: [],
  };
}

export async function replayCrossMode(options) {
  const first = await replayOnce(options);
  if (!first.ok) return first;
  const second = await replayOnce(options);
  if (!second.ok) return second;
  const deterministic =
    first.finalSnapshotHash === second.finalSnapshotHash &&
    semanticHash(first.targetTrace) === semanticHash(second.targetTrace) &&
    first.signature.semanticHash === second.signature.semanticHash;
  if (!deterministic) {
    return {
      ok: false,
      diagnostics: [{
        kind: "cross_mode_replay_nondeterministic",
        firstSnapshotHash: first.finalSnapshotHash,
        secondSnapshotHash: second.finalSnapshotHash,
        message: "fresh Browser Mode replays produced different failure signatures",
      }],
      first,
      second,
    };
  }
  return {
    ...first,
    deterministic: true,
    replayCount: 2,
    crossModeSemanticHash: semanticHash({
      version: CROSS_MODE_REPLAY_VERSION,
      sourceMetadata: options.sourceMetadata,
      targetMetadata: options.targetMetadata,
      property: first.property,
      failureClass: first.failureClass,
      sourceTrace: first.sourceTrace,
      targetTrace: first.targetTrace,
      sourceSignature: first.sourceSignature,
      targetRuntime: first.targetRuntime,
      snapshotHash: first.finalSnapshotHash,
      signature: first.signature.semanticHash,
    }),
  };
}

export function defaultRuntimeMetadata({
  mode,
  framework,
  runtime,
  runtimeVersion,
  fixtureContract = "fault-form-v1",
  normalizerVersion = "1",
}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    normalizerVersion,
    actionIdentityVersion: ACTION_IDENTITY_VERSION,
    fixtureContract,
    mode,
    framework,
    runtime,
    runtimeVersion,
  };
}
