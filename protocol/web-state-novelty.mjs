import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_STATE_NOVELTY_VERSION = "1";
export const DEFAULT_WEB_STATE_NOVELTY_WEIGHTS = Object.freeze({
  fingerprint: 10,
  routeFamily: 5,
  storageShape: 3,
  indexedDBShape: 4,
  actionTarget: 1,
  maximumActionTargetBonus: 4,
});

function normalizeGeneratedSegment(segment) {
  if (/^\d+$/.test(segment)) return ":id";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
  if (/^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment)) return ":id";
  return segment;
}

export function webRouteFamily(value) {
  if (!value) return "/";
  try {
    const url = new URL(value, "http://proped.invalid");
    const path = url.pathname.split("/").map(normalizeGeneratedSegment).join("/");
    const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
    return `${path}${queryKeys.length ? `?${queryKeys.map((key) => `${key}=:value`).join("&")}` : ""}${url.hash ? "#<fragment>" : ""}`;
  } catch {
    return String(value);
  }
}

function sortedKeys(value) {
  return Object.keys(value ?? {}).sort();
}

function storageShape(storage) {
  return {
    local: sortedKeys(storage?.local),
    session: sortedKeys(storage?.session),
  };
}

function indexedDBShape(snapshot) {
  const inventory = snapshot?.applicationState?.indexedDB;
  if (!inventory) return null;
  const databases = (inventory.databases ?? []).map((database) => ({
    name: database.name,
    version: database.logicalVersion ?? database.nativeVersion ?? database.version ?? null,
    stores: (database.stores ?? []).map((store) => ({
      name: store.name,
      keyPath: store.keyPath ?? null,
      autoIncrement: Boolean(store.autoIncrement),
      indexes: (store.indexes ?? []).map((index) => ({
        name: index.name,
        keyPath: index.keyPath ?? null,
        unique: Boolean(index.unique),
        multiEntry: Boolean(index.multiEntry),
      })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return databases;
}

function actionTargetKey(action) {
  if (action?.portableAction === true && Number.isSafeInteger(action?.ordinal)) return semanticHash({ kind: action.kind, ordinal: action.ordinal });
  const target = action?.target ?? {};
  return semanticHash({
    role: target.role ?? "",
    name: target.name ?? "",
    within: target.within ?? [],
    testIdentity: target.testIdentity ?? null,
    href: target.href ?? null,
  });
}

export function webStateNoveltyFeatures({ snapshot, inventory } = {}) {
  if (!snapshot?.fingerprint) throw new Error("state novelty requires snapshot.fingerprint");
  const storage = storageShape(snapshot.storage);
  const indexedDB = indexedDBShape(snapshot);
  const actionTargets = [...new Set((inventory?.actions ?? []).map(actionTargetKey))].sort();
  const features = {
    fingerprint: snapshot.fingerprint,
    routeFamily: webRouteFamily(snapshot.url),
    storageShape: semanticHash(storage),
    indexedDBShape: indexedDB ? semanticHash(indexedDB) : null,
    actionTargets,
  };
  return { ...features, semanticHash: semanticHash(features) };
}

export function emptyWebStateNoveltyHistory() {
  return {
    version: WEB_STATE_NOVELTY_VERSION,
    fingerprints: [],
    routeFamilies: [],
    storageShapes: [],
    indexedDBShapes: [],
    actionTargets: [],
  };
}

function asSet(values) {
  return new Set(values ?? []);
}

export function scoreWebStateNovelty(history, candidate, weights = DEFAULT_WEB_STATE_NOVELTY_WEIGHTS) {
  const features = candidate?.features ?? webStateNoveltyFeatures(candidate);
  const seen = {
    fingerprints: asSet(history?.fingerprints),
    routeFamilies: asSet(history?.routeFamilies),
    storageShapes: asSet(history?.storageShapes),
    indexedDBShapes: asSet(history?.indexedDBShapes),
    actionTargets: asSet(history?.actionTargets),
  };
  const unseenActionTargets = features.actionTargets.filter((target) => !seen.actionTargets.has(target));
  const contributions = {
    fingerprint: seen.fingerprints.has(features.fingerprint) ? 0 : weights.fingerprint,
    routeFamily: seen.routeFamilies.has(features.routeFamily) ? 0 : weights.routeFamily,
    storageShape: seen.storageShapes.has(features.storageShape) ? 0 : weights.storageShape,
    indexedDBShape: !features.indexedDBShape || seen.indexedDBShapes.has(features.indexedDBShape) ? 0 : weights.indexedDBShape,
    actionTargets: Math.min(weights.maximumActionTargetBonus, unseenActionTargets.length * weights.actionTarget),
  };
  const score = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  return {
    score,
    features,
    contributions,
    unseenActionTargetCount: unseenActionTargets.length,
    semanticHash: semanticHash({ features, contributions }),
  };
}

function addSorted(values, additions) {
  return [...new Set([...(values ?? []), ...additions])].sort();
}

export function observeWebStateNovelty(history, candidate) {
  const features = candidate?.features ?? webStateNoveltyFeatures(candidate);
  const next = {
    version: WEB_STATE_NOVELTY_VERSION,
    fingerprints: addSorted(history?.fingerprints, [features.fingerprint]),
    routeFamilies: addSorted(history?.routeFamilies, [features.routeFamily]),
    storageShapes: addSorted(history?.storageShapes, [features.storageShape]),
    indexedDBShapes: addSorted(history?.indexedDBShapes, features.indexedDBShape ? [features.indexedDBShape] : []),
    actionTargets: addSorted(history?.actionTargets, features.actionTargets),
  };
  return { ...next, semanticHash: semanticHash(next) };
}

export function rankWebStateNoveltyFrontier(history, candidates, weights = DEFAULT_WEB_STATE_NOVELTY_WEIGHTS) {
  return candidates.map((candidate, index) => {
    const novelty = scoreWebStateNovelty(history, candidate, weights);
    return {
      ...candidate,
      novelty,
      frontierOrdinal: candidate.frontierOrdinal ?? index,
    };
  }).sort((left, right) => {
    if (right.novelty.score !== left.novelty.score) return right.novelty.score - left.novelty.score;
    const leftDepth = left.depth ?? 0;
    const rightDepth = right.depth ?? 0;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    if (left.frontierOrdinal !== right.frontierOrdinal) return left.frontierOrdinal - right.frontierOrdinal;
    return left.novelty.semanticHash.localeCompare(right.novelty.semanticHash);
  });
}
