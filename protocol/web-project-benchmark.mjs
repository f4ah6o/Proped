import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";
import { runUnknownWebProjectCampaign } from "./web-project-campaign.mjs";
import { corpusHasExternalTargets, corpusProjectPaths, evaluateWebProjectBenchmarkGate } from "./web-project-corpus.mjs";
import { captureMaterializedWebProjectCorpusState, restoreMaterializedWebProjectCorpus, verifyMaterializedWebProjectCorpus } from "./web-project-corpus-materialize.mjs";
import { evaluateWebProjectBenchmarkBaselineGate, loadWebProjectBenchmarkBaseline } from "./web-project-baseline.mjs";

export const WEB_PROJECT_BENCHMARK_VERSION = 3;

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function emptyFindingQuality() {
  return {
    eligibleFindingGroupCount: 0,
    deterministicFindingGroups: 0,
    replayableFindingGroups: 0,
    actionableFindingGroups: 0,
    actionableFindingRate: null,
    oneMinimalFindingGroups: 0,
    oneMinimalRateAmongReplayable: null,
    strongFindingGroups: 0,
    singletonFindingGroups: 0,
    representativeActionsBefore: 0,
    representativeActionsAfter: 0,
    privacyProvenanceRejections: {},
  };
}

function stableProjectResult(result, index) {
  const entry = result.benchmarkEntry ?? null;
  const failureDiagnostics = (result.stages ?? [])
    .filter((stage) => typeof stage?.diagnostic === "string" && stage.diagnostic.length > 0)
    .map((stage) => ({ id: stage.id, status: stage.status, exitCode: stage.exitCode, diagnostic: stage.diagnostic }));
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
    findingQuality: { ...emptyFindingQuality(), ...(result.findingQuality ?? {}) },
    findingGroupIds: unique(result.findingGroupIds ?? (result.findings ?? []).map((finding) => finding?.findingGroupId)),
    actionableFindingGroupIds: unique(result.actionableFindingGroupIds ?? (result.actionableFindings ?? result.findings?.filter((finding) => finding?.actionable === true) ?? []).map((finding) => finding?.findingGroupId)),
    oneMinimalFindingGroupIds: unique(result.oneMinimalFindingGroupIds ?? (result.findings ?? []).filter((finding) => finding?.representativeReplay?.minimality === "one-minimal").map((finding) => finding?.findingGroupId)),
    viability: result.viability ?? (result.autoOnboarded === true
      ? { status: "qualified", stage: "campaign", reason: "full_campaign_completed" }
      : { status: "unknown", stage: null, reason: "qualification_not_observed" }),
    runtimeProfile: result.runtimeProfile ?? null,
    metrics: {
      states: result.metrics?.states ?? 0,
      transitions: result.metrics?.transitions ?? 0,
      actions: result.metrics?.actions ?? 0,
    },
    ...(failureDiagnostics.length > 0 ? { failureDiagnostics } : {}),
  };
}

function distribution(values) {
  const counts = {};
  for (const value of values) {
    const key = value == null || value === "" ? "none" : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
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
  const deterministicReplayRate = replayObservedProjectCount > 0 ? deterministicReplayProjectCount / replayObservedProjectCount : null;
  const projectSpecificAdapterLoc = projects.reduce((total, project) => total + (project.adapterLoc ?? 0), 0);
  const findingTotals = projects.reduce((total, project) => {
    const quality = project.findingQuality ?? emptyFindingQuality();
    for (const key of [
      "eligibleFindingGroupCount", "deterministicFindingGroups", "replayableFindingGroups", "actionableFindingGroups",
      "oneMinimalFindingGroups", "strongFindingGroups", "singletonFindingGroups", "representativeActionsBefore", "representativeActionsAfter",
    ]) total[key] += quality[key] ?? 0;
    for (const [reason, count] of Object.entries(quality.privacyProvenanceRejections ?? {})) {
      total.privacyProvenanceRejections[reason] = (total.privacyProvenanceRejections[reason] ?? 0) + count;
    }
    return total;
  }, {
    eligibleFindingGroupCount: 0, deterministicFindingGroups: 0, replayableFindingGroups: 0, actionableFindingGroups: 0,
    oneMinimalFindingGroups: 0, strongFindingGroups: 0, singletonFindingGroups: 0, representativeActionsBefore: 0, representativeActionsAfter: 0,
    privacyProvenanceRejections: {},
  });
  const findingQuality = {
    ...findingTotals,
    actionableFindingRate: findingTotals.deterministicFindingGroups > 0
      ? findingTotals.actionableFindingGroups / findingTotals.deterministicFindingGroups
      : null,
    oneMinimalRateAmongReplayable: findingTotals.replayableFindingGroups > 0
      ? findingTotals.oneMinimalFindingGroups / findingTotals.replayableFindingGroups
      : null,
    findingGroupIds: unique(projects.flatMap((project) => project.findingGroupIds ?? [])),
    actionableFindingGroupIds: unique(projects.flatMap((project) => project.actionableFindingGroupIds ?? [])),
    oneMinimalFindingGroupIds: unique(projects.flatMap((project) => project.oneMinimalFindingGroupIds ?? [])),
    privacyProvenanceRejections: Object.fromEntries(Object.entries(findingTotals.privacyProvenanceRejections).sort(([left], [right]) => left.localeCompare(right))),
  };
  const interventionReasonDistribution = distribution(projects.flatMap((project) => project.interventionReasonCodes));
  const viabilityDistribution = distribution(projects.map((project) => project.viability?.status ?? "unknown"));
  const viabilityFailureDistribution = distribution(projects
    .filter((project) => project.viability?.status === "failed")
    .map((project) => project.viability?.reason ?? "unknown"));
  const metrics = projects.reduce((total, project) => ({
    states: total.states + project.metrics.states,
    transitions: total.transitions + project.metrics.transitions,
    actions: total.actions + project.metrics.actions,
  }), { states: 0, transitions: 0, actions: 0 });
  const runtimeDistribution = {
    frameworks: distribution(projects.map((project) => project.runtimeProfile?.framework ?? null)),
    projectModes: distribution(projects.map((project) => project.runtimeProfile?.projectMode ?? null)),
    serverModes: distribution(projects.map((project) => project.runtimeProfile?.serverMode ?? null)),
    packageManagers: distribution(projects.map((project) => project.runtimeProfile?.packageManager ?? null)),
    stateSources: distribution(projects.flatMap((project) => project.runtimeProfile?.stateSources ?? [])),
  };
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
    deterministicReplayRate,
    projectSpecificAdapterLoc,
    findingQuality,
    interventionReasonDistribution,
    viabilityDistribution,
    viabilityFailureDistribution,
    metrics,
    runtimeDistribution,
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
      prepareTimeoutMs: options.prepareTimeoutMs,
      workspaceRoot: options.workspaceRoots?.[index] ?? null,
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

function stableMaterializationEvidence(result) {
  if (!result) return null;
  return {
    ok: result.ok,
    corpus: result.corpus,
    checkoutCount: result.checkoutCount,
    targetCount: result.targetCount,
    checkouts: (result.checkouts ?? []).map((entry) => ({
      checkoutKey: entry.checkoutKey,
      repository: entry.repository,
      revision: entry.revision,
      targetIds: entry.targetIds ?? [],
      origin: entry.origin,
      head: entry.head,
      dirty: entry.dirty,
      ok: entry.ok,
      errors: entry.errors ?? [],
      nestedSources: (entry.nestedSources ?? []).map((nested) => ({ path: nested.path, revision: nested.revision, origin: nested.origin, head: nested.head, dirty: nested.dirty, ok: nested.ok, errors: nested.errors ?? [] })),
    })),
    projects: (result.projects ?? []).map((entry) => ({
      id: entry.id,
      checkoutKey: entry.checkoutKey ?? null,
      exists: entry.exists,
    })),
  };
}

function stableCheckoutCleanupEvidence(result) {
  if (!result) return null;
  return {
    ok: result.ok,
    corpus: result.corpus,
    checkoutCount: result.checkoutCount,
    checkouts: (result.checkouts ?? []).map((entry) => ({
      checkoutKey: entry.checkoutKey,
      repository: entry.repository,
      revision: entry.revision,
      ok: entry.ok,
      errors: entry.errors ?? [],
      head: entry.head,
      dirty: entry.dirty,
      nestedSources: (entry.nestedSources ?? []).map((nested) => ({ path: nested.path, revision: nested.revision, head: nested.head, dirty: nested.dirty, ok: nested.ok, errors: nested.errors ?? [] })),
    })),
  };
}

function compareFindingQuality(current, previous) {
  if (!previous) return null;
  const currentActionable = new Set(current?.actionableFindingGroupIds ?? []);
  const previousActionable = new Set(previous?.actionableFindingGroupIds ?? []);
  return {
    actionableFindingRateDelta: typeof current?.actionableFindingRate === "number" && typeof previous?.actionableFindingRate === "number"
      ? current.actionableFindingRate - previous.actionableFindingRate
      : null,
    oneMinimalRateDelta: typeof current?.oneMinimalRateAmongReplayable === "number" && typeof previous?.oneMinimalRateAmongReplayable === "number"
      ? current.oneMinimalRateAmongReplayable - previous.oneMinimalRateAmongReplayable
      : null,
    lostActionableFindingGroupIds: [...previousActionable].filter((id) => !currentActionable.has(id)).sort(),
    gainedActionableFindingGroupIds: [...currentActionable].filter((id) => !previousActionable.has(id)).sort(),
  };
}

export function runWebProjectCorpusBenchmark(corpus, options = {}) {
  const materialization = corpusHasExternalTargets(corpus)
    ? verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot: options.checkoutRoot })
    : null;
  if (materialization && !materialization.ok) {
    const error = new Error("external corpus checkout verification failed; run web corpus verify/materialize first");
    error.code = "corpus_checkout_invalid";
    error.materialization = materialization;
    throw error;
  }
  const materializationState = materialization
    ? captureMaterializedWebProjectCorpusState(corpus, { checkoutRoot: options.checkoutRoot })
    : null;
  const projectPaths = corpusProjectPaths(corpus, { checkoutRoot: options.checkoutRoot });
  const workspaceRoots = corpus.targets.map((target) => target.source?.nestedSources?.length > 0
    ? path.resolve(options.checkoutRoot, target.source.checkout)
    : null);
  let base;
  let executionError = null;
  let checkoutCleanup = null;
  try {
    base = runUnknownWebProjectBenchmark(projectPaths, {
      ...options,
      entries: corpus.targets,
      workspaceRoots,
      writeArtifacts: false,
    });
  } catch (error) {
    executionError = error;
  } finally {
    if (materialization) checkoutCleanup = restoreMaterializedWebProjectCorpus(corpus, {
      checkoutRoot: options.checkoutRoot,
      baselineState: materializationState,
    });
  }
  if (executionError) throw executionError;
  if (checkoutCleanup && !checkoutCleanup.ok) {
    const error = new Error("external corpus checkout cleanup failed");
    error.code = "corpus_checkout_cleanup_failed";
    error.checkoutCleanup = checkoutCleanup;
    throw error;
  }
  const previous = readPreviousSummary(options.previous);
  const qualityGate = evaluateWebProjectBenchmarkGate(base, corpus, previous);
  const findingQualityRegression = compareFindingQuality(base.findingQuality, previous?.findingQuality ?? null);
  const baseline = options.baseline ? loadWebProjectBenchmarkBaseline(options.baseline) : null;
  const baselineGate = baseline ? evaluateWebProjectBenchmarkBaselineGate(baseline, { ...base, corpus: { id: corpus.id, semanticHash: corpus.semanticHash } }, { maxRegressions: corpus.gate.maxRegressions }) : null;
  const corpusIdentity = {
    id: corpus.id,
    schemaVersion: corpus.schemaVersion,
    semanticHash: corpus.semanticHash,
    targetCount: corpus.targets.length,
  };
  const qualifiedProjects = base.projects.filter((project) => project.viability?.status === "qualified");
  const failedViabilityProjects = base.projects.filter((project) => project.viability?.status === "failed");
  const unknownViabilityProjects = base.projects.filter((project) => project.viability?.status === "unknown");
  const qualifiedAutoOnboardedCount = qualifiedProjects.filter((project) => project.autoOnboarded).length;
  const frontierScore = corpus.id === "external-frontier" ? {
    autoOnboarded: { count: base.autoOnboardedCount, total: base.projectCount, rate: base.autoOnboardingRate },
    interventions: { projectCount: base.interventionProjectCount, total: base.humanInterventions, reasons: base.interventionReasonDistribution },
    viability: {
      qualified: qualifiedProjects.length,
      failed: failedViabilityProjects.length,
      unknown: unknownViabilityProjects.length,
      failures: base.viabilityFailureDistribution,
    },
    genericCapability: {
      autoOnboarded: qualifiedAutoOnboardedCount,
      observed: qualifiedProjects.length,
      rate: qualifiedProjects.length > 0 ? qualifiedAutoOnboardedCount / qualifiedProjects.length : null,
    },
    deterministicReplay: { count: base.deterministicReplayProjectCount, observed: base.replayObservedProjectCount, rate: base.deterministicReplayRate },
    adapterLoc: base.projectSpecificAdapterLoc,
    delta: previous ? {
      absorbed: qualityGate.diff?.improved ?? [],
      regressed: qualityGate.diff?.regressed ?? [],
      added: qualityGate.diff?.added ?? [],
      removed: qualityGate.diff?.removed ?? [],
    } : null,
    promotionEligible: qualifiedProjects.length === base.projectCount
      && base.autoOnboardedCount === base.projectCount
      && base.replayObservedProjectCount === base.projectCount
      && base.deterministicReplayProjectCount === base.projectCount
      && base.projectSpecificAdapterLoc === 0,
  } : null;
  const stable = {
    ...base,
    ok: qualityGate.ok && (baselineGate?.ok ?? true),
    corpus: corpusIdentity,
    qualityGate,
    baselineGate,
    ...(findingQualityRegression ? { findingQualityRegression } : {}),
    ...(frontierScore ? { frontierScore } : {}),
    ...(materialization ? { materialization, checkoutCleanup } : {}),
  };
  const result = {
    ...stable,
    semanticHash: semanticHash({
      benchmarkSemanticHash: base.semanticHash,
      corpus: corpusIdentity,
      qualityGate,
      baselineGate,
      ...(findingQualityRegression ? { findingQualityRegression } : {}),
      ...(frontierScore ? { frontierScore } : {}),
      ...(materialization ? {
        materialization: stableMaterializationEvidence(materialization),
        checkoutCleanup: stableCheckoutCleanupEvidence(checkoutCleanup),
      } : {}),
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
