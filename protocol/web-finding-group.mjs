import { classifyWebFailure } from "./web-failure-classifier.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_FINDING_GROUP_VERSION = "1";

function normalizeGenerated(value) {
  return String(value ?? "")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<token>")
    .replace(/\b(?:request|req|job|trace|generation)-?\d+\b/gi, "<runtime-id>")
    .replace(/\b\d+\b/g, "<number>");
}

function normalizeMessage(value) {
  return normalizeGenerated(value)
    .replace(/https?:\/\/[^\s)]+/gi, "<url>")
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:]+[\\/])+[^\s:]+/g, "<path>")
    .replace(/\s+/g, " ")
    .trim();
}

function safeRelativeSourcePath(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return null;
  return normalized.replace(/^\.\//, "");
}

function diagnosticCandidate(failure) {
  return failure?.diagnosticProvenance
    ?? failure?.evidence?.diagnosticProvenance
    ?? failure?.evidence?.exception
    ?? failure?.exception
    ?? null;
}

function strongBrowserExceptionProvenance(failure, canonical) {
  if (canonical.oracleFamily !== "browser-safety") return null;
  const diagnostic = diagnosticCandidate(failure);
  if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) return null;
  const frame = diagnostic.topProjectFrame ?? diagnostic.frame ?? null;
  if (!frame || typeof frame !== "object" || Array.isArray(frame) || frame.projectOwned !== true) return null;
  const sourcePath = safeRelativeSourcePath(frame.sourcePath ?? frame.file ?? null);
  const exceptionName = diagnostic.name ?? diagnostic.exceptionName ?? canonical.exceptionKind ?? null;
  const rawMessage = diagnostic.message ?? failure?.message ?? null;
  const messageTemplate = normalizeMessage(rawMessage);
  const routeFamily = canonical.routeFamily;
  if (!sourcePath || typeof exceptionName !== "string" || exceptionName.length === 0 || !messageTemplate || !routeFamily) return null;
  return {
    family: "browser-exception",
    exceptionName,
    messageTemplate,
    routeFamily,
    topProjectFrame: {
      sourcePath,
      projectOwned: true,
      function: typeof frame.function === "string" && frame.function.length > 0 ? normalizeGenerated(frame.function) : null,
      line: Number.isSafeInteger(frame.line) && frame.line > 0 ? frame.line : null,
      column: Number.isSafeInteger(frame.column) && frame.column > 0 ? frame.column : null,
    },
  };
}

function traceIds(failure) {
  return (failure?.trace ?? []).map((action) => {
    if (typeof action === "string") return action;
    if (typeof action?.id === "string" && action.id.length > 0) return action.id;
    return semanticHash(action ?? null);
  });
}

function failureCode(failure) {
  return failure?.code ?? failure?.property ?? failure?.failureClass ?? "unknown_failure";
}

function representativeProjection(failure, finding = classifyWebFinding(failure)) {
  const trace = traceIds(failure);
  return {
    findingGroupId: finding.id,
    canonicalFailureClassId: finding.canonicalFailureClassId,
    failureCode: failureCode(failure),
    trace,
    traceLength: trace.length,
  };
}

function compareRepresentatives(left, right) {
  if (left.traceLength !== right.traceLength) return left.traceLength - right.traceLength;
  const leftTrace = JSON.stringify(left.trace);
  const rightTrace = JSON.stringify(right.trace);
  if (leftTrace !== rightTrace) return leftTrace.localeCompare(rightTrace);
  return left.canonicalFailureClassId.localeCompare(right.canonicalFailureClassId);
}

export function classifyWebFinding(failure) {
  const canonical = classifyWebFailure(failure);
  const provenance = strongBrowserExceptionProvenance(failure, canonical);
  if (!provenance) {
    const semantic = {
      version: WEB_FINDING_GROUP_VERSION,
      grouping: "singleton",
      canonicalFailureClassId: canonical.id,
    };
    const hash = semanticHash(semantic);
    return {
      ...semantic,
      id: `finding-singleton@${hash.slice(0, 12)}`,
      semanticHash: hash,
      canonicalFailureClassId: canonical.id,
      provenance: null,
    };
  }
  const semantic = {
    version: WEB_FINDING_GROUP_VERSION,
    grouping: "strong",
    provenance,
  };
  const hash = semanticHash(semantic);
  return {
    ...semantic,
    id: `finding@${hash.slice(0, 12)}`,
    semanticHash: hash,
    canonicalFailureClassId: canonical.id,
    provenance,
  };
}

export function selectWebFindingRepresentative(failures = []) {
  if (!Array.isArray(failures) || failures.length === 0) throw new Error("finding representative requires at least one failure");
  const entries = failures.map((failure) => {
    const finding = classifyWebFinding(failure);
    return { finding, representative: representativeProjection(failure, finding) };
  });
  const findingGroupId = entries[0].finding.id;
  if (entries.some((entry) => entry.finding.id !== findingGroupId)) {
    throw new Error("finding representative requires failures from one finding group");
  }
  return entries.map((entry) => entry.representative).sort(compareRepresentatives)[0];
}

export function groupWebFindings(failures = []) {
  const groups = new Map();
  for (const failure of failures) {
    const finding = classifyWebFinding(failure);
    const representative = representativeProjection(failure, finding);
    const current = groups.get(finding.id) ?? {
      id: finding.id,
      grouping: finding.grouping,
      provenance: finding.provenance,
      count: 0,
      canonicalFailureClassIds: [],
      failureCodes: [],
      representative: null,
    };
    current.count += 1;
    if (!current.canonicalFailureClassIds.includes(finding.canonicalFailureClassId)) {
      current.canonicalFailureClassIds.push(finding.canonicalFailureClassId);
    }
    const code = failureCode(failure);
    if (!current.failureCodes.includes(code)) current.failureCodes.push(code);
    if (!current.representative || compareRepresentatives(representative, current.representative) < 0) {
      current.representative = representative;
    }
    groups.set(finding.id, current);
  }
  const result = [...groups.values()]
    .map((group) => ({
      ...group,
      canonicalFailureClassIds: group.canonicalFailureClassIds.sort(),
      failureCodes: group.failureCodes.sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    version: WEB_FINDING_GROUP_VERSION,
    inputCount: failures.length,
    groupCount: result.length,
    strongGroupCount: result.filter((group) => group.grouping === "strong").length,
    singletonGroupCount: result.filter((group) => group.grouping === "singleton").length,
    groups: result,
    semanticHash: semanticHash(result.map((group) => ({
      id: group.id,
      grouping: group.grouping,
      count: group.count,
      canonicalFailureClassIds: group.canonicalFailureClassIds,
      failureCodes: group.failureCodes,
      representative: group.representative,
    }))),
  };
}
