import { semanticHash } from "../../protocol/ui-driver-v1.mjs";

export const INDEXEDDB_INVENTORY_VERSION = "1";

export async function captureIndexedDbInventory(page, { includeCounts = true } = {}) {
  const raw = await page.evaluate(async ({ includeCounts }) => {
    if (!globalThis.indexedDB || typeof indexedDB.databases !== "function") {
      return {
        supported: false,
        databases: [],
        diagnostics: [{ code: "indexeddb_databases_api_unavailable", message: "indexedDB.databases() is unavailable" }],
      };
    }

    const listed = (await indexedDB.databases())
      .filter((database) => typeof database.name === "string" && database.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const databases = [];
    const diagnostics = [];

    const requestPromise = (request) => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });

    for (const listedDatabase of listed) {
      try {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open(listedDatabase.name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
          request.onupgradeneeded = () => {
            request.transaction?.abort();
            reject(new Error("IndexedDB database disappeared during read-only inventory"));
          };
        });
        try {
          const storeNames = [...database.objectStoreNames].sort();
          const stores = [];
          for (const storeName of storeNames) {
            try {
              const transaction = database.transaction(storeName, "readonly");
              const store = transaction.objectStore(storeName);
              const indexes = [...store.indexNames].sort().map((name) => {
                const index = store.index(name);
                return {
                  name: index.name,
                  keyPath: Array.isArray(index.keyPath) ? [...index.keyPath] : index.keyPath ?? null,
                  unique: Boolean(index.unique),
                  multiEntry: Boolean(index.multiEntry),
                };
              });
              let count = null;
              if (includeCounts) {
                try {
                  count = await requestPromise(store.count());
                } catch (error) {
                  diagnostics.push({ code: "indexeddb_store_count_failed", database: database.name, store: storeName, message: String(error?.message ?? error) });
                }
              }
              stores.push({
                name: store.name,
                keyPath: Array.isArray(store.keyPath) ? [...store.keyPath] : store.keyPath ?? null,
                autoIncrement: Boolean(store.autoIncrement),
                count,
                indexes,
              });
            } catch (error) {
              diagnostics.push({ code: "indexeddb_store_inventory_failed", database: database.name, store: storeName, message: String(error?.message ?? error) });
            }
          }
          databases.push({
            name: database.name,
            nativeVersion: database.version,
            stores,
          });
        } finally {
          database.close();
        }
      } catch (error) {
        diagnostics.push({ code: "indexeddb_database_inventory_failed", database: listedDatabase.name, message: String(error?.message ?? error) });
      }
    }

    return { supported: true, databases, diagnostics };
  }, { includeCounts });

  const inventory = {
    version: INDEXEDDB_INVENTORY_VERSION,
    supported: raw.supported,
    databases: raw.databases,
    diagnostics: raw.diagnostics,
  };
  inventory.semanticHash = semanticHash({
    version: inventory.version,
    supported: inventory.supported,
    databases: inventory.databases,
    diagnostics: inventory.diagnostics.map((diagnostic) => ({ ...diagnostic, message: diagnostic.code })),
  });
  return inventory;
}
