import { semanticHash } from "../../protocol/ui-driver-v1.mjs";

export const DEXIE_INVENTORY_ADAPTER_VERSION = "1";
const SUPPORTED_MAJOR = new Set([3]);

function parseMajor(version) {
  if (typeof version !== "string") return null;
  const match = /(?:^|[^0-9])(\d+)(?:\.|$)/.exec(version);
  return match ? Number(match[1]) : null;
}

function keyPathText(keyPath) {
  if (Array.isArray(keyPath)) return `[${keyPath.join("+")}]`;
  return keyPath ?? "";
}

function dexieIndexToken(index) {
  const prefix = `${index.unique ? "&" : ""}${index.multiEntry ? "*" : ""}`;
  return `${prefix}${keyPathText(index.keyPath)}`;
}

function dexieStoreSchema(store) {
  let primary = "";
  if (store.keyPath != null) primary = `${store.autoIncrement ? "++" : ""}${keyPathText(store.keyPath)}`;
  else if (store.autoIncrement) primary = "++";
  const indexes = store.indexes.map(dexieIndexToken).filter(Boolean);
  return [primary, ...indexes].filter(Boolean).join(",");
}

export function enrichIndexedDbInventoryWithDexie(inventory, adapter = {}) {
  if (!inventory || typeof inventory !== "object") throw new Error("Dexie adapter requires an IndexedDB inventory");
  const resolvedMajor = parseMajor(adapter.resolvedVersion);
  const declaredMajor = parseMajor(adapter.declaredVersion);
  const major = resolvedMajor ?? declaredMajor;
  const mappingSupported = major != null && SUPPORTED_MAJOR.has(major);
  const confidence = resolvedMajor != null ? 1 : declaredMajor != null ? 0.9 : 0;
  const diagnostics = [...(inventory.diagnostics ?? [])];
  if (!mappingSupported) {
    diagnostics.push({
      code: "dexie_version_mapping_unsupported",
      message: major == null
        ? "Dexie version is unknown; native IndexedDB versions are not converted to logical Dexie versions"
        : `Dexie major ${major} is not covered by the verified native-version mapping`,
      dexieMajor: major,
    });
  }
  const databases = inventory.databases.map((database) => {
    const logicalVersion = mappingSupported && Number.isSafeInteger(database.nativeVersion)
      ? database.nativeVersion / 10
      : null;
    return {
      ...database,
      dexie: {
        adapterVersion: DEXIE_INVENTORY_ADAPTER_VERSION,
        declaredVersion: adapter.declaredVersion ?? null,
        resolvedVersion: adapter.resolvedVersion ?? null,
        major,
        logicalVersion,
        nativeVersionScale: mappingSupported ? 10 : null,
        mappingConfidence: mappingSupported ? confidence : 0,
        mappingEvidence: mappingSupported
          ? "verified-dexie-3.x: open uses Math.round(db.verno * 10); schema read uses idbdb.version / 10"
          : null,
        stores: database.stores.map((store) => ({
          name: store.name,
          schema: dexieStoreSchema(store),
        })),
      },
    };
  });
  const enriched = {
    ...inventory,
    adapter: {
      kind: "dexie",
      version: DEXIE_INVENTORY_ADAPTER_VERSION,
      declaredVersion: adapter.declaredVersion ?? null,
      resolvedVersion: adapter.resolvedVersion ?? null,
      mappingSupported,
      major,
      confidence: mappingSupported ? confidence : 0,
    },
    databases,
    diagnostics,
  };
  enriched.semanticHash = semanticHash({
    version: enriched.version,
    supported: enriched.supported,
    adapter: enriched.adapter,
    databases: enriched.databases,
    diagnostics: enriched.diagnostics.map((diagnostic) => ({ ...diagnostic, message: diagnostic.code })),
  });
  return enriched;
}
