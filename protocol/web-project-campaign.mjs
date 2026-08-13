import fs from "node:fs";
import path from "node:path";
import { inspectWebProject } from "./web-project-inspect.mjs";
import {
  compileWebProjectManifestV2,
  createWebProjectManifestV2FromInspection,
  criticalWebProjectInferenceAmbiguities,
} from "./web-project-manifest-v2.mjs";
import { prepareWebProject, webProjectDependencyReadiness } from "./web-project-bootstrap.mjs";
import {
  applyNodeRuntimeToEnvironment,
  blockingNodeRequirementAmbiguities,
  resolveNodeRuntime,
  summarizeNodeRuntimeResolution,
} from "./web-node-runtime.mjs";
import {
  applyPackageManagerRuntimeEnvironment,
  probePackageManagerRuntime,
} from "./web-package-manager-runtime.mjs";
import { runWebProject } from "./web-project-runner.mjs";
import { discoverWebProjectWorkspacePrebuild, prepareWebProjectWorkspace } from "./web-project-workspace-prebuild.mjs";

export const WEB_PROJECT_CAMPAIGN_VERSION = 1;

const COMPLETED_STAGE_STATUSES = new Set(["pass", "quality_gate_failed"]);
const SANDBOX_MODES = new Set(["auto", "manifest", "strict", "constrained", "caller-enforced"]);

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function intervention(code, message, details = {}) {
  return { code, message, ...details };
}

function stageFailureClasses(stage) {
  return unique([
    ...(stage?.payload?.canonicalFailureClassIds ?? []),
    ...(stage?.payload?.replayGate?.stableFailureClassIds ?? []),
    ...(stage?.payload?.explorationReplayGate?.stableFailureClassIds ?? []),
  ]);
}

export function campaignFailureClasses(report) {
  return unique((report?.stages ?? []).flatMap(stageFailureClasses));
}

export function campaignReplayDeterminism(report) {
  const gates = (report?.stages ?? [])
    .flatMap((stage) => [stage?.payload?.replayGate, stage?.payload?.explorationReplayGate])
    .filter((gate) => gate && typeof gate === "object" && typeof gate.deterministic === "boolean");
  if (gates.length === 0) return null;
  return gates.every((gate) => gate.deterministic === true);
}

function campaignExplorationMetrics(report) {
  const browserStages = (report?.stages ?? []).filter((stage) => stage.kind === "browser");
  return {
    states: browserStages.reduce((total, stage) => total + (stage?.payload?.exploration?.states ?? 0), 0),
    transitions: browserStages.reduce((total, stage) => total + (stage?.payload?.exploration?.transitions ?? 0), 0),
    actions: browserStages.reduce((total, stage) => total + (stage?.payload?.actionCount ?? 0), 0),
  };
}

function stableStages(report) {
  return (report?.stages ?? []).map((stage) => ({
    id: stage.id,
    kind: stage.kind,
    required: stage.required,
    status: stage.status,
    exitCode: stage.exitCode,
    diagnostic: typeof stage?.payload?.error === "string" ? stage.payload.error : null,
    failureClasses: stageFailureClasses(stage),
  }));
}

function writeCampaignArtifacts(projectRoot, result, manifest) {
  const output = path.join(projectRoot, ".proped", "campaign");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (manifest) fs.writeFileSync(path.join(output, "inferred-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    directory: output,
    summary: path.join(output, "summary.json"),
    inferredManifest: manifest ? path.join(output, "inferred-manifest.json") : null,
    run: result.runOutput ?? null,
  };
}

function campaignRuntimeProfile(manifest, inspection) {
  return {
    framework: inspection?.framework?.name ?? null,
    projectMode: inspection?.project?.mode ?? null,
    serverMode: manifest?.server?.mode ?? null,
    packageManager: manifest?.project?.packageManager ?? inspection?.packageManager?.name ?? null,
    stateSources: [...(inspection?.runtime?.stateSources ?? [])].sort(),
  };
}

function baseResult(projectRoot, manifest, inspection) {
  return {
    schemaVersion: WEB_PROJECT_CAMPAIGN_VERSION,
    runtime: "unknown-web-project-campaign",
    project: projectRoot,
    id: manifest?.id ?? inspection?.target?.packageName ?? path.basename(projectRoot),
    status: "intervention-required",
    ok: false,
    autoOnboarded: false,
    qualityPassed: null,
    humanInterventions: 1,
    interventionReasons: [],
    failureClasses: [],
    deterministicReplay: null,
    metrics: { states: 0, transitions: 0, actions: 0 },
    runtimeProfile: campaignRuntimeProfile(manifest, inspection),
    stages: [],
    preparation: null,
    workspacePreparation: null,
    nodeRuntime: null,
    packageManagerRuntime: null,
    runOutput: null,
  };
}

function finalize(projectRoot, manifest, result, writeArtifacts) {
  if (!writeArtifacts) return result;
  const artifacts = writeCampaignArtifacts(projectRoot, result, manifest);
  return { ...result, artifacts };
}

function interventionResult(projectRoot, manifest, inspection, reason, options = {}, details = {}) {
  const result = {
    ...baseResult(projectRoot, manifest, inspection),
    ...details,
    interventionReasons: [reason],
  };
  return finalize(projectRoot, manifest, result, options.writeArtifacts !== false);
}

function packageRuntimeRequired(manifest) {
  return Array.isArray(manifest?.bootstrap?.install) && manifest.bootstrap.install.length > 0;
}

export function resolveCampaignSandboxMode(requestedMode, manifestMode, platform = process.platform) {
  if (requestedMode === "manifest") return manifestMode;
  if (requestedMode !== "auto") return requestedMode;
  if (platform === "darwin") return "constrained";
  return manifestMode;
}

export function runUnknownWebProjectCampaign(projectPath, options = {}) {
  const writeArtifacts = options.writeArtifacts !== false;
  const autoPrepare = options.prepare !== false;
  const offline = options.offline === true;
  const sandboxMode = options.sandboxMode ?? "auto";
  if (!SANDBOX_MODES.has(sandboxMode)) throw new Error(`invalid sandbox mode: ${sandboxMode}`);

  let projectRoot;
  try {
    projectRoot = fs.realpathSync(path.resolve(projectPath));
  } catch (error) {
    const unresolved = path.resolve(projectPath);
    return interventionResult(
      unresolved,
      null,
      null,
      intervention("project_unavailable", error.message),
      { writeArtifacts: false },
    );
  }

  let inspection;
  let manifest;
  try {
    inspection = inspectWebProject(projectRoot);
    manifest = createWebProjectManifestV2FromInspection(inspection, { projectRoot: "." });
    manifest.artifacts.output = ".proped/campaign/run";
  } catch (error) {
    return interventionResult(
      projectRoot,
      null,
      inspection ?? null,
      intervention("inspection_failed", error.message),
      { writeArtifacts },
    );
  }

  const criticalAmbiguities = criticalWebProjectInferenceAmbiguities(manifest);
  if (criticalAmbiguities.length > 0) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "inference_review_required",
        "critical inferred project settings require review before target execution",
        { ambiguities: criticalAmbiguities },
      ),
      { writeArtifacts },
    );
  }
  if (manifest.server.mode === "review-required") {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "server_review_required",
        "a runnable server or static output could not be inferred safely",
        { server: manifest.server },
      ),
      { writeArtifacts },
    );
  }

  const nodeAmbiguities = blockingNodeRequirementAmbiguities(manifest);
  if (nodeAmbiguities.length > 0) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "node_requirement_ambiguous",
        "Node runtime requirement is ambiguous and requires review before target execution",
        { ambiguities: nodeAmbiguities },
      ),
      { writeArtifacts },
    );
  }

  const nodeRuntime = resolveNodeRuntime(manifest.project.nodeRequirement ?? null, {
    preferredVersion: manifest.project.nodePreferredVersion ?? null,
  });
  const nodeRuntimeSummary = summarizeNodeRuntimeResolution(nodeRuntime);
  if (nodeRuntime.status === "unavailable") {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention("node_runtime_required", `no installed Node runtime satisfies ${manifest.project.nodeRequirement}`),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary },
    );
  }

  let runEnvironment = applyNodeRuntimeToEnvironment(options.sourceEnvironment ?? process.env, nodeRuntime);
  runEnvironment = applyPackageManagerRuntimeEnvironment(manifest, runEnvironment, { allowNetwork: false });
  let packageManagerRuntime = probePackageManagerRuntime(projectRoot, manifest, runEnvironment);
  let readiness = webProjectDependencyReadiness(projectRoot, manifest, { forRun: true });
  let preparation = null;
  const needsPackageRuntimePreparation = packageManagerRuntime.status === "prepare-required";
  const needsDependencyPreparation = readiness.ready === false;
  const needsPreparation = needsPackageRuntimePreparation || needsDependencyPreparation;

  if (packageRuntimeRequired(manifest) && packageManagerRuntime.status === "unavailable") {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "package_manager_runtime_unavailable",
        `${manifest.project.packageManagerReference ?? manifest.project.packageManager} runtime is unavailable`,
        { packageManagerRuntime },
      ),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime },
    );
  }

  if (needsPreparation && !autoPrepare) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "prepare_required",
        "project runtime or dependencies are not prepared and automatic preparation is disabled",
        { dependencyReadiness: readiness, packageManagerRuntime },
      ),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime },
    );
  }

  if (needsPreparation) {
    let prepareEnvironment = applyNodeRuntimeToEnvironment(options.sourceEnvironment ?? process.env, nodeRuntime);
    prepareEnvironment = applyPackageManagerRuntimeEnvironment(manifest, prepareEnvironment, { allowNetwork: !offline });
    preparation = prepareWebProject(projectRoot, manifest, { offline, sourceEnvironment: prepareEnvironment });
    if (!preparation.ok) {
      return interventionResult(
        projectRoot,
        manifest,
        inspection,
        intervention("prepare_failed", "automatic dependency preparation failed", {
          exitCode: preparation.exitCode,
          stderrTail: preparation.stderrTail,
        }),
        { writeArtifacts },
        { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
      );
    }

    runEnvironment = applyNodeRuntimeToEnvironment(options.sourceEnvironment ?? process.env, nodeRuntime);
    runEnvironment = applyPackageManagerRuntimeEnvironment(manifest, runEnvironment, { allowNetwork: false });
    packageManagerRuntime = probePackageManagerRuntime(projectRoot, manifest, runEnvironment);
    readiness = webProjectDependencyReadiness(projectRoot, manifest, { forRun: true });
  }

  if (packageRuntimeRequired(manifest) && packageManagerRuntime.status !== "ready") {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "package_manager_prepare_incomplete",
        "package-manager runtime is still unavailable after preparation",
        { packageManagerRuntime },
      ),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
    );
  }
  if (readiness.ready === false) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention(
        "dependency_prepare_incomplete",
        "project dependencies are still not ready after preparation",
        { dependencyReadiness: readiness },
      ),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
    );
  }

  let workspacePrebuild = null;
  let workspacePreparation = null;
  try {
    workspacePrebuild = discoverWebProjectWorkspacePrebuild(projectRoot, options.workspaceRoot ?? null);
  } catch (error) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention("workspace_review_required", error.message, { code: error.code ?? "workspace_review_required" }),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
    );
  }
  if (workspacePrebuild && !autoPrepare) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention("workspace_prepare_required", "a known workspace prebuild is required and automatic preparation is disabled", {
        workspace: { kind: workspacePrebuild.kind, descriptor: workspacePrebuild.descriptor, command: workspacePrebuild.command },
      }),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
    );
  }
  if (workspacePrebuild) {
    workspacePreparation = prepareWebProjectWorkspace(workspacePrebuild, { sourceEnvironment: runEnvironment });
    if (!workspacePreparation?.ok) {
      return interventionResult(
        projectRoot,
        manifest,
        inspection,
        intervention("workspace_prepare_failed", "known workspace prebuild did not complete", {
          status: workspacePreparation?.status ?? "failed",
          exitCode: workspacePreparation?.exitCode ?? null,
          stderrTail: workspacePreparation?.stderrTail ?? "",
        }),
        { writeArtifacts },
        { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation, workspacePreparation },
      );
    }
  }

  let compiled;
  try {
    compiled = compileWebProjectManifestV2(manifest, projectRoot);
  } catch (error) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention("compile_review_required", error.message),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation, workspacePreparation },
    );
  }

  const requestedSandboxMode = resolveCampaignSandboxMode(sandboxMode, compiled.execution.sandboxMode);
  let report;
  try {
    report = runWebProject(projectRoot, compiled.manifest, {
      writeArtifacts,
      sandbox: requestedSandboxMode === "caller-enforced"
        ? null
        : { mode: requestedSandboxMode, writablePaths: compiled.execution.writablePaths },
      sourceEnvironment: runEnvironment,
    });
  } catch (error) {
    return interventionResult(
      projectRoot,
      manifest,
      inspection,
      intervention("campaign_execution_failed", error.message, {
        code: error.code ?? "campaign_execution_failed",
        platform: error.platform ?? null,
        backend: error.backend ?? null,
      }),
      { writeArtifacts },
      { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation, workspacePreparation },
    );
  }

  const requiredStages = report.stages.filter((stage) => stage.required);
  const executionCompleted = requiredStages.every((stage) => COMPLETED_STAGE_STATUSES.has(stage.status));
  const failureClasses = campaignFailureClasses(report);
  const replayDeterministic = campaignReplayDeterminism(report);
  const metrics = campaignExplorationMetrics(report);
  const executionInterventions = executionCompleted
    ? []
    : [intervention(
        "campaign_stage_failed",
        "one or more required campaign stages did not complete",
        { stages: stableStages(report).filter((stage) => stage.required && !COMPLETED_STAGE_STATUSES.has(stage.status)) },
      )];

  const result = {
    schemaVersion: WEB_PROJECT_CAMPAIGN_VERSION,
    runtime: "unknown-web-project-campaign",
    project: projectRoot,
    id: manifest.id,
    status: executionCompleted ? "completed" : "intervention-required",
    ok: executionCompleted,
    autoOnboarded: executionCompleted,
    qualityPassed: report.ok,
    humanInterventions: executionInterventions.length,
    interventionReasons: executionInterventions,
    failureClasses,
    deterministicReplay: replayDeterministic,
    metrics,
    runtimeProfile: campaignRuntimeProfile(manifest, inspection),
    stages: stableStages(report),
    preparation,
    workspacePreparation,
    nodeRuntime: nodeRuntimeSummary,
    packageManagerRuntime,
    runOutput: report.output,
    sandboxRequested: requestedSandboxMode,
    semanticHash: report.semanticHash,
  };
  return finalize(projectRoot, manifest, result, writeArtifacts);
}
