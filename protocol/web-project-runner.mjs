import fs from "node:fs";
import path from "node:path";
import {
  assertConstrainedSandboxCapabilities,
  assertStrictSandboxCapabilities,
  buildMacosConstrainedSandboxInvocation,
  buildStrictSandboxInvocation,
  cleanupSandboxInvocation,
  macosConstrainedSourceEnvironment,
  macosCredentialReadDenyPaths,
  safeExecutionEnvironment,
  sandboxCapabilitiesForMode,
} from "./web-execution-sandbox.mjs";
import { semanticHash } from "./ui-driver-v1.mjs";
import { clusterWebFailures } from "./web-failure-classifier.mjs";
import { spawnSyncIsolated } from "./web-process-tree.mjs";

export const WEB_PROJECT_MANIFEST_VERSION = 1;
export const WEB_PROJECT_RUNNER_VERSION = "1";
export const WEB_PROJECT_STAGE_KINDS = Object.freeze([
  "check",
  "component",
  "browser",
  "browser-replay",
  "ssr-build",
  "ssr",
  "quality",
]);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "id",
  "projectRoot",
  "safety",
  "stages",
  "artifacts",
]);
const SAFETY_KEYS = new Set([
  "network",
  "filesystemWrites",
  "upstreamWrites",
  "credentials",
]);
const STAGE_KEYS = new Set([
  "id",
  "kind",
  "cwd",
  "command",
  "timeoutMs",
  "dependsOn",
  "required",
]);
const ARTIFACT_KEYS = new Set(["output"]);

function fail(message) {
  throw new Error(`web project manifest: ${message}`);
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label} has unknown field ${key}`);
  for (const key of keys) if (!(key in value)) fail(`${label} is missing ${key}`);
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveInside(root, candidate, label) {
  assertString(candidate, label);
  if (path.isAbsolute(candidate)) fail(`${label} must be relative`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  if (!isInside(resolvedRoot, resolved)) fail(`${label} escapes repository root`);
  return resolved;
}

function resolveExistingInside(root, candidate, label) {
  const resolved = resolveInside(root, candidate, label);
  let realRoot;
  let realResolved;
  try {
    realRoot = fs.realpathSync(root);
    realResolved = fs.realpathSync(resolved);
  } catch (error) {
    fail(`${label} cannot be resolved: ${error.message}`);
  }
  if (!isInside(realRoot, realResolved)) fail(`${label} escapes repository root through a symlink`);
  return resolved;
}

function resolveCreatableInside(root, candidate, label) {
  const resolved = resolveInside(root, candidate, label);
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail(`${label} has no existing parent`);
    existing = parent;
  }
  let realRoot;
  let realExisting;
  try {
    realRoot = fs.realpathSync(root);
    realExisting = fs.realpathSync(existing);
  } catch (error) {
    fail(`${label} cannot be resolved: ${error.message}`);
  }
  if (!isInside(realRoot, realExisting)) fail(`${label} escapes repository root through a symlink`);
  return resolved;
}

function validateStage(stage, index, seenIds) {
  assertExactKeys(stage, STAGE_KEYS, `stages[${index}]`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(stage.id)) fail(`invalid stage id ${stage.id}`);
  if (seenIds.has(stage.id)) fail(`duplicate stage id ${stage.id}`);
  if (!WEB_PROJECT_STAGE_KINDS.includes(stage.kind)) fail(`unsupported stage kind ${stage.kind}`);
  assertString(stage.cwd, `${stage.id}.cwd`);
  if (!Array.isArray(stage.command) || stage.command.length === 0) fail(`${stage.id}.command must be a non-empty argv array`);
  for (const [argIndex, arg] of stage.command.entries()) assertString(arg, `${stage.id}.command[${argIndex}]`);
  if (!Number.isSafeInteger(stage.timeoutMs) || stage.timeoutMs < 1) fail(`${stage.id}.timeoutMs must be a positive safe integer`);
  if (!Array.isArray(stage.dependsOn) || new Set(stage.dependsOn).size !== stage.dependsOn.length) {
    fail(`${stage.id}.dependsOn must be a unique array`);
  }
  for (const dependency of stage.dependsOn) {
    assertString(dependency, `${stage.id}.dependsOn[]`);
    if (!seenIds.has(dependency)) fail(`${stage.id} depends on unknown or later stage ${dependency}`);
  }
  if (typeof stage.required !== "boolean") fail(`${stage.id}.required must be boolean`);
  seenIds.add(stage.id);
}

export function validateWebProjectManifest(manifest, repositoryRoot = process.cwd()) {
  assertExactKeys(manifest, ROOT_KEYS, "root");
  if (manifest.schemaVersion !== WEB_PROJECT_MANIFEST_VERSION) {
    fail(`unsupported schemaVersion ${manifest.schemaVersion}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) fail(`invalid id ${manifest.id}`);
  resolveExistingInside(repositoryRoot, manifest.projectRoot, "projectRoot");

  assertExactKeys(manifest.safety, SAFETY_KEYS, "safety");
  if (manifest.safety.network !== "caller-enforced-deny") fail("safety.network must be caller-enforced-deny");
  if (manifest.safety.filesystemWrites !== "caller-enforced-artifacts-and-build-output") {
    fail("safety.filesystemWrites must be caller-enforced-artifacts-and-build-output");
  }
  if (manifest.safety.upstreamWrites !== "caller-enforced-deny") fail("safety.upstreamWrites must be caller-enforced-deny");
  if (manifest.safety.credentials !== "caller-enforced-deny") fail("safety.credentials must be caller-enforced-deny");

  if (!Array.isArray(manifest.stages) || manifest.stages.length === 0) fail("stages must be non-empty");
  const seenIds = new Set();
  for (const [index, stage] of manifest.stages.entries()) validateStage(stage, index, seenIds);

  assertExactKeys(manifest.artifacts, ARTIFACT_KEYS, "artifacts");
  resolveCreatableInside(repositoryRoot, manifest.artifacts.output, "artifacts.output");

  const projectRoot = resolveExistingInside(repositoryRoot, manifest.projectRoot, "projectRoot");
  for (const stage of manifest.stages) resolveExistingInside(projectRoot, stage.cwd, `${stage.id}.cwd`);
  return manifest;
}

export function loadWebProjectManifest(repositoryRoot, manifestPath) {
  const resolved = resolveExistingInside(repositoryRoot, manifestPath, "manifest path");
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return validateWebProjectManifest(manifest, repositoryRoot);
}

function parseJsonTail(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Continue looking for the last machine-readable line.
    }
  }
  return null;
}

function trimTail(value, maximum = 4096) {
  if (value.length <= maximum) return value;
  return value.slice(value.length - maximum);
}

function childEnvironment({ osEnforced = false, sourceEnvironment = process.env } = {}) {
  return safeExecutionEnvironment(sourceEnvironment, { osEnforced });
}

function stageStatus(child) {
  if (child.error?.code === "ETIMEDOUT" || (child.status === null && child.signal === "SIGTERM")) return "timeout";
  if (child.status === 0) return "pass";
  if (child.status === 1) return "quality_gate_failed";
  if (child.status === 2) return "usage_error";
  return "execution_failed";
}

function qualityFailures(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return [
    ...(Array.isArray(payload.qualityGate?.failures) ? payload.qualityGate.failures : []),
    ...(Array.isArray(payload.failures) ? payload.failures : []),
  ];
}

function qualityFailureCodes(payload) {
  const failures = qualityFailures(payload);
  const codes = failures
    .map((failure) => failure?.code ?? failure?.property ?? failure?.failureClass ?? null)
    .filter((code) => typeof code === "string" && code.length > 0);
  return [...new Set(codes)];
}

function payloadSummary(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const summary = {};
  for (const key of [
    "ok",
    "schemaVersion",
    "runtime",
    "error",
    "campaign",
    "actionCount",
    "targetCount",
    "failureCount",
    "zeroFailureCount",
    "semanticHash",
    "qualityGate",
    "metrics",
    "performance",
    "replayGate",
    "volatility",
    "exploration",
    "explorationReplayGate",
    "approvedSemantics",
  ]) {
    if (key in payload) summary[key] = payload[key];
  }
  const failures = qualityFailureCodes(payload);
  if (failures.length > 0) {
    summary.qualityFailureCodes = failures;
    const canonical = clusterWebFailures(qualityFailures(payload));
    summary.canonicalFailureClassIds = canonical.clusters.map((cluster) => cluster.id);
    summary.canonicalFailureClusterCount = canonical.clusterCount;
  }
  return summary;
}

function stableStage(stageResult) {
  return {
    id: stageResult.id,
    kind: stageResult.kind,
    required: stageResult.required,
    dependsOn: stageResult.dependsOn,
    status: stageResult.status,
    exitCode: stageResult.exitCode,
    resultSemanticHash: stageResult.payload?.semanticHash ?? null,
    qualityFailureCodes: stageResult.payload?.qualityFailureCodes ?? qualityFailureCodes(stageResult.payload),
    canonicalFailureClassIds: stageResult.payload?.canonicalFailureClassIds ?? (() => {
      const failures = qualityFailures(stageResult.payload);
      return failures.length ? clusterWebFailures(failures).clusters.map((cluster) => cluster.id) : [];
    })(),
  };
}

export function runWebProject(repositoryRoot, manifest, options = {}) {
  validateWebProjectManifest(manifest, repositoryRoot);
  const projectRoot = resolveExistingInside(repositoryRoot, manifest.projectRoot, "projectRoot");
  const sandboxMode = options.sandbox?.mode ?? "caller-enforced";
  const osSandbox = sandboxMode !== "caller-enforced";
  const realRepositoryRoot = fs.realpathSync(repositoryRoot);
  const sandboxRoot = options.sandbox?.repositoryRoot
    ? fs.realpathSync(options.sandbox.repositoryRoot)
    : realRepositoryRoot;
  if (!isInside(sandboxRoot, realRepositoryRoot)) {
    throw new Error("sandbox repository root must contain the project repository root");
  }
  const sandboxWritablePaths = osSandbox
    ? [
        ...(options.writeArtifacts === false ? [] : [options.output ?? manifest.artifacts.output]),
        ...(options.sandbox?.writablePaths ?? []),
      ].map((candidate) => path.isAbsolute(candidate) ? candidate : path.resolve(realRepositoryRoot, candidate))
    : [];
  const sandboxPlatform = options.sandbox?.platform ?? process.platform;
  const sandboxBackendPath = options.sandbox?.backendPath ?? null;
  const sourceEnvironment = sandboxMode === "constrained"
    ? macosConstrainedSourceEnvironment(options.sourceEnvironment ?? process.env)
    : (options.sourceEnvironment ?? process.env);
  const preflightCapabilities = sandboxMode === "strict"
    ? assertStrictSandboxCapabilities({ platform: sandboxPlatform, backendPath: sandboxBackendPath })
    : sandboxMode === "constrained"
      ? assertConstrainedSandboxCapabilities({ platform: sandboxPlatform, backendPath: sandboxBackendPath })
      : sandboxCapabilitiesForMode({ mode: "caller-enforced", platform: sandboxPlatform });
  let sandboxMetadata = {
    mode: sandboxMode,
    platform: preflightCapabilities.platform,
    backend: preflightCapabilities.backend,
    capabilities: preflightCapabilities.capabilities,
    requiredCapabilities: preflightCapabilities.requiredCapabilities,
    diagnostic: preflightCapabilities.diagnostic,
  };
  const results = [];
  const byId = new Map();

  for (const stage of manifest.stages) {
    const blockedBy = stage.dependsOn.filter((dependency) => byId.get(dependency)?.status !== "pass");
    if (blockedBy.length > 0) {
      const blocked = {
        id: stage.id,
        kind: stage.kind,
        required: stage.required,
        dependsOn: stage.dependsOn,
        status: "blocked",
        exitCode: null,
        signal: null,
        durationMs: 0,
        blockedBy,
        payload: null,
        stdoutTail: "",
        stderrTail: "",
      };
      results.push(blocked);
      byId.set(stage.id, blocked);
      continue;
    }

    const cwd = resolveExistingInside(projectRoot, stage.cwd, `${stage.id}.cwd`);
    const started = performance.now();
    let executable = stage.command[0];
    let args = stage.command.slice(1);
    let invocation = null;
    if (sandboxMode === "strict") {
      invocation = buildStrictSandboxInvocation({
        command: stage.command,
        cwd,
        repositoryRoot: sandboxRoot,
        writablePaths: sandboxWritablePaths,
        credentialReadDenyPaths: macosCredentialReadDenyPaths(sourceEnvironment),
        platform: sandboxPlatform,
        backendPath: sandboxBackendPath,
      });
    } else if (sandboxMode === "constrained") {
      invocation = buildMacosConstrainedSandboxInvocation({
        command: stage.command,
        cwd,
        repositoryRoot: sandboxRoot,
        writablePaths: sandboxWritablePaths,
        backendPath: sandboxBackendPath,
        credentialReadDenyPaths: macosCredentialReadDenyPaths(sourceEnvironment),
      });
    }
    if (invocation) {
      executable = invocation.executable;
      args = invocation.args;
      sandboxMetadata = invocation.metadata;
    }
    let child;
    try {
      child = spawnSyncIsolated(executable, args, {
        cwd,
        encoding: "utf8",
        timeout: stage.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        shell: false,
        env: {
          ...childEnvironment({ osEnforced: osSandbox, sourceEnvironment }),
          ...(invocation?.environment ?? {}),
        },
      });
    } finally {
      cleanupSandboxInvocation(invocation);
    }
    const durationMs = Math.round((performance.now() - started) * 1000) / 1000;
    const status = stageStatus(child);
    const stdout = child.stdout ?? "";
    const stderr = child.stderr ?? "";
    const payload = parseJsonTail(status === "pass" ? `${stdout}\n${stderr}` : `${stderr}\n${stdout}`);
    const result = {
      id: stage.id,
      kind: stage.kind,
      required: stage.required,
      dependsOn: stage.dependsOn,
      status,
      exitCode: child.status,
      signal: child.signal ?? null,
      durationMs,
      blockedBy: [],
      payload: payloadSummary(payload),
      stdoutTail: trimTail(stdout),
      stderrTail: trimTail(stderr),
    };
    results.push(result);
    byId.set(stage.id, result);
  }

  const requiredFailures = results.filter((stage) => stage.required && stage.status !== "pass");
  const stable = {
    schemaVersion: WEB_PROJECT_MANIFEST_VERSION,
    runnerVersion: WEB_PROJECT_RUNNER_VERSION,
    id: manifest.id,
    safety: manifest.safety,
    sandbox: sandboxMetadata,
    stages: results.map(stableStage),
  };
  const report = {
    ok: requiredFailures.length === 0,
    ...stable,
    stageCount: results.length,
    passedStageCount: results.filter((stage) => stage.status === "pass").length,
    requiredFailureCount: requiredFailures.length,
    stages: results,
    semanticHash: semanticHash(stable),
  };

  if (options.writeArtifacts !== false) {
    const outputCandidate = options.output ?? manifest.artifacts.output;
    const output = resolveCreatableInside(repositoryRoot, outputCandidate, "output");
    writeWebProjectArtifacts(output, report);
    report.output = output;
  } else {
    report.output = null;
  }
  return report;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function writeWebProjectArtifacts(output, report) {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);

  const atlas = {
    schemaVersion: 2,
    strategy: "web-project-runner",
    id: report.id,
    ok: report.ok,
    stageCount: report.stageCount,
    passedStageCount: report.passedStageCount,
    requiredFailureCount: report.requiredFailureCount,
    stages: report.stages.map(stableStage),
    semanticHash: report.semanticHash,
  };
  fs.writeFileSync(path.join(output, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);

  const dot = ["digraph web_project {", "  rankdir=LR;"];
  for (const stage of report.stages) {
    dot.push(`  "${stage.id}" [label="${stage.id}\\n${stage.status}"];`);
    for (const dependency of stage.dependsOn) dot.push(`  "${dependency}" -> "${stage.id}";`);
  }
  dot.push("}");
  fs.writeFileSync(path.join(output, "atlas.dot"), `${dot.join("\n")}\n`);

  const height = Math.max(160, 70 + report.stages.length * 28);
  const rows = report.stages.map((stage, index) => {
    const y = 72 + index * 28;
    return `<text x="24" y="${y}">${escapeXml(stage.id)}: ${escapeXml(stage.status)}</text>`;
  }).join("");
  fs.writeFileSync(
    path.join(output, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="24" y="32">Web project runner: ${escapeXml(report.id)}</text>${rows}</svg>\n`,
  );
  fs.writeFileSync(
    path.join(output, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Web project runner</title><body><h1>Web project runner: ${escapeHtml(report.id)}</h1><p>${report.passedStageCount}/${report.stageCount} stages passed</p><pre>${escapeHtml(JSON.stringify(atlas, null, 2))}</pre></body></html>\n`,
  );
}
