#!/usr/bin/env node
import path from "node:path";
import { criticalWebProjectInferenceAmbiguities, loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";
import { prepareWebProject } from "../protocol/web-project-bootstrap.mjs";
import { applyNodeRuntimeToEnvironment, blockingNodeRequirementAmbiguities, resolveNodeRuntime, summarizeNodeRuntimeResolution } from "../protocol/web-node-runtime.mjs";
import { applyPackageManagerRuntimeEnvironment, probePackageManagerRuntime } from "../protocol/web-package-manager-runtime.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_prepare.mjs <proped.web.json> [--repository-root <dir>] [--prepare-timeout-ms <ms>] [--offline]\n\nThis is an explicit mutating setup phase. It runs the inferred install argv with shell=false and a credential-filtered environment. Network may be used unless --offline is supplied.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let repositoryRoot = null;
let offline = false;
let prepareTimeoutMs = undefined;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--offline") offline = true;
  else if (arg === "--prepare-timeout-ms") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--prepare-timeout-ms requires a value");
    prepareTimeoutMs = Number(value);
    if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs <= 0) usage("--prepare-timeout-ms must be a positive integer");
  } else if (arg === "--repository-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--repository-root requires a value");
    repositoryRoot = path.resolve(value);
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("web prepare accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
if (!manifestFile) usage("web prepare requires a manifest file");

try {
  const root = repositoryRoot ?? path.dirname(manifestFile);
  const manifest = loadWebProjectManifestV2(manifestFile);
  const criticalAmbiguities = criticalWebProjectInferenceAmbiguities(manifest);
  if (criticalAmbiguities.length > 0) {
    console.error(JSON.stringify({ ok: false, error: "inference_review_required", message: "critical inferred project settings require review before target execution", ambiguities: criticalAmbiguities }));
    process.exit(2);
  }
  const nodeAmbiguities = blockingNodeRequirementAmbiguities(manifest);
  if (nodeAmbiguities.length > 0) {
    console.error(JSON.stringify({ ok: false, error: "node_requirement_ambiguous", message: "Node runtime requirement is ambiguous and requires review before prepare", ambiguities: nodeAmbiguities }));
    process.exit(2);
  }
  const nodeRuntime = resolveNodeRuntime(manifest.project.nodeRequirement ?? null, { preferredVersion: manifest.project.nodePreferredVersion ?? null });
  const nodeRuntimeSummary = summarizeNodeRuntimeResolution(nodeRuntime);
  if (nodeRuntime.status === "unavailable") {
    console.error(JSON.stringify({ ok: false, error: "node_runtime_required", message: `no installed Node runtime satisfies ${manifest.project.nodeRequirement}`, nodeRuntime: nodeRuntimeSummary }));
    process.exit(2);
  }
  let sourceEnvironment = applyNodeRuntimeToEnvironment(process.env, nodeRuntime);
  sourceEnvironment = applyPackageManagerRuntimeEnvironment(manifest, sourceEnvironment, { allowNetwork: !offline });
  const result = prepareWebProject(root, manifest, { offline, sourceEnvironment, timeoutMs: prepareTimeoutMs });
  result.nodeRuntime = nodeRuntimeSummary;
  result.packageManagerRuntime = probePackageManagerRuntime(root, manifest, sourceEnvironment);
  (result.ok ? console.log : console.error)(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_prepare_failed", message: error.message }));
  process.exitCode = 2;
}
