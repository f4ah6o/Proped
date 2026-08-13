import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";
import { runUnknownWebProjectCampaign } from "./web-project-campaign.mjs";
import { corpusProjectPaths, evaluateWebProjectBenchmarkGate } from "./web-project-corpus.mjs";

export const WEB_PROJECT_BENCHMARK_VERSION = 2;

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function stableProjectResult(result, index) {
  const entry = result.benchmarkEntry ?? null;
  return {
    index,
    corpusEntryId: entry?.id ?? null,
    repository: entry?.repository ?? null,
    revision: entry?.revision ?? null,
    adapterLoc: entry?.adapterLoc ?? 0,
    tags: entry?.tags ?? [],
    id: result.id,
    status: result.status,
    autoOnboarded: result.autoOnboarded === true,
    qualityPassed: result.qualityPassed,
    humanInterventions: result.humanInterventions ?? 0,
    interventionReasonCodes: unique((result.interventionReasons ?? []).map((reason) => reason?.code)),
    failureClasses: unique(result.failureClasses ?? []),
    deterministicReplay: result.deterministicReplay,
    metrics: {
      states: result.metrics?.states ?? 0,
      transitions: result.metrics?.transitions ?? 0,
      actions: result.metrics?.actions ?? 0,
    },
  };
}

export function summarizeWebProjectBenchmark(campaignResults) {
  if (!Array.isArray(campaignResults) || campaignResults.length === 0) {
    throw new Error("benchmark requires at least one campaign result");
  }
  const projects = campaignResults.map(stableProjectResult);
  const autoOnboardedCount = projects.filter((project) => project.autoOnboarded).length;
  const interventionProjectCount = projects.filter((project) => project.humanInterventions > 0).length;
  const humanInterventions = projects.reduce((total, project) => total + project.humanInterventions, 0);
  const projectsWithFindings = projects.filter((project) => project.failureClasses.length > 0).length;
  const failureClasses = unique(projects.flatMap((project) => project.failureClasses));
  const deterministicReplayProjectCount = projects.filter((project) => project.deterministicReplay === true).length;
  const replayObservedProjectCount = projects.filter((project) => typeof project.deterministicReplay === "boolean").length;
  const metrics = projects.reduce((total, project) => ({
    states: total.states + project.metrics.states,
    transitions: total.transitions + project.metrics.transitions,
    actions: total.actions + project.metrics.actions,
  }), { states: 0, transitions: 0, actions: 0 });
  const stable = {
    schemaVersion: WEB_PROJECT_BENCHMARK_VERSION,
    runtime: "unknown-web-project-benchmark",
    projectCount: projects.length,
    autoOnboardedCount,
    autoOnboardingRate: autoOnboardedCount / projects.length,
    interventionProjectCount,
    humanInterventions,
    projectsWithFindings,
    uniqueFailureClassCount: failureClasses.length,
    failureClasses,
    deterministicReplayProjectCount,
    replayObservedProjectCount,
    metrics,
    projects,
  };
  return {
    ok: interventionProjectCount === 0,
    ...stable,
    semanticHash: semanticHash(stable),
  };
}

export function runUnknownWebProjectBenchmark(projectPaths, options = {}) {
  if (!Array.isArray(projectPaths) || projectPaths.length === 0) {
    throw new Error("benchmark requires at least one project path");
  }
  const campaignResults = projectPaths.map((projectPath, index) => {
    const result = runUnknownWebProjectCampaign(projectPath, {
      prepare: options.prepare,
      offline: options.offline,
      sandboxMode: options.sandboxMode,
      sourceEnvironment: options.sourceEnvironment,
      writeArtifacts: options.projectArtifacts === true,
    });
    if (options.entries?.[index]) result.benchmarkEntry = options.entries[index];
    return result;
  });
  const result = summarizeWebProjectBenchmark(campaignResults);
  if (options.writeArtifacts !== false) {
    const output = path.resolve(options.output ?? path.join(process.cwd(), ".proped", "benchmark"));
    fs.mkdirSync(output, { recursive: true });
    const summary = path.join(output, "summary.json");
    fs.writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`);
    return { ...result, artifacts: { directory: output, summary } };
  }
  return result;
}


function readPreviousSummary(file) {
  if (!file) return null;
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

export function runWebProjectCorpusBenchmark(corpus, options = {}) {
  const projectPaths = corpusProjectPaths(corpus);
  const base = runUnknownWebProjectBenchmark(projectPaths, {
    ...options,
    entries: corpus.targets,
    writeArtifacts: false,
  });
  const previous = readPreviousSummary(options.previous);
  const qualityGate = evaluateWebProjectBenchmarkGate(base, corpus, previous);
  const corpusIdentity = {
    id: corpus.id,
    schemaVersion: corpus.schemaVersion,
    semanticHash: corpus.semanticHash,
    targetCount: corpus.targets.length,
  };
  const stable = {
    ...base,
    ok: qualityGate.ok,
    corpus: corpusIdentity,
    qualityGate,
  };
  const result = {
    ...stable,
    semanticHash: semanticHash({
      benchmarkSemanticHash: base.semanticHash,
      corpus: corpusIdentity,
      qualityGate,
    }),
  };
  if (options.writeArtifacts !== false) {
    const output = path.resolve(options.output ?? path.join(process.cwd(), ".proped", "benchmark"));
    fs.mkdirSync(output, { recursive: true });
    const summary = path.join(output, "summary.json");
    fs.writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`);
    return { ...result, artifacts: { directory: output, summary } };
  }
  return result;
}
