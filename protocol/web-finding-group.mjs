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
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/") || normalized.startsWith("file:")) return null;
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
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return null;
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
      function: typeof frame.function === "string" && frame.function.length > 0 ? normalizeGenerated(frame.function) : null,
      line: Number.isSafeInteger(frame.line) && frame.line > 0 ? frame.line : null,
      column: Number.isSafeInteger(frame.column) && frame.column > 0 ? frame.column : null,
    },
  };
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

export function groupWebFindings(failures = []) {
  const groups = new Map();
  for (const failure of failures) {
    const finding = classifyWebFinding(failure);
    const current = groups.get(finding.id) ?? {
      id: finding.id,
      grouping: finding.grouping,
      provenance: finding.provenance,
      count: 0,
      canonicalFailureClassIds: [],
      failureCodes: [],
    };
    current.count += 1;
    if (!current.canonicalFailureClassIds.includes(finding.canonicalFailureClassId)) {
      current.canonicalFailureClassIds.push(finding.canonicalFailureClassId);
    }
    const code = failure?.code ?? failure?.property ?? failure?.failureClass ?? "unknown_failure";
    if (!current.failureCodes.includes(code)) current.failureCodes.push(code);
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
    }))),
  };
}
