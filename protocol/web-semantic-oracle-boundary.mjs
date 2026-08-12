import { semanticHash } from "./ui-driver-v1.mjs";
import { evaluateWebDomainPropertyContract } from "./web-domain-hint-contract.mjs";

export const WEB_SEMANTIC_ORACLE_BOUNDARY_VERSION = "1";

function approvedDomainHints(hints) {
  return (hints?.approved ?? []).filter((item) =>
    item?.approvedByHuman === true &&
    item?.activation === "human-approved" &&
    ["property", "projection"].includes(item.kind),
  );
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
  const runtimeProperties = new Map((approvedSemanticRuntime?.properties ?? []).map((item) => [item.ref, item]));
  const runtimeProjectionRefs = new Set((approvedSemanticRuntime?.projections ?? []).map((item) => item.ref));
  const unsupportedApprovedRefs = (approvedSemanticRuntime?.diagnostics ?? [])
    .filter((item) => ["approved_semantic_contract_unsupported", "approved_semantic_contract_missing", "approved_semantic_runtime_unsupported"].includes(item.kind) && typeof item.ref === "string")
    .map((item) => item.ref)
    .sort();

  const verifiedPropertyRefs = [];
  const failedPropertyRefs = [];
  const notExecutedPropertyRefs = [];
  for (const item of approved.filter((candidate) => candidate.kind === "property")) {
    const runtimeItem = runtimeProperties.get(item.ref);
    if (!runtimeItem?.contract) continue;
    const result = evaluateWebDomainPropertyContract(runtimeItem.contract, propertyCampaign);
    if (result.status === "fail") failedPropertyRefs.push(item.ref);
    else if (result.status === "pass") verifiedPropertyRefs.push(item.ref);
    else if (result.status === "not_executed") notExecutedPropertyRefs.push(item.ref);
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
    notExecutedPropertyRefs: notExecutedPropertyRefs.sort(),
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
