import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeExecutionEnvironment } from "./web-execution-sandbox.mjs";

export const WEB_PROJECT_BOOTSTRAP_VERSION = "1";

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolvedProjectRoot(repositoryRoot, manifest) {
  const root = fs.realpathSync(repositoryRoot);
  const project = path.resolve(root, manifest.project.root);
  if (!fs.existsSync(project)) throw new Error(`Web project bootstrap: project root does not exist: ${manifest.project.root}`);
  const realProject = fs.realpathSync(project);
  if (!inside(root, realProject)) throw new Error("Web project bootstrap: project root escapes repository root");
  return realProject;
}

export function webProjectDependencyReadiness(repositoryRoot, manifest, { forRun = false } = {}) {
  const projectRoot = resolvedProjectRoot(repositoryRoot, manifest);
  if (forRun && !manifest.bootstrap.build && manifest.server.mode !== "command") {
    return { ready: true, reason: "run-does-not-require-target-dependencies", projectRoot, evidence: [] };
  }
  if (!manifest.bootstrap.install) {
    return { ready: true, reason: "no-install-command", projectRoot, evidence: [] };
  }
  const manager = manifest.project.packageManager;
  const evidence = [];
  const nodeModules = path.join(projectRoot, "node_modules");
  const pnpmModules = path.join(nodeModules, ".modules.yaml");
  const npmHiddenLock = path.join(nodeModules, ".package-lock.json");
  const pnp = path.join(projectRoot, ".pnp.cjs");
  const yarnState = path.join(nodeModules, ".yarn-state.yml");
  const yarnIntegrity = path.join(nodeModules, ".yarn-integrity");
  for (const [label, candidate] of [["node_modules", nodeModules], ["pnpm-modules", pnpmModules], ["npm-hidden-lock", npmHiddenLock], [".pnp.cjs", pnp], ["yarn-state", yarnState], ["yarn-integrity", yarnIntegrity]]) {
    if (fs.existsSync(candidate)) evidence.push(label);
  }
  if (manager === "pnpm") {
    const ready = fs.existsSync(pnpmModules);
    return { ready, reason: ready ? "pnpm-install-complete" : "pnpm-install-incomplete", projectRoot, evidence };
  }
  if (manager === "npm") {
    const ready = fs.existsSync(npmHiddenLock);
    return { ready, reason: ready ? "npm-install-complete" : "npm-install-incomplete", projectRoot, evidence };
  }
  if (manager === "yarn") {
    const ready = fs.existsSync(pnp) || fs.existsSync(yarnState) || fs.existsSync(yarnIntegrity);
    return { ready, reason: ready ? "yarn-install-complete" : "yarn-install-incomplete", projectRoot, evidence };
  }
  if (manager === "bun") {
    const ready = fs.existsSync(nodeModules);
    return { ready, reason: ready ? "bun-node-modules-present" : "bun-node-modules-missing", projectRoot, evidence };
  }
  return { ready: null, reason: "unknown-package-manager-readiness", projectRoot, evidence };
}

export function prepareWebProject(repositoryRoot, manifest, { offline = false, sourceEnvironment = process.env } = {}) {
  const readinessBefore = webProjectDependencyReadiness(repositoryRoot, manifest);
  if (!manifest.bootstrap.install) {
    return {
      ok: true,
      runtime: "web-project-prepare",
      version: WEB_PROJECT_BOOTSTRAP_VERSION,
      status: "not-required",
      command: null,
      networkPolicy: "not-used",
      credentials: "environment-allowlist-deny",
      readinessBefore,
      readinessAfter: readinessBefore,
    };
  }
  const environment = safeExecutionEnvironment(sourceEnvironment, { osEnforced: false });
  environment.PROPED_NETWORK_POLICY = offline ? "bootstrap-offline-requested" : "explicit-bootstrap-network-allowed";
  environment.COREPACK_ENABLE_NETWORK = offline ? "0" : "1";
  if (offline) {
    environment.npm_config_offline = "true";
    environment.YARN_ENABLE_NETWORK = "0";
  }
  const command = [...manifest.bootstrap.install];
  const child = spawnSync(command[0], command.slice(1), {
    cwd: readinessBefore.projectRoot,
    encoding: "utf8",
    shell: false,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const readinessAfter = webProjectDependencyReadiness(repositoryRoot, manifest);
  const result = {
    ok: child.status === 0,
    runtime: "web-project-prepare",
    version: WEB_PROJECT_BOOTSTRAP_VERSION,
    status: child.status === 0 ? "prepared" : "failed",
    exitCode: child.status,
    signal: child.signal ?? null,
    command,
    projectRoot: readinessBefore.projectRoot,
    networkPolicy: offline ? "offline-requested" : "explicit-network-allowed",
    credentials: "environment-allowlist-deny",
    shell: false,
    readinessBefore,
    readinessAfter,
    stdoutTail: (child.stdout ?? "").slice(-8192),
    stderrTail: (child.stderr ?? "").slice(-8192),
  };
  if (child.error) result.error = child.error.message;
  return result;
}
