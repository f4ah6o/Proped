#!/usr/bin/env node
import path from "node:path";
import { compileWebProjectManifestV2, loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";
import { runWebProject } from "../protocol/web-project-runner.mjs";
import { webProjectDependencyReadiness } from "../protocol/web-project-bootstrap.mjs";
import { applyNodeRuntimeToEnvironment, blockingNodeRequirementAmbiguities, resolveNodeRuntime, summarizeNodeRuntimeResolution } from "../protocol/web-node-runtime.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_run_v2.mjs <proped.web.json> [--repository-root <dir>] [--no-artifacts] [--sandbox-mode <manifest|strict|caller-enforced>]");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let repositoryRoot = null;
let writeArtifacts = true;
let sandboxMode = "manifest";
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-artifacts") writeArtifacts = false;
  else if (arg === "--repository-root" || arg === "--sandbox-mode") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--repository-root") repositoryRoot = path.resolve(value);
    else sandboxMode = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("web run v2 accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
if (!manifestFile) usage("web run v2 requires a manifest file");
if (!["manifest", "strict", "caller-enforced"].includes(sandboxMode)) usage("--sandbox-mode is invalid");

try {
  const root = repositoryRoot ?? path.dirname(manifestFile);
  const manifest = loadWebProjectManifestV2(manifestFile);
  const nodeAmbiguities = blockingNodeRequirementAmbiguities(manifest);
  if (nodeAmbiguities.length > 0) {
    console.error(JSON.stringify({ ok: false, error: "node_requirement_ambiguous", message: "Node runtime requirement is ambiguous and requires review before run", ambiguities: nodeAmbiguities, manifestVersion: 2 }));
    process.exit(2);
  }
  const nodeRuntime = resolveNodeRuntime(manifest.project.nodeRequirement ?? null);
  const nodeRuntimeSummary = summarizeNodeRuntimeResolution(nodeRuntime);
  if (nodeRuntime.status === "unavailable") {
    console.error(JSON.stringify({ ok: false, error: "node_runtime_required", message: `no installed Node runtime satisfies ${manifest.project.nodeRequirement}`, nodeRuntime: nodeRuntimeSummary, manifestVersion: 2 }));
    process.exit(2);
  }
  const sourceEnvironment = applyNodeRuntimeToEnvironment(process.env, nodeRuntime);
  const dependencyReadiness = webProjectDependencyReadiness(root, manifest, { forRun: true });
  if (dependencyReadiness.ready === false) {
    const result = {
      ok: false,
      error: "prepare_required",
      message: "project dependencies are not prepared; run `proped web prepare <manifest>` explicitly before `web run`",
      manifestVersion: 2,
      dependencyReadiness,
      bootstrapInstall: manifest.bootstrap.install,
      nodeRuntime: nodeRuntimeSummary,
    };
    console.error(JSON.stringify(result));
    process.exit(2);
  }
  const compiled = compileWebProjectManifestV2(manifest, root);
  const strict = sandboxMode === "strict" || (sandboxMode === "manifest" && compiled.execution.strictSandbox);
  const report = runWebProject(root, compiled.manifest, {
    writeArtifacts,
    sandbox: strict ? { mode: "strict", writablePaths: compiled.execution.writablePaths } : null,
    sourceEnvironment,
  });
  const result = {
    ...report,
    manifestVersion: 2,
    sandboxRequested: strict ? "strict" : "caller-enforced",
    bootstrapInstall: compiled.execution.bootstrapInstall,
    nodeRuntime: nodeRuntimeSummary,
  };
  (result.ok ? console.log : console.error)(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_v2_run_failed", message: error.message }));
  process.exitCode = 2;
}
