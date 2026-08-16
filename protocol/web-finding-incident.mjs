import { semanticHash } from "./ui-driver-v1.mjs";
import { WEB_ACTIONABLE_FINDING_VERSION } from "./web-actionable-finding.mjs";

export const WEB_FINDING_INCIDENT_VERSION = "1";

function stableStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function safeActionText(value) {
  return String(value ?? "")
    .replace(/\b(password|passwd|token|secret|authorization|cookie|api[-_]?key)=([^|&\s]+)/gi, "$1=<redacted>")
    .replace(/([?&][^=&\s]+)=([^&#|\s]+)/g, "$1=<redacted>")
    .replace(/https?:\/\/[^\s|]+/gi, "<url>")
    .replace(/\b(?:localhost|127\.0\.0\.1|\[::1\]):\d+\b/gi, "<local-origin>")
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s|:]+[\\/])+[^\s|:]+/g, "<path>")
    .slice(0, 512);
}

function safeReplayActions(finding) {
  return (finding?.representativeReplay?.trace ?? []).map((action) => safeActionText(typeof action === "string" ? action : action?.id ?? "<opaque-action>"));
}

function provenanceProjection(finding) {
  const provenance = finding?.provenance;
  if (!provenance || typeof provenance !== "object") {
    return {
      status: "rejected",
      rejectionReasons: stableStrings(finding?.provenanceRejectionReasons),
    };
  }
  const frame = provenance.topProjectFrame ?? {};
  return {
    status: "strong",
    family: provenance.family ?? null,
    exceptionName: provenance.exceptionName ?? null,
    messageTemplate: provenance.messageTemplate ?? null,
    routeFamily: provenance.routeFamily ?? null,
    topProjectFrame: {
      sourcePath: frame.sourcePath ?? null,
      function: frame.function ?? null,
      line: frame.line ?? null,
      column: frame.column ?? null,
    },
  };
}

export function projectWebFindingIncident(finding) {
  if (!finding || typeof finding !== "object" || typeof finding.findingGroupId !== "string") {
    throw new Error("finding incident projection requires a findingGroupId");
  }
  const replay = finding.representativeReplay ?? null;
  return {
    version: WEB_FINDING_INCIDENT_VERSION,
    findingContractVersion: WEB_ACTIONABLE_FINDING_VERSION,
    findingGroupId: finding.findingGroupId,
    failureCodes: stableStrings(finding.memberFailureCodes),
    grouping: finding.grouping ?? (finding.strong ? "strong" : "singleton"),
    actionable: finding.actionable === true,
    actionabilityReasons: stableStrings(finding.qualificationReasons),
    provenance: provenanceProjection(finding),
    occurrenceCount: Number.isSafeInteger(finding.occurrenceCount) ? finding.occurrenceCount : 0,
    minimalReplay: replay ? {
      actions: safeReplayActions(finding),
      originalActionCount: replay.originalActionCount ?? 0,
      minimizedActionCount: replay.minimizedActionCount ?? 0,
      minimality: replay.minimality ?? "unknown",
      replayable: finding.replayable === true,
      deterministic: finding.deterministic === true,
      sameFindingReplay: replay.sameFindingReplay === true,
    } : {
      actions: [],
      originalActionCount: 0,
      minimizedActionCount: 0,
      minimality: "unavailable",
      replayable: finding.replayable === true,
      deterministic: finding.deterministic === true,
      sameFindingReplay: false,
    },
  };
}

export function projectWebFindingIncidents(findings = []) {
  const incidents = (Array.isArray(findings) ? findings : [])
    .map(projectWebFindingIncident)
    .sort((left, right) => left.findingGroupId.localeCompare(right.findingGroupId));
  const stable = {
    version: WEB_FINDING_INCIDENT_VERSION,
    findingContractVersion: WEB_ACTIONABLE_FINDING_VERSION,
    incidentCount: incidents.length,
    actionableIncidentCount: incidents.filter((incident) => incident.actionable).length,
    incidents,
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}

function frameText(provenance) {
  const frame = provenance?.topProjectFrame;
  if (!frame?.sourcePath) return provenance?.status === "rejected"
    ? `provenance rejected (${(provenance.rejectionReasons ?? []).join(", ") || "unspecified"})`
    : "provenance unavailable";
  const line = frame.line ? `:${frame.line}${frame.column ? `:${frame.column}` : ""}` : "";
  const route = provenance.routeFamily ? ` route=${provenance.routeFamily}` : "";
  const message = provenance.messageTemplate ? `: ${provenance.messageTemplate}` : "";
  return `${provenance.exceptionName ?? "browser exception"}${message} @ ${frame.sourcePath}${line}${route}`;
}

export function renderWebFindingIncidents(projectionOrIncidents) {
  const incidents = Array.isArray(projectionOrIncidents)
    ? projectionOrIncidents
    : projectionOrIncidents?.incidents ?? [];
  if (incidents.length === 0) return "No actionable-finding incidents observed.\n";
  const sections = incidents.map((incident) => {
    const replay = incident.minimalReplay;
    const reasons = incident.actionable
      ? "actionable"
      : `not actionable: ${(incident.actionabilityReasons ?? []).join(", ") || "unspecified"}`;
    const actions = replay.actions.length > 0
      ? replay.actions.map((action, index) => `  ${index + 1}. ${action}`).join("\n")
      : "  (minimal replay unavailable)";
    return [
      `Incident ${incident.findingGroupId}`,
      `  failure: ${incident.failureCodes.join(", ") || "unknown_failure"}`,
      `  grouping: ${incident.grouping}`,
      `  occurrences: ${incident.occurrenceCount}`,
      `  provenance: ${frameText(incident.provenance)}`,
      `  replay: ${replay.originalActionCount} -> ${replay.minimizedActionCount} actions; ${replay.minimality}; deterministic=${replay.deterministic}; replayable=${replay.replayable}`,
      `  status: ${reasons}`,
      "  minimal replay:",
      actions,
    ].join("\n");
  });
  return `${sections.join("\n\n")}\n`;
}
