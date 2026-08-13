import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const WEB_PACKAGE_MANAGER_RUNTIME_VERSION = "1";

function corepackManaged(manifest) {
  return ["npm", "pnpm", "yarn"].includes(manifest?.project?.packageManager) && typeof manifest?.project?.packageManagerReference === "string" && manifest.project.packageManagerReference.length > 0;
}

export function defaultCorepackHome(environment = process.env) {
  if (environment.COREPACK_HOME) return environment.COREPACK_HOME;
  const base = environment.XDG_CACHE_HOME ?? environment.LOCALAPPDATA ?? (environment.HOME ? path.join(environment.HOME, ".cache") : null);
  return base ? path.join(base, "node", "corepack") : null;
}

export function applyPackageManagerRuntimeEnvironment(manifest, environment = process.env, { allowNetwork = false } = {}) {
  const result = { ...environment };
  if (!corepackManaged(manifest)) return result;
  result.COREPACK_ENABLE_NETWORK = allowNetwork ? "1" : "0";
  result.COREPACK_ENABLE_AUTO_PIN = "0";
  const home = defaultCorepackHome(environment);
  if (home) result.COREPACK_HOME = home;
  return result;
}

function executableAvailable(name, environment) {
  const tool = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(tool, [name], { encoding: "utf8", shell: false, env: { PATH: environment.PATH ?? "" } });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null;
}

export function probePackageManagerRuntime(repositoryRoot, manifest, environment = process.env) {
  const manager = manifest?.project?.packageManager ?? null;
  const reference = manifest?.project?.packageManagerReference ?? null;
  if (!manager) return { status: "unresolved", manager: null, reference: null, executable: null, corepack: false };
  if (!corepackManaged(manifest)) {
    const executable = executableAvailable(manager, environment);
    return { status: executable ? "ready" : "unavailable", manager, reference, executable, corepack: false };
  }
  const executable = executableAvailable("corepack", environment);
  if (!executable) return { status: "unavailable", manager, reference, executable: null, corepack: true, reason: "corepack-unavailable" };
  const projectRoot = path.resolve(repositoryRoot, manifest.project.root);
  if (!fs.existsSync(projectRoot)) return { status: "unavailable", manager, reference, executable, corepack: true, reason: "project-root-missing" };
  const probeEnvironment = applyPackageManagerRuntimeEnvironment(manifest, environment, { allowNetwork: false });
  const installCommand = manifest?.bootstrap?.install;
  const corepackProxy = Array.isArray(installCommand)
    && installCommand[0] === "corepack"
    && typeof installCommand[1] === "string"
    && installCommand[1].startsWith(`${manager}@`)
    ? installCommand[1]
    : manager;
  const result = spawnSync(executable, [corepackProxy, "--version"], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
    env: probeEnvironment,
    timeout: 10_000,
  });
  if (result.status === 0) {
    return { status: "ready", manager, reference, executable, corepack: true, proxy: corepackProxy, version: result.stdout.trim(), corepackHome: probeEnvironment.COREPACK_HOME ?? null };
  }
  const stderr = (result.stderr ?? "").trim();
  const networkDenied = /Network access disabled by the environment/i.test(stderr);
  return {
    status: networkDenied ? "prepare-required" : "unavailable",
    manager,
    reference,
    executable,
    corepack: true,
    proxy: corepackProxy,
    reason: networkDenied ? "corepack-manager-not-cached" : "corepack-probe-failed",
    stderrTail: stderr.slice(-2048),
    corepackHome: probeEnvironment.COREPACK_HOME ?? null,
  };
}
