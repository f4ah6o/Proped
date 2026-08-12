import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_DOMAIN_HINT_CONTRACT_VERSION = "1";

const SUPPORTED_PROPERTY_PACKS = new Set(["reload-persistence"]);
const SUPPORTED_PROJECTION_SELECTORS = new Set(["route-identity", "persistence-summary"]);

function fail(message) {
  throw new Error(`web domain hint contract: ${message}`);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createPropertyHintContract({ inputKind, inputId, predicateOp, predicateId = null } = {}) {
  const stable = {
    version: WEB_DOMAIN_HINT_CONTRACT_VERSION,
    kind: "property",
    input: { kind: inputKind, id: inputId },
    predicate: { op: predicateOp, id: predicateId },
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}

export function createProjectionHintContract({ selector } = {}) {
  const stable = {
    version: WEB_DOMAIN_HINT_CONTRACT_VERSION,
    kind: "projection",
    source: { kind: "browser-state", selector },
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}

export function validateWebDomainHintContract(contract, expectedKind = null) {
  if (!plainObject(contract)) fail("contract must be an object");
  if (contract.version !== WEB_DOMAIN_HINT_CONTRACT_VERSION) fail(`unsupported version ${contract.version ?? "<missing>"}`);
  if (!["property", "projection"].includes(contract.kind)) fail(`unsupported kind ${contract.kind ?? "<missing>"}`);
  if (expectedKind && contract.kind !== expectedKind) fail(`expected ${expectedKind} contract, got ${contract.kind}`);

  let stable;
  if (contract.kind === "property") {
    if (!plainObject(contract.input) || !["generic-property-pack", "semantic-transition"].includes(contract.input.kind) || typeof contract.input.id !== "string" || !contract.input.id) {
      fail("property input is invalid");
    }
    if (!plainObject(contract.predicate) || !["no-failures", "domain-invariant"].includes(contract.predicate.op)) {
      fail("property predicate is invalid");
    }
    if (contract.predicate.id !== null && contract.predicate.id !== undefined && (typeof contract.predicate.id !== "string" || !contract.predicate.id)) {
      fail("property predicate id is invalid");
    }
    stable = {
      version: contract.version,
      kind: contract.kind,
      input: { kind: contract.input.kind, id: contract.input.id },
      predicate: { op: contract.predicate.op, id: contract.predicate.id ?? null },
    };
  } else {
    if (!plainObject(contract.source) || contract.source.kind !== "browser-state" || typeof contract.source.selector !== "string" || !contract.source.selector) {
      fail("projection source is invalid");
    }
    stable = {
      version: contract.version,
      kind: contract.kind,
      source: { kind: contract.source.kind, selector: contract.source.selector },
    };
  }

  const expectedHash = semanticHash(stable);
  if (contract.semanticHash !== expectedHash) fail("semantic hash mismatch");
  return clone(contract);
}

export function webDomainHintContractSupport(contract) {
  validateWebDomainHintContract(contract);
  if (contract.kind === "property") {
    const executable = contract.input.kind === "generic-property-pack" &&
      SUPPORTED_PROPERTY_PACKS.has(contract.input.id) &&
      contract.predicate.op === "no-failures";
    return {
      executable,
      runtime: executable ? "generic-property-pack" : null,
      diagnostic: executable ? null : "approved_semantic_contract_unsupported",
    };
  }
  const executable = contract.source.kind === "browser-state" && SUPPORTED_PROJECTION_SELECTORS.has(contract.source.selector);
  return {
    executable,
    runtime: executable ? "browser-state-projection" : null,
    diagnostic: executable ? null : "approved_semantic_contract_unsupported",
  };
}

export function evaluateWebDomainPropertyContract(contract, propertyCampaign) {
  validateWebDomainHintContract(contract, "property");
  const support = webDomainHintContractSupport(contract);
  if (!support.executable) return { status: "unsupported", failureCount: null, inputId: contract.input.id };
  const result = (propertyCampaign?.results ?? []).find((item) => item.id === contract.input.id);
  if (!result) return { status: "not_executed", failureCount: null, inputId: contract.input.id };
  const failureCount = (result.failures ?? []).length;
  return {
    status: failureCount === 0 ? "pass" : "fail",
    failureCount,
    inputId: contract.input.id,
  };
}

function routeIdentity(urlValue) {
  const url = new URL(urlValue, "http://proped.invalid");
  return {
    pathname: url.pathname,
    queryKeys: [...new Set([...url.searchParams.keys()])].sort(),
    fragmentPresent: Boolean(url.hash),
  };
}

function persistenceSummary({ storage, indexedDB }) {
  return {
    localStorageKeys: Object.keys(storage?.local ?? {}).sort(),
    sessionStorageKeys: Object.keys(storage?.session ?? {}).sort(),
    databases: (indexedDB?.databases ?? []).map((database) => ({
      name: database.name,
      version: database.version,
      stores: (database.stores ?? []).map((store) => ({ name: store.name, count: store.count ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

export function projectWebDomainHintContract(contract, { url, storage, indexedDB } = {}) {
  validateWebDomainHintContract(contract, "projection");
  const support = webDomainHintContractSupport(contract);
  if (!support.executable) return { status: "unsupported", value: null };
  if (contract.source.selector === "route-identity") return { status: "projected", value: routeIdentity(url ?? "/") };
  if (contract.source.selector === "persistence-summary") return { status: "projected", value: persistenceSummary({ storage, indexedDB }) };
  return { status: "unsupported", value: null };
}
