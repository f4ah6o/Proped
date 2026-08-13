import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_PROJECT_BASELINE_VERSION = 1;

function fail(message) {
  const error = new Error(`Web project baseline: ${message}`);
  error.code = "invalid_baseline";
  throw error;
}

function stableStrings(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  if (value.some((item) => typeof item !== "string" || item.length === 0)) fail(`${label} must contain non-empty strings`);
  return [...new Set(value)].sort();
}

function stableProject(project, index) {
  if (!project || typeof project !== "object" || Array.isArray(project)) fail(`projects[${index}] must be an object`);
  const id = project.corpusEntryId;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) fail(`projects[${index}].corpusEntryId is invalid`);
  if (typeof project.repository !== "string" || project.repository.length === 0) fail(`${id}.repository is required`);
  if (typeof project.revision !== "string" || project.revision.length === 0) fail(`${id}.revision is required`);
  if (typeof project.autoOnboarded !== "boolean") fail(`${id}.autoOnboarded must be boolean`);
  if (project.deterministicReplay !== null && typeof project.deterministicReplay !== "boolean") fail(`${id}.deterministicReplay must be boolean or null`);
  if (!Number.isSafeInteger(project.humanInterventions) || project.humanInterventions < 0) fail(`${id}.humanInterventions must be a non-negative safe integer`);
  return {
    corpusEntryId: id,
    repository: project.repository,
    revision: project.revision,
    autoOnboarded: project.autoOnboarded,
    deterministicReplay: project.deterministicReplay,
    humanInterventions: project.humanInterventions,
    failureClasses: stableStrings(project.failureClasses ?? [], `${id}.failureClasses`),
  };
}

export function validateWebProjectBenchmarkBaseline(value, { file = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("baseline must be an object");
  if (value.schemaVersion !== WEB_PROJECT_BASELINE_VERSION) fail(`unsupported schemaVersion: ${value.schemaVersion}`);
  if (value.runtime !== "web-project-benchmark-baseline") fail("runtime is invalid");
  if (!value.corpus || typeof value.corpus !== "object" || Array.isArray(value.corpus)) fail("corpus is required");
  if (typeof value.corpus.id !== "string" || value.corpus.id.length === 0) fail("corpus.id is required");
  if (typeof value.corpus.semanticHash !== "string" || !/^[0-9a-f]{64}$/.test(value.corpus.semanticHash)) fail("corpus.semanticHash must be sha256 hex");
  if (!Array.isArray(value.projects) || value.projects.length === 0) fail("projects must be a non-empty array");
  const projects = value.projects.map(stableProject);
  const ids = new Set();
  for (const project of projects) {
    if (ids.has(project.corpusEntryId)) fail(`duplicate project id: ${project.corpusEntryId}`);
    ids.add(project.corpusEntryId);
  }
  const stable = {
    schemaVersion: WEB_PROJECT_BASELINE_VERSION,
    runtime: "web-project-benchmark-baseline",
    corpus: { id: value.corpus.id, semanticHash: value.corpus.semanticHash },
    projects,
  };
  const expectedHash = semanticHash(stable);
  if (value.semanticHash && value.semanticHash !== expectedHash) fail("semanticHash does not match baseline content");
  return { ...stable, semanticHash: expectedHash, sourceFile: file ? path.resolve(file) : null };
}

export function createWebProjectBenchmarkBaseline(summary) {
  if (!summary?.corpus?.id || !summary?.corpus?.semanticHash) fail("summary corpus identity is required");
  const projects = (summary.projects ?? []).map((project, index) => stableProject({
    corpusEntryId: project.corpusEntryId,
    repository: project.repository,
    revision: project.revision,
    autoOnboarded: project.autoOnboarded === true,
    deterministicReplay: project.deterministicReplay ?? null,
    humanInterventions: project.humanInterventions ?? 0,
    failureClasses: project.failureClasses ?? [],
  }, index));
  return validateWebProjectBenchmarkBaseline({
    schemaVersion: WEB_PROJECT_BASELINE_VERSION,
    runtime: "web-project-benchmark-baseline",
    corpus: { id: summary.corpus.id, semanticHash: summary.corpus.semanticHash },
    projects,
  });
}

export function loadWebProjectBenchmarkBaseline(file) {
  const absolute = path.resolve(file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    fail(`cannot read ${absolute}: ${error.message}`);
  }
  return validateWebProjectBenchmarkBaseline(parsed, { file: absolute });
}

function stringDelta(before = [], after = []) {
  const old = new Set(before);
  const current = new Set(after);
  return {
    added: [...current].filter((item) => !old.has(item)).sort(),
    removed: [...old].filter((item) => !current.has(item)).sort(),
  };
}

export function compareWebProjectBenchmarkBaseline(baseline, summary) {
  const key = (project) => project.corpusEntryId;
  const before = new Map(baseline.projects.map((project) => [key(project), project]));
  const after = new Map((summary.projects ?? []).map((project) => [key(project), project]));
  const addedTargets = [];
  const removedTargets = [];
  const metadataChangedTargets = [];
  const autoOnboardingRegressed = [];
  const autoOnboardingImproved = [];
  const replayRegressed = [];
  const replayImproved = [];
  const interventionIncreased = [];
  const interventionDecreased = [];
  const findingDeltas = [];

  for (const [id, project] of after) {
    const old = before.get(id);
    if (!old) { addedTargets.push(id); continue; }
    if (old.repository !== project.repository || old.revision !== project.revision) metadataChangedTargets.push(id);
    if (old.autoOnboarded && project.autoOnboarded !== true) autoOnboardingRegressed.push(id);
    else if (!old.autoOnboarded && project.autoOnboarded === true) autoOnboardingImproved.push(id);
    if (old.deterministicReplay === true && project.deterministicReplay !== true) replayRegressed.push(id);
    else if (old.deterministicReplay !== true && project.deterministicReplay === true) replayImproved.push(id);
    const currentInterventions = project.humanInterventions ?? 0;
    if (currentInterventions > old.humanInterventions) interventionIncreased.push(id);
    else if (currentInterventions < old.humanInterventions) interventionDecreased.push(id);
    const delta = stringDelta(old.failureClasses, project.failureClasses ?? []);
    if (delta.added.length || delta.removed.length) findingDeltas.push({ id, ...delta });
  }
  for (const id of before.keys()) if (!after.has(id)) removedTargets.push(id);
  for (const values of [addedTargets, removedTargets, metadataChangedTargets, autoOnboardingRegressed, autoOnboardingImproved, replayRegressed, replayImproved, interventionIncreased, interventionDecreased]) values.sort();
  findingDeltas.sort((a, b) => a.id.localeCompare(b.id));
  const regressionTargets = [...new Set([...removedTargets, ...autoOnboardingRegressed, ...replayRegressed, ...interventionIncreased])].sort();
  const corpusMatches = baseline.corpus.id === summary.corpus?.id && baseline.corpus.semanticHash === summary.corpus?.semanticHash;
  const compatibilityIssues = [...new Set([
    ...(baseline.corpus.id !== summary.corpus?.id ? ["corpus-id-changed"] : []),
    ...(!corpusMatches && baseline.corpus.id === summary.corpus?.id ? ["corpus-content-changed"] : []),
    ...(addedTargets.length ? ["targets-added"] : []),
    ...(removedTargets.length ? ["targets-removed"] : []),
    ...(metadataChangedTargets.length ? ["target-metadata-changed"] : []),
  ])];
  return {
    corpusMatches,
    compatibilityIssues,
    addedTargets,
    removedTargets,
    metadataChangedTargets,
    autoOnboardingRegressed,
    autoOnboardingImproved,
    replayRegressed,
    replayImproved,
    interventionIncreased,
    interventionDecreased,
    findingDeltas,
    regressionTargets,
    regressionCount: regressionTargets.length,
  };
}

export function evaluateWebProjectBenchmarkBaselineGate(baseline, summary, { maxRegressions = 0 } = {}) {
  const diff = compareWebProjectBenchmarkBaseline(baseline, summary);
  const checks = [
    { id: "baseline-corpus-compatible", pass: diff.compatibilityIssues.length === 0, observed: diff.compatibilityIssues.length, required: 0, comparator: "==" },
    { id: "baseline-functional-regressions", pass: diff.regressionCount <= maxRegressions, observed: diff.regressionCount, required: maxRegressions, comparator: "<=" },
  ];
  return { ok: checks.every((check) => check.pass), checks, diff, baselineSemanticHash: baseline.semanticHash };
}
