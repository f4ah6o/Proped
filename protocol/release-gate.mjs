import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebProjectBenchmarkBaseline } from "./web-project-baseline.mjs";
import { resolveWebProjectCorpus } from "./web-project-corpus.mjs";

export const RELEASE_GATE_VERSION = 1;

function check(id, pass, observed, required) {
  return { id, pass: pass === true, observed, required };
}

function unique(values) {
  return [...new Set(values)].sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

export function evaluatePromotionContract({ promotedCorpus, baseline, evidence, nextFrontier }) {
  const targets = promotedCorpus.targets ?? [];
  const topologyIds = targets.map((target) => target.topology?.id).filter(Boolean);
  const repositories = unique(targets.map((target) => target.repository));
  const baselineProjects = baseline.projects ?? [];
  const evidenceProjects = evidence.projects ?? [];
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const promotedTopologyIds = new Set(topologyIds);
  const nextTopologyIds = (nextFrontier.topologies ?? []).map((entry) => entry.id);
  const overlap = unique(nextTopologyIds.filter((id) => promotedTopologyIds.has(id)));

  const checks = [
    check("promoted-target-count", targets.length === 7, targets.length, 7),
    check("promoted-repository-count", repositories.length === 7, repositories.length, 7),
    check("promoted-topology-count", unique(topologyIds).length === 7, unique(topologyIds), "7 unique topology ids"),
    check("promoted-exact-revisions", targets.every((target) => fullSha(target.revision)), targets.map((target) => target.revision), "all full 40-char SHAs"),
    check("promoted-git-sources", targets.every((target) => target.source?.kind === "git" && typeof target.source.checkout === "string"), targets.map((target) => target.source?.kind ?? null), "all git"),
    check("promoted-adapter-loc", targets.every((target) => target.adapterLoc === 0), targets.map((target) => target.adapterLoc), "all 0"),
    check("promoted-auto-onboarding-threshold", promotedCorpus.gate?.minAutoOnboardingRate === 1, promotedCorpus.gate?.minAutoOnboardingRate, 1),
    check("promoted-intervention-threshold", promotedCorpus.gate?.maxInterventionProjectRate === 0, promotedCorpus.gate?.maxInterventionProjectRate, 0),
    check("promoted-replay-threshold", promotedCorpus.gate?.minDeterministicReplayRate === 1, promotedCorpus.gate?.minDeterministicReplayRate, 1),
    check("promoted-regression-budget", promotedCorpus.gate?.maxRegressions === 0, promotedCorpus.gate?.maxRegressions, 0),
    check("promoted-required-topologies", unique(promotedCorpus.gate?.requiredTopologies ?? []).join("\n") === unique(topologyIds).join("\n"), promotedCorpus.gate?.requiredTopologies ?? [], unique(topologyIds)),
    check("promoted-baseline-corpus", baseline.corpus?.id === promotedCorpus.id && baseline.corpus?.semanticHash === promotedCorpus.semanticHash, baseline.corpus, { id: promotedCorpus.id, semanticHash: promotedCorpus.semanticHash }),
    check("promoted-baseline-target-count", baselineProjects.length === 7, baselineProjects.length, 7),
    check("promoted-baseline-green", baselineProjects.every((project) => project.autoOnboarded === true && project.deterministicReplay === true && project.humanInterventions === 0), baselineProjects.map((project) => ({ id: project.corpusEntryId, autoOnboarded: project.autoOnboarded, deterministicReplay: project.deterministicReplay, humanInterventions: project.humanInterventions })), "all auto-onboarded/replay deterministic/interventions 0"),
    check("promotion-evidence-runtime", evidence.schemaVersion === 1 && evidence.runtime === "frontier-promotion-evidence", { schemaVersion: evidence.schemaVersion, runtime: evidence.runtime }, { schemaVersion: 1, runtime: "frontier-promotion-evidence" }),
    check("promotion-evidence-eligible", evidence.frontierScore?.promotionEligible === true, evidence.frontierScore?.promotionEligible, true),
    check("promotion-evidence-viability", evidence.frontierScore?.viability?.qualified === 7 && evidence.frontierScore?.viability?.failed === 0 && evidence.frontierScore?.viability?.unknown === 0, evidence.frontierScore?.viability, { qualified: 7, failed: 0, unknown: 0 }),
    check("promotion-evidence-auto-onboarding", evidence.frontierScore?.autoOnboarded?.count === 7 && evidence.frontierScore?.autoOnboarded?.total === 7 && evidence.frontierScore?.autoOnboarded?.rate === 1, evidence.frontierScore?.autoOnboarded, { count: 7, total: 7, rate: 1 }),
    check("promotion-evidence-replay", evidence.frontierScore?.deterministicReplay?.count === 7 && evidence.frontierScore?.deterministicReplay?.observed === 7 && evidence.frontierScore?.deterministicReplay?.rate === 1, evidence.frontierScore?.deterministicReplay, { count: 7, observed: 7, rate: 1 }),
    check("promotion-evidence-interventions", evidence.frontierScore?.interventions?.projectCount === 0 && evidence.frontierScore?.interventions?.total === 0, evidence.frontierScore?.interventions, { projectCount: 0, total: 0 }),
    check("promotion-evidence-adapter-loc", evidence.frontierScore?.adapterLoc === 0, evidence.frontierScore?.adapterLoc, 0),
    check("promotion-evidence-clean-checkout", evidence.checkoutCleanup?.ok === true && (evidence.checkoutCleanup?.dirtyCheckouts ?? []).length === 0, evidence.checkoutCleanup, { ok: true, dirtyCheckouts: [] }),
    check("promotion-evidence-projects", evidenceProjects.length === targets.length && evidenceProjects.every((project) => {
      const target = targetById.get(project.id);
      return target
        && project.repository === target.repository
        && project.revision === target.revision
        && project.autoOnboarded === true
        && project.deterministicReplay === true
        && project.humanInterventions === 0
        && project.adapterLoc === 0
        && project.viability === "qualified";
    }), evidenceProjects.map((project) => project.id), targets.map((target) => target.id)),
    check("next-frontier-schema", nextFrontier.schemaVersion === 1 && nextFrontier.id === "external-next-frontier", { schemaVersion: nextFrontier.schemaVersion, id: nextFrontier.id }, { schemaVersion: 1, id: "external-next-frontier" }),
    check("next-frontier-size", nextTopologyIds.length >= 7 && unique(nextTopologyIds).length === nextTopologyIds.length, nextTopologyIds, ">=7 unique topology ids"),
    check("next-frontier-no-promotion-overlap", overlap.length === 0 && nextFrontier.policy?.promotionOverlapAllowed === false, { overlap, promotionOverlapAllowed: nextFrontier.policy?.promotionOverlapAllowed }, { overlap: [], promotionOverlapAllowed: false }),
    check("next-frontier-adapter-policy", nextFrontier.policy?.projectSpecificAdapterLoc === 0, nextFrontier.policy?.projectSpecificAdapterLoc, 0),
    check("next-frontier-machine-readable-axes", (nextFrontier.topologies ?? []).every((entry) => typeof entry.axis === "string" && entry.axis.length > 0 && Array.isArray(entry.requirements) && entry.requirements.length > 0), nextFrontier.topologies?.map((entry) => entry.id) ?? [], "all entries have axis + requirements"),
  ];

  return { ok: checks.every((entry) => entry.pass), checks, promotedTopologyIds: unique(topologyIds), nextTopologyIds: unique(nextTopologyIds) };
}

export function evaluateReleaseGate({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const promotedCorpus = resolveWebProjectCorpus(path.join(root, "protocol/fixtures/promoted-production-corpus.json"));
  const externalProduction = resolveWebProjectCorpus(path.join(root, "protocol/fixtures/external-production-corpus.json"));
  const production = resolveWebProjectCorpus(path.join(root, "protocol/fixtures/production-campaign-corpus.json"));
  const baseline = loadWebProjectBenchmarkBaseline(path.join(root, "protocol/fixtures/promoted-production-baseline.json"));
  const productionBaseline = loadWebProjectBenchmarkBaseline(path.join(root, "protocol/fixtures/production-campaign-baseline.json"));
  const evidence = readJson(path.join(root, "protocol/fixtures/frontier-7of7-promotion-evidence.json"));
  const nextFrontier = readJson(path.join(root, "protocol/fixtures/external-next-frontier-corpus.json"));
  const promotion = evaluatePromotionContract({ promotedCorpus, baseline, evidence, nextFrontier });

  const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/release.yaml"), "utf8");
  const managedSetupTest = fs.readFileSync(path.join(root, "scripts/test_managed_setup.py"), "utf8");
  const nativePackageTest = fs.readFileSync(path.join(root, "scripts/test_native_package.py"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const readmeJa = fs.readFileSync(path.join(root, "README.ja.md"), "utf8");
  const changes = fs.readFileSync(path.join(root, "CHANGES.md"), "utf8");

  const staticChecks = [
    check("self-contained-production-baseline", productionBaseline.corpus.id === production.id && productionBaseline.corpus.semanticHash === production.semanticHash, productionBaseline.corpus, { id: production.id, semanticHash: production.semanticHash }),
    check("external-production-strict", externalProduction.gate.minAutoOnboardingRate === 1 && externalProduction.gate.maxInterventionProjectRate === 0 && externalProduction.gate.minDeterministicReplayRate === 1 && externalProduction.gate.maxAdapterLoc === 0 && externalProduction.gate.maxRegressions === 0, externalProduction.gate, "1/0/1/0/0"),
    check("ci-self-contained-production", ci.includes("Production onboarding baseline gate") && ci.includes("production-campaign-baseline.json"), "Production onboarding baseline gate", true),
    check("ci-external-production", ci.includes("External production regression gate") && ci.includes("--corpus external-production"), "External production regression gate", true),
    check("ci-promoted-production", ci.includes("Promoted frontier production regression gate") && ci.includes("promoted-production-baseline.json"), "Promoted frontier production regression gate", true),
    check("ci-strict-checkout-root", ci.includes(".tmp/ci-external-production") && ci.includes(".tmp/ci-promoted-production") && !ci.includes("--checkout-root /tmp/"), "workspace-local strict corpus checkout roots", true),
    check("ci-linux-strict-sandbox", ci.includes("Verify Linux strict Web execution sandbox") && ci.includes("bubblewrap"), "Linux strict sandbox", true),
    check("ci-macos-constrained-sandbox", ci.includes("Verify macOS constrained Web execution sandbox"), "macOS constrained sandbox", true),
    check("ci-managed-runtime-matrix", ci.includes("managed-runtime-distribution") && ci.includes("ubuntu-latest") && ci.includes("macos-latest") && ci.includes("windows-latest"), "managed runtime distribution matrix", true),
    check("clean-environment-campaign", managedSetupTest.includes('"web", "campaign"') && managedSetupTest.includes('"setup", "--json"') && managedSetupTest.includes('"doctor", "--json"'), "setup -> doctor -> web campaign", true),
    check("distribution-contract-test", nativePackageTest.includes("nodeBinaryEmbedded") && nativePackageTest.includes("chromiumEmbedded") && nativePackageTest.includes("nodeModulesEmbedded"), "archive excludes Node/node_modules/Chromium", true),
    check("release-source-provenance", releaseWorkflow.includes("SOURCE_SHA") && releaseWorkflow.includes("--provenance") && releaseWorkflow.includes("Verify source belongs to main history"), "source SHA provenance", true),
    check("release-gate-wired", releaseWorkflow.includes("Release acceptance contract") && releaseWorkflow.includes("scripts/release_gate.mjs"), "release gate before immutable tag", true),
    check("release-native-artifacts", releaseWorkflow.includes("native-artifacts") && releaseWorkflow.includes("scripts/package_native_cli.py") && releaseWorkflow.includes("gh release create"), "cross-platform artifacts + GitHub Release", true),
    check("docs-production-promotion", readme.includes("promoted-production") && readmeJa.includes("promoted-production"), "README + README.ja promoted production documentation", true),
    check("changes-production-promotion", changes.includes("promoted-production") && changes.includes("7/7"), "CHANGES promotion evidence", true),
  ];

  const checks = [...promotion.checks, ...staticChecks];
  return {
    ok: checks.every((entry) => entry.pass),
    schemaVersion: RELEASE_GATE_VERSION,
    runtime: "proped-release-gate",
    checks,
    summary: {
      passed: checks.filter((entry) => entry.pass).length,
      failed: checks.filter((entry) => !entry.pass).map((entry) => entry.id),
      promotedTopologies: promotion.promotedTopologyIds,
      nextFrontierTopologies: promotion.nextTopologyIds,
    },
  };
}
