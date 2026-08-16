import fs from "node:fs";
import path from "node:path";
import { semanticHash } from "./ui-driver-v1.mjs";
import { runUnknownWebProjectBenchmark, summarizeWebProjectBenchmark } from "./web-project-benchmark.mjs";
import { corpusHasExternalTargets, corpusProjectPaths, evaluateWebProjectBenchmarkGate } from "./web-project-corpus.mjs";
import {
  captureMaterializedWebProjectCorpusState,
  materializeWebProjectCorpus,
  restoreMaterializedWebProjectCorpus,
  verifyMaterializedWebProjectCorpus,
} from "./web-project-corpus-materialize.mjs";
import { evaluateWebProjectBenchmarkBaselineGate, loadWebProjectBenchmarkBaseline } from "./web-project-baseline.mjs";

export const WEB_PROJECT_BENCHMARK_SHARD_VERSION = 1;

function fail(message, code = "invalid_benchmark_shard", details = {}) {
  const error = new Error(`Web project benchmark shard: ${message}`);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function corpusIdentity(corpus) {
  return {
    id: corpus.id,
    schemaVersion: corpus.schemaVersion,
    semanticHash: corpus.semanticHash,
    targetCount: corpus.targets.length,
  };
}

function targetCheckoutKey(target) {
  return target.source?.kind === "git" ? target.source.checkout : `target-${target.id}`;
}

export function productionContractShardPlan(corpus) {
  const groups = new Map();
  for (const target of corpus.targets) {
    const checkoutKey = targetCheckoutKey(target);
    const group = groups.get(checkoutKey) ?? { shard: checkoutKey, checkoutKey, targetIds: [] };
    group.targetIds.push(target.id);
    groups.set(checkoutKey, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    targetIds: [...group.targetIds],
  }));
}

export function productionContractShardMatrix(corpora) {
  return {
    include: corpora.flatMap((corpus) => productionContractShardPlan(corpus).map((group) => ({
      corpus: corpus.id,
      shard: group.shard,
      targets: group.targetIds.join(","),
      checkout_root: `.tmp/ci-${corpus.id}-${group.shard}`,
    }))),
  };
}

export function selectWebProjectCorpusShard(corpus, targetIds) {
  if (!Array.isArray(targetIds) || targetIds.length === 0) fail("targetIds must be a non-empty array", "shard_targets_required");
  if (targetIds.some((id) => typeof id !== "string" || id.length === 0)) fail("targetIds must contain non-empty strings", "invalid_shard_target");
  const requested = new Set(targetIds);
  if (requested.size !== targetIds.length) fail("targetIds contain duplicates", "duplicate_shard_target");
  const byId = new Map(corpus.targets.map((target) => [target.id, target]));
  const unknown = targetIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) fail(`unknown target(s): ${unknown.join(", ")}`, "unknown_shard_target", { targetIds: unknown });

  const selected = corpus.targets.filter((target) => requested.has(target.id));
  const selectedCheckouts = new Set(selected.filter((target) => target.source?.kind === "git").map((target) => target.source.checkout));
  for (const checkoutKey of selectedCheckouts) {
    const siblings = corpus.targets
      .filter((target) => target.source?.kind === "git" && target.source.checkout === checkoutKey)
      .map((target) => target.id);
    const missing = siblings.filter((id) => !requested.has(id));
    if (missing.length > 0) {
      fail(`checkout ${checkoutKey} must stay in one shard; missing ${missing.join(", ")}`, "incomplete_checkout_shard", {
        checkoutKey,
        missingTargetIds: missing,
      });
    }
  }
  return { ...corpus, targets: selected };
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
      nestedSources: (entry.nestedSources ?? []).map((nested) => ({
        path: nested.path,
        revision: nested.revision,
        origin: nested.origin,
        head: nested.head,
        dirty: nested.dirty,
        ok: nested.ok,
        errors: nested.errors ?? [],
      })),
    })),
    projects: (result.projects ?? []).map((entry) => ({
      id: entry.id,
      checkoutKey: entry.checkoutKey ?? null,
      exists: entry.exists,
    })),
  };
}

function stableCleanupEvidence(result) {
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
      nestedSources: (entry.nestedSources ?? []).map((nested) => ({
        path: nested.path,
        revision: nested.revision,
        head: nested.head,
        dirty: nested.dirty,
        ok: nested.ok,
        errors: nested.errors ?? [],
      })),
    })),
  };
}

function normalizeShardProjects(corpus, projects) {
  const indexById = new Map(corpus.targets.map((target, index) => [target.id, index]));
  return projects.map((project) => ({
    ...project,
    index: indexById.get(project.corpusEntryId) ?? project.index,
  }));
}

export function createWebProjectCorpusShardSummary(corpus, targetIds, base, { materialization = null, checkoutCleanup = null } = {}) {
  const shardCorpus = selectWebProjectCorpusShard(corpus, targetIds);
  const projectIds = (base.projects ?? []).map((project) => project.corpusEntryId);
  if (projectIds.length !== shardCorpus.targets.length || new Set(projectIds).size !== projectIds.length) {
    fail("shard project results do not match the selected target count", "shard_project_mismatch");
  }
  const expected = shardCorpus.targets.map((target) => target.id);
  if (expected.some((id) => !projectIds.includes(id)) || projectIds.some((id) => !expected.includes(id))) {
    fail("shard project results do not match selected targets", "shard_project_mismatch", { expected, observed: projectIds });
  }
  const stable = {
    schemaVersion: WEB_PROJECT_BENCHMARK_SHARD_VERSION,
    runtime: "unknown-web-project-benchmark-shard",
    ok: true,
    projectOutcomeOk: base.ok === true,
    corpus: corpusIdentity(corpus),
    shard: {
      targetIds: expected,
      checkoutKeys: unique(shardCorpus.targets.map(targetCheckoutKey)),
    },
    projectCount: base.projectCount,
    projects: normalizeShardProjects(corpus, base.projects),
    ...(materialization ? { materialization: stableMaterializationEvidence(materialization) } : {}),
    ...(checkoutCleanup ? { checkoutCleanup: stableCleanupEvidence(checkoutCleanup) } : {}),
  };
  return { ...stable, semanticHash: semanticHash(stable) };
}

export function materializeWebProjectCorpusShard(corpus, targetIds, options = {}) {
  const shardCorpus = selectWebProjectCorpusShard(corpus, targetIds);
  return materializeWebProjectCorpus(shardCorpus, options);
}

export function runWebProjectCorpusShard(corpus, targetIds, options = {}) {
  const shardCorpus = selectWebProjectCorpusShard(corpus, targetIds);
  const materialization = corpusHasExternalTargets(shardCorpus)
    ? verifyMaterializedWebProjectCorpus(shardCorpus, { checkoutRoot: options.checkoutRoot })
    : null;
  if (materialization && !materialization.ok) {
    fail("external shard checkout verification failed; materialize the shard first", "corpus_checkout_invalid", { materialization });
  }
  const materializationState = materialization
    ? captureMaterializedWebProjectCorpusState(shardCorpus, { checkoutRoot: options.checkoutRoot })
    : null;
  const projectPaths = corpusProjectPaths(shardCorpus, { checkoutRoot: options.checkoutRoot });
  const workspaceRoots = shardCorpus.targets.map((target) => target.source?.nestedSources?.length > 0
    ? path.resolve(options.checkoutRoot, target.source.checkout)
    : null);
  let base;
  let executionError = null;
  let checkoutCleanup = null;
  try {
    base = runUnknownWebProjectBenchmark(projectPaths, {
      ...options,
      entries: shardCorpus.targets,
      workspaceRoots,
      writeArtifacts: false,
    });
  } catch (error) {
    executionError = error;
  } finally {
    if (materialization) {
      checkoutCleanup = restoreMaterializedWebProjectCorpus(shardCorpus, {
        checkoutRoot: options.checkoutRoot,
        baselineState: materializationState,
      });
    }
  }
  if (executionError) throw executionError;
  if (checkoutCleanup && !checkoutCleanup.ok) {
    fail("external shard checkout cleanup failed", "corpus_checkout_cleanup_failed", { checkoutCleanup });
  }
  return createWebProjectCorpusShardSummary(corpus, targetIds, base, { materialization, checkoutCleanup });
}

function campaignResultFromStableProject(project) {
  return {
    benchmarkEntry: {
      id: project.corpusEntryId,
      repository: project.repository,
      revision: project.revision,
      adapterLoc: project.adapterLoc ?? 0,
      tags: project.tags ?? [],
    },
    id: project.id,
    status: project.status,
    autoOnboarded: project.autoOnboarded === true,
    qualityPassed: project.qualityPassed,
    humanInterventions: project.humanInterventions ?? 0,
    interventionReasons: (project.interventionReasonCodes ?? []).map((code) => ({ code })),
    failureClasses: project.failureClasses ?? [],
    deterministicReplay: project.deterministicReplay,
    findingQuality: project.findingQuality ?? null,
    findingGroupIds: project.findingGroupIds ?? [],
    actionableFindingGroupIds: project.actionableFindingGroupIds ?? [],
    oneMinimalFindingGroupIds: project.oneMinimalFindingGroupIds ?? [],
    viability: project.viability,
    runtimeProfile: project.runtimeProfile ?? null,
    metrics: project.metrics ?? { states: 0, transitions: 0, actions: 0 },
    stages: (project.failureDiagnostics ?? []).map((diagnostic) => ({ ...diagnostic })),
  };
}

function validateShardSummary(summary, corpus) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) fail("shard summary must be an object", "invalid_shard_artifact");
  if (summary.schemaVersion !== WEB_PROJECT_BENCHMARK_SHARD_VERSION || summary.runtime !== "unknown-web-project-benchmark-shard") {
    fail("unsupported shard summary", "invalid_shard_artifact");
  }
  const observedHash = summary.semanticHash;
  const { semanticHash: _ignored, ...stable } = summary;
  if (typeof observedHash !== "string" || observedHash !== semanticHash(stable)) fail("shard semanticHash mismatch", "invalid_shard_artifact");
  const expectedCorpus = corpusIdentity(corpus);
  if (JSON.stringify(summary.corpus) !== JSON.stringify(expectedCorpus)) {
    fail("shard corpus identity does not match aggregate corpus", "shard_corpus_mismatch", {
      expected: expectedCorpus,
      observed: summary.corpus,
    });
  }
  const selected = selectWebProjectCorpusShard(corpus, summary.shard?.targetIds ?? []);
  const expectedIds = selected.targets.map((target) => target.id);
  const projectIds = (summary.projects ?? []).map((project) => project.corpusEntryId);
  if (projectIds.length !== expectedIds.length || new Set(projectIds).size !== projectIds.length || expectedIds.some((id) => !projectIds.includes(id))) {
    fail("shard artifact projects do not match its targetIds", "shard_project_mismatch", { expected: expectedIds, observed: projectIds });
  }
  return summary;
}

export function aggregateWebProjectCorpusShards(corpus, shardSummaries, options = {}) {
  if (!Array.isArray(shardSummaries) || shardSummaries.length === 0) fail("aggregate requires shard summaries", "shard_artifacts_required");
  const validated = shardSummaries.map((summary) => validateShardSummary(summary, corpus));
  const expectedIds = corpus.targets.map((target) => target.id);
  const projectById = new Map();
  const shardEvidence = [];
  for (const summary of validated) {
    for (const project of summary.projects) {
      const id = project.corpusEntryId;
      if (projectById.has(id)) fail(`duplicate target across shards: ${id}`, "duplicate_shard_target", { targetId: id });
      projectById.set(id, project);
    }
    shardEvidence.push({
      targetIds: [...summary.shard.targetIds],
      checkoutKeys: [...summary.shard.checkoutKeys],
      semanticHash: summary.semanticHash,
    });
  }
  const missing = expectedIds.filter((id) => !projectById.has(id));
  const extra = [...projectById.keys()].filter((id) => !expectedIds.includes(id));
  if (missing.length > 0 || extra.length > 0) fail("shards do not cover the corpus exactly", "incomplete_shard_coverage", { missing, extra });

  const campaignResults = expectedIds.map((id) => campaignResultFromStableProject(projectById.get(id)));
  const base = summarizeWebProjectBenchmark(campaignResults);
  const qualityGate = evaluateWebProjectBenchmarkGate(base, corpus, null);
  const baseline = options.baseline ? loadWebProjectBenchmarkBaseline(options.baseline) : null;
  const identity = corpusIdentity(corpus);
  const baselineGate = baseline
    ? evaluateWebProjectBenchmarkBaselineGate(baseline, { ...base, corpus: { id: corpus.id, semanticHash: corpus.semanticHash } }, { maxRegressions: corpus.gate.maxRegressions })
    : null;
  const stable = {
    ...base,
    ok: qualityGate.ok && (baselineGate?.ok ?? true),
    corpus: identity,
    qualityGate,
    baselineGate,
    shards: shardEvidence.sort((a, b) => a.targetIds[0].localeCompare(b.targetIds[0])),
  };
  return {
    ...stable,
    semanticHash: semanticHash({
      benchmarkSemanticHash: base.semanticHash,
      corpus: identity,
      qualityGate,
      baselineGate,
      shards: stable.shards,
    }),
  };
}

export function readWebProjectCorpusShardSummaries(inputDir, corpusId) {
  const root = path.resolve(inputDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`input directory not found: ${root}`, "shard_input_missing");
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(root, entry.name))
    .sort();
  const summaries = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      fail(`cannot read shard artifact ${file}: ${error.message}`, "invalid_shard_artifact");
    }
    if (parsed?.runtime === "unknown-web-project-benchmark-shard" && parsed?.corpus?.id === corpusId) summaries.push(parsed);
  }
  if (summaries.length === 0) fail(`no shard artifacts found for ${corpusId}`, "shard_artifacts_required");
  return summaries;
}

export function writeWebProjectBenchmarkJson(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return absolute;
}
