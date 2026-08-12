import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_SEMANTIC_ORACLE_BOUNDARY_VERSION = "1";

function approvedDomainHints(hints) {
  return (hints?.approved ?? []).filter((item) =>
    item?.approvedByHuman === true &&
    item?.activation === "human-approved" &&
    ["property", "projection"].includes(item.kind),
  );
}

function propertyResultByPack(propertyCampaign) {
  return new Map((propertyCampaign?.results ?? []).map((result) => [result.id, result]));
}

function propertyPackForId(id) {
  if (id === "saved-state-survives-reload") return "reload-persistence";
  return null;
}

export function buildWebSemanticOracleBoundary({
  semanticHints = null,
  approvedSemanticRuntime,
  propertyCampaign,
  replayGate,
  explorationReplayGate,
  snapshot,
  actionCount = 0,
} = {}) {
  const genericFailed = propertyCampaign?.ok === false || replayGate?.ok === false || explorationReplayGate?.ok === false;
  const executedPacks = (propertyCampaign?.results ?? []).map((result) => result.id).sort();
  const generic = {
    verdict: genericFailed ? "generic_failed" : "generic_verified",
    actionDiscovery: Number.isSafeInteger(actionCount) && actionCount >= 0,
    actionCount: Number.isSafeInteger(actionCount) && actionCount >= 0 ? actionCount : 0,
    executedPropertyPacks: executedPacks,
    failureCount: (propertyCampaign?.failures ?? []).length,
    replayDeterministic: replayGate?.ok === true && explorationReplayGate?.ok === true,
  };

  const approved = approvedDomainHints(semanticHints);
  const runtimePropertyRefs = new Set((approvedSemanticRuntime?.properties ?? []).map((item) => item.ref));
  const runtimeProjectionRefs = new Set((approvedSemanticRuntime?.projections ?? []).map((item) => item.ref));
  const unsupportedApprovedRefs = (approvedSemanticRuntime?.diagnostics ?? [])
    .filter((item) => item.kind === "approved_semantic_runtime_unsupported" && typeof item.ref === "string")
    .map((item) => item.ref)
    .sort();

  const packResults = propertyResultByPack(propertyCampaign);
  const verifiedPropertyRefs = [];
  const failedPropertyRefs = [];
  for (const item of approved.filter((candidate) => candidate.kind === "property")) {
    if (!runtimePropertyRefs.has(item.ref)) continue;
    const pack = propertyPackForId(item.id);
    const result = pack ? packResults.get(pack) : null;
    if (!result) continue;
    if ((result.failures ?? []).length > 0) failedPropertyRefs.push(item.ref);
    else verifiedPropertyRefs.push(item.ref);
  }

  const semanticProjections = snapshot?.applicationState?.semanticProjections ?? {};
  const observedProjectionRefs = approved
    .filter((item) => item.kind === "projection")
    .filter((item) => runtimeProjectionRefs.has(item.ref) && Object.prototype.hasOwnProperty.call(semanticProjections, item.id))
    .map((item) => item.ref)
    .sort();

  let domainVerdict = "domain_unverified";
  if (failedPropertyRefs.length > 0) domainVerdict = "domain_failed";
  else if (verifiedPropertyRefs.length > 0) domainVerdict = "domain_verified";

  const domain = {
    verdict: domainVerdict,
    approvedHintCount: approved.length,
    verifiedPropertyRefs: verifiedPropertyRefs.sort(),
    failedPropertyRefs: failedPropertyRefs.sort(),
    observedProjectionRefs,
    unsupportedApprovedRefs,
    automaticOracle: false,
  };

  const stable = {
    version: WEB_SEMANTIC_ORACLE_BOUNDARY_VERSION,
    generic,
    domain,
    approvedHintSemanticHash: approvedSemanticRuntime?.approvedHintSemanticHash ?? null,
  };
  return {
    ...stable,
    runtime: "web-semantic-oracle-boundary",
    semanticHash: semanticHash(stable),
  };
}
