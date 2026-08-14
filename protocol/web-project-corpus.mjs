import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash } from "./ui-driver-v1.mjs";

export const WEB_PROJECT_CORPUS_VERSION = 1;
export const DEFAULT_PRODUCTION_CORPUS = new URL("./fixtures/production-campaign-corpus.json", import.meta.url);
export const DEFAULT_EXTERNAL_PRODUCTION_CORPUS = new URL("./fixtures/external-production-corpus.json", import.meta.url);
export const DEFAULT_EXTERNAL_FRONTIER_CORPUS = new URL("./fixtures/external-frontier-corpus.json", import.meta.url);
export const DEFAULT_PROMOTED_PRODUCTION_CORPUS = new URL("./fixtures/promoted-production-corpus.json", import.meta.url);

function fail(message) {
  const error = new Error(`Web project corpus: ${message}`);
  error.code = "invalid_corpus";
  throw error;
}

function finiteRate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail(`${label} must be between 0 and 1`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`);
  return value;
}

function validateGitSourceUrl(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} is required`);
  if (path.isAbsolute(value)) return value;
  let url;
  try { url = new URL(value); } catch { fail(`${label} must be https://, file://, or an absolute local path`); }
  if (!new Set(["https:", "file:"]).has(url.protocol)) fail(`${label} must use https:// or file://`);
  if (url.username || url.password) fail(`${label} must not embed credentials`);
  if (url.protocol === "https:" && !url.hostname) fail(`${label} must include a host`);
  return value;
}

function validateTopology(value, label) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(value.id)) fail(`${label}.id is invalid`);
  if (!Array.isArray(value.capabilities) || value.capabilities.some((item) => typeof item !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(item))) fail(`${label}.capabilities must contain stable lowercase identifiers`);
  return { id: value.id, capabilities: [...new Set(value.capabilities)].sort() };
}

function validateNestedGitSources(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const paths = new Set();
  return value.map((nested, index) => {
    const nestedLabel = `${label}[${index}]`;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) fail(`${nestedLabel} must be an object`);
    if (typeof nested.path !== "string" || nested.path.length === 0 || path.isAbsolute(nested.path)) fail(`${nestedLabel}.path must be a relative path`);
    const parts = nested.path.split(/[\\/]+/);
    if (parts.some((part) => !part || part === "." || part === ".." || part === ".git")) fail(`${nestedLabel}.path is unsafe`);
    const normalizedPath = parts.join("/");
    if (paths.has(normalizedPath)) fail(`${label} contains duplicate path: ${normalizedPath}`);
    paths.add(normalizedPath);
    validateGitSourceUrl(nested.url, `${nestedLabel}.url`);
    if (typeof nested.revision !== "string" || !/^[0-9a-f]{40}$/.test(nested.revision)) fail(`${nestedLabel}.revision must be a full commit SHA`);
    return { path: normalizedPath, url: nested.url, revision: nested.revision };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function validateWebProjectCorpus(value, { file = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("corpus must be an object");
  if (value.schemaVersion !== WEB_PROJECT_CORPUS_VERSION) fail(`unsupported schemaVersion: ${value.schemaVersion}`);
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(value.id)) fail("id must be a stable lowercase identifier");
  if (!Array.isArray(value.targets) || value.targets.length === 0) fail("targets must be a non-empty array");
  const ids = new Set();
  const targets = value.targets.map((target, index) => {
    if (!target || typeof target !== "object" || Array.isArray(target)) fail(`targets[${index}] must be an object`);
    if (typeof target.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(target.id)) fail(`targets[${index}].id is invalid`);
    if (ids.has(target.id)) fail(`duplicate target id: ${target.id}`);
    ids.add(target.id);
    if (typeof target.project !== "string" || target.project.length === 0) fail(`${target.id}.project is required`);
    if (typeof target.repository !== "string" || target.repository.length === 0) fail(`${target.id}.repository is required`);
    if (typeof target.revision !== "string" || !(/^[0-9a-f]{40}$/.test(target.revision) || /^workspace:[a-z0-9][a-z0-9._-]*$/.test(target.revision))) fail(`${target.id}.revision must be a full commit SHA or workspace:<version>`);
    const adapterLoc = nonNegativeInteger(target.adapterLoc ?? 0, `${target.id}.adapterLoc`);
    const tags = Array.isArray(target.tags) ? [...new Set(target.tags.map(String))].sort() : [];
    const topology = validateTopology(target.topology, `${target.id}.topology`);
    let source = null;
    if (target.source != null) {
      if (!target.source || typeof target.source !== "object" || Array.isArray(target.source)) fail(`${target.id}.source must be an object`);
      if (target.source.kind !== "git") fail(`${target.id}.source.kind must be git`);
      validateGitSourceUrl(target.source.url, `${target.id}.source.url`);
      if (typeof target.source.checkout !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(target.source.checkout)) fail(`${target.id}.source.checkout is invalid`);
      if (!/^[0-9a-f]{40}$/.test(target.revision)) fail(`${target.id}.revision must be a full commit SHA for git materialization`);
      if (path.isAbsolute(target.project) || target.project.split(/[\\/]+/).includes("..")) fail(`${target.id}.project must stay within the checkout`);
      const nestedSources = validateNestedGitSources(target.source.nestedSources, `${target.id}.source.nestedSources`);
      source = {
        kind: "git",
        url: target.source.url,
        checkout: target.source.checkout,
        ...(nestedSources.length > 0 ? { nestedSources } : {}),
      };
    }
    return { ...target, adapterLoc, tags, ...(topology ? { topology } : {}), ...(source ? { source } : {}) };
  });
  const gate = value.gate ?? {};
  const optionalGate = {};
  if (gate.minTargetCount != null) optionalGate.minTargetCount = nonNegativeInteger(gate.minTargetCount, "gate.minTargetCount");
  if (gate.minRepositoryCount != null) optionalGate.minRepositoryCount = nonNegativeInteger(gate.minRepositoryCount, "gate.minRepositoryCount");
  if (gate.requiredTags != null) {
    if (!Array.isArray(gate.requiredTags) || gate.requiredTags.some((tag) => typeof tag !== "string" || tag.length === 0)) fail("gate.requiredTags must be a string array");
    optionalGate.requiredTags = [...new Set(gate.requiredTags)].sort();
  }
  if (gate.requiredTopologies != null) {
    if (!Array.isArray(gate.requiredTopologies) || gate.requiredTopologies.some((id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(id))) fail("gate.requiredTopologies must contain stable lowercase identifiers");
    optionalGate.requiredTopologies = [...new Set(gate.requiredTopologies)].sort();
  }
  const normalized = {
    schemaVersion: WEB_PROJECT_CORPUS_VERSION,
    id: value.id,
    description: typeof value.description === "string" ? value.description : "",
    gate: {
      minAutoOnboardingRate: finiteRate(gate.minAutoOnboardingRate ?? 0.8, "gate.minAutoOnboardingRate"),
      maxInterventionProjectRate: finiteRate(gate.maxInterventionProjectRate ?? 0.2, "gate.maxInterventionProjectRate"),
      minDeterministicReplayRate: finiteRate(gate.minDeterministicReplayRate ?? 1, "gate.minDeterministicReplayRate"),
      maxAdapterLoc: nonNegativeInteger(gate.maxAdapterLoc ?? 0, "gate.maxAdapterLoc"),
      maxRegressions: nonNegativeInteger(gate.maxRegressions ?? 0, "gate.maxRegressions"),
      ...optionalGate,
    },
    targets,
  };
  return {
    ...normalized,
    sourceFile: file ? path.resolve(file) : null,
    semanticHash: semanticHash(normalized),
  };
}

export function loadWebProjectCorpus(file) {
  const absolute = path.resolve(file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    fail(`cannot read ${absolute}: ${error.message}`);
  }
  return validateWebProjectCorpus(parsed, { file: absolute });
}

export function resolveWebProjectCorpus(value) {
  if (value === "production") return loadWebProjectCorpus(fileURLToPath(DEFAULT_PRODUCTION_CORPUS));
  if (value === "external" || value === "external-production") return loadWebProjectCorpus(fileURLToPath(DEFAULT_EXTERNAL_PRODUCTION_CORPUS));
  if (value === "frontier" || value === "external-frontier" || value === "novelty") return loadWebProjectCorpus(fileURLToPath(DEFAULT_EXTERNAL_FRONTIER_CORPUS));
  if (value === "promoted" || value === "promoted-production") return loadWebProjectCorpus(fileURLToPath(DEFAULT_PROMOTED_PRODUCTION_CORPUS));
  return loadWebProjectCorpus(value);
}

export function corpusHasExternalTargets(corpus) {
  return corpus.targets.some((target) => target.source?.kind === "git");
}

export function corpusProjectPaths(corpus, { checkoutRoot = null } = {}) {
  const base = corpus.sourceFile ? path.dirname(corpus.sourceFile) : process.cwd();
  const externalRoot = checkoutRoot ? path.resolve(checkoutRoot) : null;
  return corpus.targets.map((target) => {
    if (target.source?.kind === "git") {
      if (!externalRoot) fail(`${target.id} requires an explicit checkout root`);
      return path.resolve(externalRoot, target.source.checkout, target.project);
    }
    return path.resolve(base, target.project);
  });
}

export function diffWebProjectBenchmark(previous, current) {
  if (!previous || !current) return null;
  const key = (project) => project.corpusEntryId ?? project.id;
  const before = new Map((previous.projects ?? []).map((project) => [key(project), project]));
  const after = new Map((current.projects ?? []).map((project) => [key(project), project]));
  const improved = [];
  const regressed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  for (const [id, project] of after) {
    const old = before.get(id);
    if (!old) {
      added.push(id);
      continue;
    }
    if (old.autoOnboarded !== true && project.autoOnboarded === true) improved.push(id);
    else if (old.autoOnboarded === true && project.autoOnboarded !== true) regressed.push(id);
    else unchanged.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  for (const values of [improved, regressed, unchanged, added, removed]) values.sort();
  return { improved, regressed, unchanged, added, removed, regressionCount: regressed.length + removed.length };
}

export function evaluateWebProjectBenchmarkGate(summary, corpus, previous = null) {
  const projectCount = summary.projectCount ?? 0;
  const interventionProjectRate = projectCount > 0 ? (summary.interventionProjectCount ?? 0) / projectCount : 1;
  const replayRate = (summary.replayObservedProjectCount ?? 0) > 0
    ? (summary.deterministicReplayProjectCount ?? 0) / summary.replayObservedProjectCount
    : 0;
  const adapterLoc = corpus.targets.reduce((total, target) => total + target.adapterLoc, 0);
  const repositoryCount = new Set(corpus.targets.map((target) => target.repository)).size;
  const observedTags = new Set(corpus.targets.flatMap((target) => target.tags ?? []));
  const requiredTags = corpus.gate.requiredTags ?? [];
  const missingRequiredTags = requiredTags.filter((tag) => !observedTags.has(tag));
  const observedTopologies = new Set(corpus.targets.map((target) => target.topology?.id).filter(Boolean));
  const requiredTopologies = corpus.gate.requiredTopologies ?? [];
  const missingRequiredTopologies = requiredTopologies.filter((id) => !observedTopologies.has(id));
  const diff = previous ? diffWebProjectBenchmark(previous, summary) : null;
  const checks = [
    { id: "auto-onboarding-rate", pass: summary.autoOnboardingRate >= corpus.gate.minAutoOnboardingRate, observed: summary.autoOnboardingRate, required: corpus.gate.minAutoOnboardingRate, comparator: ">=" },
    { id: "intervention-project-rate", pass: interventionProjectRate <= corpus.gate.maxInterventionProjectRate, observed: interventionProjectRate, required: corpus.gate.maxInterventionProjectRate, comparator: "<=" },
    { id: "deterministic-replay-rate", pass: replayRate >= corpus.gate.minDeterministicReplayRate, observed: replayRate, required: corpus.gate.minDeterministicReplayRate, comparator: ">=" },
    { id: "project-specific-adapter-loc", pass: adapterLoc <= corpus.gate.maxAdapterLoc, observed: adapterLoc, required: corpus.gate.maxAdapterLoc, comparator: "<=" },
  ];
  if (corpus.gate.minTargetCount != null) checks.push({ id: "target-count", pass: projectCount >= corpus.gate.minTargetCount, observed: projectCount, required: corpus.gate.minTargetCount, comparator: ">=" });
  if (corpus.gate.minRepositoryCount != null) checks.push({ id: "repository-count", pass: repositoryCount >= corpus.gate.minRepositoryCount, observed: repositoryCount, required: corpus.gate.minRepositoryCount, comparator: ">=" });
  if (requiredTags.length > 0) checks.push({ id: "required-tag-coverage", pass: missingRequiredTags.length === 0, observed: [...observedTags].sort(), required: requiredTags, comparator: "contains-all" });
  if (requiredTopologies.length > 0) checks.push({ id: "required-topology-coverage", pass: missingRequiredTopologies.length === 0, observed: [...observedTopologies].sort(), required: requiredTopologies, comparator: "contains-all" });
  if (diff) checks.push({ id: "onboarding-regressions", pass: diff.regressionCount <= corpus.gate.maxRegressions, observed: diff.regressionCount, required: corpus.gate.maxRegressions, comparator: "<=" });
  return {
    ok: checks.every((check) => check.pass),
    thresholds: corpus.gate,
    interventionProjectRate,
    deterministicReplayRate: replayRate,
    projectSpecificAdapterLoc: adapterLoc,
    repositoryCount,
    requiredTags,
    missingRequiredTags,
    requiredTopologies,
    missingRequiredTopologies,
    checks,
    diff,
  };
}
