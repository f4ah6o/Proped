import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";
import { runUnknownWebProjectCampaign } from "./web-project-campaign.mjs";

export const WEB_PROJECT_BENCHMARK_VERSION = 1;

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function stableProjectResult(result, index) {
  return {
    index,
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
  const campaignResults = projectPaths.map((projectPath) => runUnknownWebProjectCampaign(projectPath, {
    prepare: options.prepare,
    offline: options.offline,
    sandboxMode: options.sandboxMode,
    sourceEnvironment: options.sourceEnvironment,
    writeArtifacts: options.projectArtifacts === true,
  }));
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
