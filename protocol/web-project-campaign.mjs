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
  nodeRequirementFromPackageManagerFailure,
  resolveNodeRuntime,
  summarizeNodeRuntimeResolution,
} from "./web-node-runtime.mjs";
import {
  applyPackageManagerRuntimeEnvironment,
  probePackageManagerRuntime,
} from "./web-package-manager-runtime.mjs";
import { runWebProject } from "./web-project-runner.mjs";
import { safeExecutionEnvironment } from "./web-execution-sandbox.mjs";
import { spawnSyncIsolated } from "./web-process-tree.mjs";
import { discoverWebProjectWorkspacePrebuild, prepareWebProjectWorkspace } from "./web-project-workspace-prebuild.mjs";

export const WEB_PROJECT_CAMPAIGN_VERSION = 2;

const COMPLETED_STAGE_STATUSES = new Set(["pass", "quality_gate_failed"]);
const SANDBOX_MODES = new Set(["auto", "manifest", "strict", "constrained", "caller-enforced"]);

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function pathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function moonWorkspaceRoot(projectRoot, repositoryRoot) {
  let current = projectRoot;
  while (pathInside(repositoryRoot, current)) {
    if (fs.existsSync(path.join(current, "moon.work")) || fs.existsSync(path.join(current, "moon.work.json"))) return current;
    if (current === repositoryRoot) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (fs.existsSync(path.join(projectRoot, "moon.mod")) || fs.existsSync(path.join(projectRoot, "moon.mod.json"))) return projectRoot;
  return null;
}

export function campaignSandboxExecutionScope(projectRoot, inspection, manifest, compiled) {
  let repositoryRoot = projectRoot;
  const inspectedGitRoot = inspection?.target?.gitRoot;
  if (typeof inspectedGitRoot === "string" && fs.existsSync(inspectedGitRoot)) {
    const realGitRoot = fs.realpathSync(inspectedGitRoot);
    if (pathInside(realGitRoot, projectRoot)) repositoryRoot = realGitRoot;
  }
  const writablePaths = [...(compiled.execution.writablePaths ?? [])];
  let workspaceRoot = null;
  if (manifest.bootstrap.build) {
    workspaceRoot = moonWorkspaceRoot(projectRoot, repositoryRoot);
    if (workspaceRoot) {
      for (const directory of ["_build", ".mooncakes"]) {
        writablePaths.push(path.relative(projectRoot, path.join(workspaceRoot, directory)));
      }
    }
  }
  return { repositoryRoot, writablePaths: unique(writablePaths), moonWorkspaceRoot: workspaceRoot };
}

export function prepareMoonWorkspaceForSandbox(workspaceRoot, { sourceEnvironment = process.env, timeoutMs = 300_000 } = {}) {
  const environment = safeExecutionEnvironment(sourceEnvironment, { osEnforced: false });
  environment.PROPED_NETWORK_POLICY = "explicit-bootstrap-network-allowed";
  const startedAt = Date.now();
  const run = (args) => {
    const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
    return spawnSyncIsolated("moon", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      shell: false,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: remaining,
      killSignal: "SIGKILL",
    });
  };
  const summarize = (child, command) => ({
    command,
    exitCode: child.status,
    signal: child.signal ?? null,
    timedOut: child?.error?.code === "ETIMEDOUT",
    stdoutTail: (child.stdout ?? "").slice(-8192),
    stderrTail: (child.stderr ?? "").slice(-8192),
    ...(child.error ? { error: child.error.message } : {}),
  });

  const buildCommand = ["moon", "build", "--target", "js"];
  let child = run(buildCommand.slice(1));
  const initialBuild = summarize(child, buildCommand);
  let registryUpdate = null;
  const registryUnavailable = child.status !== 0 && /moon update|module was not found in the registry|failed to resolve registry dependency/i.test(`${child.stdout ?? ""}\n${child.stderr ?? ""}`);
  if (registryUnavailable && !initialBuild.timedOut && Date.now() - startedAt < timeoutMs) {
    const updateCommand = ["moon", "update"];
    const update = run(updateCommand.slice(1));
    registryUpdate = summarize(update, updateCommand);
    if (update.status === 0 && !registryUpdate.timedOut && Date.now() - startedAt < timeoutMs) {
      child = run(buildCommand.slice(1));
    }
  }

  const finalBuild = summarize(child, buildCommand);
  const timedOut = finalBuild.timedOut || registryUpdate?.timedOut === true;
  return {
    ok: child.status === 0 && !timedOut,
    runtime: "moon-workspace-prepare",
    status: timedOut ? "timed-out" : child.status === 0 ? "prepared" : "failed",
    command: buildCommand,
    workspaceRoot,
    exitCode: child.status,
    signal: child.signal ?? null,
    timedOut,
    timeoutMs,
    networkPolicy: "explicit-network-allowed",
    credentials: "environment-allowlist-deny",
    stdoutTail: finalBuild.stdoutTail,
    stderrTail: finalBuild.stderrTail,
    initialBuild,
    registryUpdate,
    ...(finalBuild.error ? { error: finalBuild.error } : {}),
  };
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
  return (report?.stages ?? []).map((stage) => {
    const payloadDiagnostic = typeof stage?.payload?.error === "string" ? stage.payload.error : null;
    const stderrDiagnostic = typeof stage?.stderrTail === "string" && stage.stderrTail.trim().length > 0
      ? stage.stderrTail.trim().slice(-4096)
      : null;
    return {
      id: stage.id,
      kind: stage.kind,
      required: stage.required,
      status: stage.status,
      exitCode: stage.exitCode,
      diagnostic: payloadDiagnostic ?? stderrDiagnostic,
      failureClasses: stageFailureClasses(stage),
      ...(stage.bootstrapNetworkRetry ? { bootstrapNetworkRetry: stage.bootstrapNetworkRetry } : {}),
    };
  });
}

export function classifyCampaignTargetViability({ autoOnboarded = false, interventionReasons = [], stages = [], inspection = null, details = {} } = {}) {
  if (autoOnboarded) {
    return { status: "qualified", stage: "campaign", reason: "full_campaign_completed" };
  }
  const code = interventionReasons?.[0]?.code ?? null;
  const buildStage = stages.find((stage) => stage?.id === "project-build");
  if (buildStage && Number.isInteger(buildStage.exitCode) && buildStage.exitCode !== 0) {
    const source = inspection?.commands?.build?.source ?? null;
    return typeof source === "string" && source.startsWith("scripts.")
      ? { status: "failed", stage: "project-build", reason: "declared_project_build_failed" }
      : { status: "unknown", stage: "project-build", reason: "inferred_project_build_failed" };
  }
  if (code === "prepare_failed") {
    return { status: "failed", stage: "dependency-install", reason: "declared_dependency_install_failed" };
  }
  if (code === "prepare_timeout") {
    return { status: "unknown", stage: "dependency-install", reason: "dependency_install_timeout" };
  }
  if (code === "workspace_prepare_failed") {
    const descriptor = details?.workspacePreparation?.descriptor ?? null;
    return descriptor === "package.json#workspaces"
      ? { status: "failed", stage: "workspace-build", reason: "declared_workspace_build_failed" }
      : { status: "unknown", stage: "workspace-build", reason: "workspace_build_failed" };
  }
  if (code === "project_build_failed") {
    const source = inspection?.commands?.build?.source ?? null;
    return typeof source === "string" && source.startsWith("scripts.")
      ? { status: "failed", stage: "project-build", reason: "declared_project_build_failed" }
      : { status: "unknown", stage: "project-build", reason: "inferred_project_build_failed" };
  }
  if (code === "server_readiness_failed") {
    const source = inspection?.commands?.serve?.source ?? null;
    return typeof source === "string" && source.startsWith("scripts.")
      ? { status: "failed", stage: "managed-start", reason: "declared_server_unhealthy" }
      : { status: "unknown", stage: "managed-start", reason: "inferred_server_unhealthy" };
  }
  if (code === "browser_stage_failed") {
    const browserStage = stages.find((stage) => stage?.id === "generic-browser");
    return browserStage && browserStage.status !== "blocked"
      ? { status: "qualified", stage: "browser", reason: "lifecycle_reached_browser" }
      : { status: "unknown", stage: "browser", reason: "browser_lifecycle_not_reached" };
  }
  if (code === "campaign_stage_timeout") {
    const browserStage = stages.find((stage) => stage?.id === "generic-browser");
    return browserStage && browserStage.status === "timeout"
      ? { status: "qualified", stage: "browser", reason: "lifecycle_reached_browser" }
      : { status: "unknown", stage: "campaign", reason: "campaign_stage_timeout" };
  }
  if (stages.some((stage) => stage?.id === "generic-browser" && stage?.status !== "blocked")) {
    return { status: "qualified", stage: "browser", reason: "lifecycle_reached_browser" };
  }
  return { status: "unknown", stage: null, reason: code ?? "qualification_not_observed" };
}

export function classifyCampaignStageIntervention(stages) {
  const failed = (stages ?? []).filter((stage) => stage?.required && !COMPLETED_STAGE_STATUSES.has(stage.status));
  const primary = failed.find((stage) => stage.status !== "blocked") ?? failed[0] ?? null;
  if (!primary) return null;
  const diagnostic = String(primary.diagnostic ?? "");
  if (primary.status === "timeout") {
    return { code: "campaign_stage_timeout", message: `required stage timed out: ${primary.id}` };
  }
  if (primary.id === "project-build") {
    return { code: "project_build_failed", message: "inferred project build did not complete" };
  }
  if (primary.id === "generic-browser" && /server readiness timeout|server exited before readiness/i.test(diagnostic)) {
    return { code: "server_readiness_failed", message: "managed project server did not become healthy" };
  }
  if (primary.id === "generic-browser") {
    return { code: "browser_stage_failed", message: "generic browser stage did not complete" };
  }
  return { code: "campaign_stage_failed", message: "one or more required campaign stages did not complete" };
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
    viability: classifyCampaignTargetViability({
      interventionReasons: [reason],
      inspection,
      details,
    }),
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

  let nodeRuntime = resolveNodeRuntime(manifest.project.nodeRequirement ?? null, {
    preferredVersion: manifest.project.nodePreferredVersion ?? null,
    environment: options.sourceEnvironment ?? process.env,
  });
  let nodeRuntimeSummary = summarizeNodeRuntimeResolution(nodeRuntime);
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
    preparation = prepareWebProject(projectRoot, manifest, {
      offline,
      sourceEnvironment: prepareEnvironment,
      timeoutMs: options.prepareTimeoutMs,
    });
    if (!preparation.ok && !preparation.timedOut) {
      const discoveredRequirement = nodeRequirementFromPackageManagerFailure(`${preparation.stdoutTail ?? ""}\n${preparation.stderrTail ?? ""}`);
      if (discoveredRequirement) {
        const combinedRequirement = manifest.project.nodeRequirement
          ? `${manifest.project.nodeRequirement} ${discoveredRequirement}`
          : discoveredRequirement;
        const negotiatedRuntime = resolveNodeRuntime(combinedRequirement, {
          preferredVersion: manifest.project.nodePreferredVersion ?? null,
          environment: options.sourceEnvironment ?? process.env,
        });
        const previousPath = nodeRuntime.selected?.path ?? null;
        if (negotiatedRuntime.status === "selected" && negotiatedRuntime.selected?.path && negotiatedRuntime.selected.path !== previousPath) {
          const previousVersion = nodeRuntime.selected?.version ?? null;
          nodeRuntime = negotiatedRuntime;
          nodeRuntimeSummary = {
            ...summarizeNodeRuntimeResolution(nodeRuntime),
            negotiatedFromPrepare: {
              requirement: discoveredRequirement,
              previousVersion,
              selectedVersion: nodeRuntime.selected.version,
            },
          };
          prepareEnvironment = applyNodeRuntimeToEnvironment(options.sourceEnvironment ?? process.env, nodeRuntime);
          prepareEnvironment = applyPackageManagerRuntimeEnvironment(manifest, prepareEnvironment, { allowNetwork: !offline });
          preparation = prepareWebProject(projectRoot, manifest, {
            offline,
            sourceEnvironment: prepareEnvironment,
            timeoutMs: options.prepareTimeoutMs,
          });
        } else if (negotiatedRuntime.status === "unavailable") {
          nodeRuntime = negotiatedRuntime;
          nodeRuntimeSummary = {
            ...summarizeNodeRuntimeResolution(nodeRuntime),
            negotiatedFromPrepare: { requirement: discoveredRequirement, previousVersion: nodeRuntime.current?.version ?? null, selectedVersion: null },
          };
          return interventionResult(
            projectRoot,
            manifest,
            inspection,
            intervention("node_runtime_required", `no installed Node runtime satisfies discovered dependency requirement ${discoveredRequirement}`),
            { writeArtifacts },
            { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation },
          );
        }
      }
    }
    if (!preparation.ok) {
      return interventionResult(
        projectRoot,
        manifest,
        inspection,
        intervention(preparation.timedOut ? "prepare_timeout" : "prepare_failed", preparation.timedOut ? "automatic dependency preparation timed out" : "automatic dependency preparation failed", {
          exitCode: preparation.exitCode,
          timedOut: preparation.timedOut === true,
          timeoutMs: preparation.timeoutMs ?? null,
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
    const explicitWorkspaceRoot = options.workspaceRoot ?? null;
    const workspaceRoot = explicitWorkspaceRoot ?? inspection.target.gitRoot ?? null;
    workspacePrebuild = discoverWebProjectWorkspacePrebuild(projectRoot, workspaceRoot, {
      allowMoonBit: explicitWorkspaceRoot !== null,
    });
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
    workspacePreparation = prepareWebProjectWorkspace(workspacePrebuild, {
      sourceEnvironment: runEnvironment,
      timeoutMs: options.prepareTimeoutMs ?? 300_000,
    });
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
  const sandboxExecution = campaignSandboxExecutionScope(projectRoot, inspection, manifest, compiled);
  let sandboxWorkspacePreparation = null;
  if (requestedSandboxMode !== "caller-enforced" && sandboxExecution.moonWorkspaceRoot) {
    if (!autoPrepare) {
      return interventionResult(
        projectRoot,
        manifest,
        inspection,
        intervention("workspace_prepare_required", "MoonBit workspace dependencies must be prepared before OS-enforced sandbox execution", {
          workspace: { kind: "moon-workspace", root: sandboxExecution.moonWorkspaceRoot, command: ["moon", "build", "--target", "js"] },
        }),
        { writeArtifacts },
        { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation, workspacePreparation },
      );
    }
    sandboxWorkspacePreparation = prepareMoonWorkspaceForSandbox(sandboxExecution.moonWorkspaceRoot, {
      sourceEnvironment: runEnvironment,
      timeoutMs: options.prepareTimeoutMs ?? 300_000,
    });
    if (!sandboxWorkspacePreparation.ok) {
      return interventionResult(
        projectRoot,
        manifest,
        inspection,
        intervention("workspace_prepare_failed", "MoonBit workspace dependency preparation did not complete", {
          status: sandboxWorkspacePreparation.status,
          exitCode: sandboxWorkspacePreparation.exitCode,
          stderrTail: sandboxWorkspacePreparation.stderrTail,
        }),
        { writeArtifacts },
        { nodeRuntime: nodeRuntimeSummary, packageManagerRuntime, preparation, workspacePreparation: sandboxWorkspacePreparation },
      );
    }
  }
  let report;
  try {
    report = runWebProject(projectRoot, compiled.manifest, {
      writeArtifacts,
      sandbox: requestedSandboxMode === "caller-enforced"
        ? null
        : {
            mode: requestedSandboxMode,
            repositoryRoot: sandboxExecution.repositoryRoot,
            writablePaths: sandboxExecution.writablePaths,
            allowBuildNetworkBootstrap: autoPrepare && !offline,
          },
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
  const failedStages = stableStages(report).filter((stage) => stage.required && !COMPLETED_STAGE_STATUSES.has(stage.status));
  const classifiedIntervention = classifyCampaignStageIntervention(failedStages);
  const executionInterventions = executionCompleted
    ? []
    : [intervention(
        classifiedIntervention?.code ?? "campaign_stage_failed",
        classifiedIntervention?.message ?? "one or more required campaign stages did not complete",
        { stages: failedStages },
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
    viability: classifyCampaignTargetViability({
      autoOnboarded: executionCompleted,
      interventionReasons: executionInterventions,
      stages: stableStages(report),
      inspection,
      details: { preparation, workspacePreparation: sandboxWorkspacePreparation ?? workspacePreparation },
    }),
    stages: stableStages(report),
    preparation,
    workspacePreparation: sandboxWorkspacePreparation ?? workspacePreparation,
    nodeRuntime: nodeRuntimeSummary,
    packageManagerRuntime,
    runOutput: report.output,
    sandboxRequested: requestedSandboxMode,
    semanticHash: report.semanticHash,
  };
  return finalize(projectRoot, manifest, result, writeArtifacts);
}
