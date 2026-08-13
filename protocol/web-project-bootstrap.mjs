import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeExecutionEnvironment } from "./web-execution-sandbox.mjs";

export const WEB_PROJECT_BOOTSTRAP_VERSION = "1";
export const DEFAULT_WEB_PROJECT_PREPARE_TIMEOUT_MS = 300_000;

function prepareTimeoutMs(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Web project bootstrap: timeoutMs must be a positive safe integer");
  return value;
}

function killTimedOutProcessTree(child) {
  if (child?.error?.code !== "ETIMEDOUT" || !Number.isSafeInteger(child.pid) || child.pid <= 0) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { encoding: "utf8", shell: false, timeout: 10_000 });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    // The process group may already be gone after the direct child timeout.
  }
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function declaredDependencyNames(projectRoot) {
  const packageFile = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packageFile)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    const names = new Set();
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const dependencies = pkg?.[field];
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
      for (const name of Object.keys(dependencies)) names.add(name);
    }
    return [...names].sort();
  } catch {
    return null;
  }
}

function declaredDependencyCount(projectRoot) {
  return declaredDependencyNames(projectRoot)?.length ?? null;
}

function declaredDependenciesPresent(projectRoot) {
  const names = declaredDependencyNames(projectRoot);
  if (!names || names.length === 0) return null;
  const nodeModules = path.join(projectRoot, "node_modules");
  if (!fs.existsSync(nodeModules)) return { present: 0, total: names.length, missing: names };
  const missing = names.filter((name) => !fs.existsSync(path.join(nodeModules, ...name.split("/"))));
  return { present: names.length - missing.length, total: names.length, missing };
}

function isCanonicalPackageManagerInstall(manifest) {
  const command = manifest?.bootstrap?.install;
  const manager = manifest?.project?.packageManager;
  if (!Array.isArray(command) || command.length === 0 || !manager) return false;
  if (command[0] === manager) return true;
  return command[0] === "corepack" && command[1] === manager;
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
  const dependencyCount = declaredDependencyCount(projectRoot);
  if (dependencyCount === 0 && isCanonicalPackageManagerInstall(manifest)) {
    return { ready: true, reason: `${manager ?? "project"}-no-dependencies`, projectRoot, evidence: ["declared-dependencies:0"] };
  }
  const nodeModules = path.join(projectRoot, "node_modules");
  const pnpmModules = path.join(nodeModules, ".modules.yaml");
  const npmHiddenLock = path.join(nodeModules, ".package-lock.json");
  const pnp = path.join(projectRoot, ".pnp.cjs");
  const yarnState = path.join(nodeModules, ".yarn-state.yml");
  const yarnIntegrity = path.join(nodeModules, ".yarn-integrity");
  const declaredPresence = declaredDependenciesPresent(projectRoot);
  for (const [label, candidate] of [["node_modules", nodeModules], ["pnpm-modules", pnpmModules], ["npm-hidden-lock", npmHiddenLock], [".pnp.cjs", pnp], ["yarn-state", yarnState], ["yarn-integrity", yarnIntegrity]]) {
    if (fs.existsSync(candidate)) evidence.push(label);
  }
  const declaredReady = Boolean(declaredPresence && declaredPresence.total > 0 && declaredPresence.missing.length === 0 && isCanonicalPackageManagerInstall(manifest));
  if (declaredReady) evidence.push(`declared-dependencies-present:${declaredPresence.total}`);
  if (manager === "pnpm") {
    const ready = fs.existsSync(pnpmModules) || declaredReady;
    return { ready, reason: fs.existsSync(pnpmModules) ? "pnpm-install-complete" : ready ? "declared-dependencies-present" : "pnpm-install-incomplete", projectRoot, evidence };
  }
  if (manager === "npm") {
    const ready = fs.existsSync(npmHiddenLock) || declaredReady;
    return { ready, reason: fs.existsSync(npmHiddenLock) ? "npm-install-complete" : ready ? "declared-dependencies-present" : "npm-install-incomplete", projectRoot, evidence };
  }
  if (manager === "yarn") {
    const markerReady = fs.existsSync(pnp) || fs.existsSync(yarnState) || fs.existsSync(yarnIntegrity);
    const ready = markerReady || declaredReady;
    return { ready, reason: markerReady ? "yarn-install-complete" : ready ? "declared-dependencies-present" : "yarn-install-incomplete", projectRoot, evidence };
  }
  if (manager === "bun") {
    const ready = fs.existsSync(nodeModules);
    return { ready, reason: ready ? "bun-node-modules-present" : "bun-node-modules-missing", projectRoot, evidence };
  }
  return { ready: null, reason: "unknown-package-manager-readiness", projectRoot, evidence };
}

export function prepareWebProject(repositoryRoot, manifest, { offline = false, sourceEnvironment = process.env, timeoutMs = DEFAULT_WEB_PROJECT_PREPARE_TIMEOUT_MS } = {}) {
  const boundedTimeoutMs = prepareTimeoutMs(timeoutMs);
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
    timeout: boundedTimeoutMs,
    killSignal: "SIGKILL",
    detached: process.platform !== "win32",
  });
  killTimedOutProcessTree(child);
  const timedOut = child?.error?.code === "ETIMEDOUT";
  const readinessAfter = webProjectDependencyReadiness(repositoryRoot, manifest);
  const result = {
    ok: child.status === 0 && !timedOut,
    runtime: "web-project-prepare",
    version: WEB_PROJECT_BOOTSTRAP_VERSION,
    status: timedOut ? "timed-out" : child.status === 0 ? "prepared" : "failed",
    timedOut,
    timeoutMs: boundedTimeoutMs,
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
