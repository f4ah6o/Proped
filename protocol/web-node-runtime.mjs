import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateNodeEngine } from "./web-node-engine.mjs";

export const WEB_NODE_RUNTIME_VERSION = "1";

function versionTuple(value) {
  const match = String(value ?? "").trim().replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : [0, 0, 0];
}

function compareVersions(a, b) {
  const left = versionTuple(a);
  const right = versionTuple(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function nodeVersion(executable) {
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    env: { PATH: process.env.PATH ?? "" },
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function candidate(executable, source, requirement) {
  try {
    if (!fs.existsSync(executable)) return null;
    const real = fs.realpathSync(executable);
    const version = nodeVersion(real);
    if (!version) return null;
    return {
      source,
      path: real,
      binDir: path.dirname(real),
      version,
      engine: evaluateNodeEngine(requirement, version),
    };
  } catch {
    return null;
  }
}

function directoryCandidates(root, executableForEntry, source, requirement) {
  if (!root || !fs.existsSync(root)) return [];
  const results = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const item = candidate(executableForEntry(root, entry.name), source, requirement);
    if (item) results.push(item);
  }
  return results;
}

export function inventoryNodeRuntimes(requirement = null, { environment = process.env, currentExecutable = process.execPath } = {}) {
  const home = environment.HOME ?? "";
  const discovered = [];
  const current = candidate(currentExecutable, "current", requirement);
  if (current) discovered.push(current);

  discovered.push(...directoryCandidates(
    environment.NVM_DIR ? path.join(environment.NVM_DIR, "versions", "node") : path.join(home, ".nvm", "versions", "node"),
    (root, entry) => path.join(root, entry, "bin", process.platform === "win32" ? "node.exe" : "node"),
    "nvm",
    requirement,
  ));
  discovered.push(...directoryCandidates(
    environment.VOLTA_HOME ? path.join(environment.VOLTA_HOME, "tools", "image", "node") : path.join(home, ".volta", "tools", "image", "node"),
    (root, entry) => path.join(root, entry, "bin", process.platform === "win32" ? "node.exe" : "node"),
    "volta",
    requirement,
  ));
  discovered.push(...directoryCandidates(
    path.join(home, ".local", "share", "fnm", "node-versions"),
    (root, entry) => path.join(root, entry, "installation", "bin", process.platform === "win32" ? "node.exe" : "node"),
    "fnm",
    requirement,
  ));
  discovered.push(...directoryCandidates(
    path.join(home, ".asdf", "installs", "nodejs"),
    (root, entry) => path.join(root, entry, "bin", process.platform === "win32" ? "node.exe" : "node"),
    "asdf",
    requirement,
  ));

  const unique = new Map();
  for (const item of discovered) {
    const existing = unique.get(item.path);
    if (!existing || existing.source !== "current") unique.set(item.path, item);
  }
  return [...unique.values()].sort((a, b) => {
    if (a.source === "current" && b.source !== "current") return -1;
    if (b.source === "current" && a.source !== "current") return 1;
    return compareVersions(b.version, a.version) || a.path.localeCompare(b.path);
  });
}

export function resolveNodeRuntime(requirement = null, options = {}) {
  const candidates = inventoryNodeRuntimes(requirement, options);
  const current = candidates.find((item) => item.source === "current") ?? null;
  if (!requirement) {
    return {
      status: current ? "selected" : "unavailable",
      requirement: null,
      selected: current,
      current,
      candidates,
      automaticDownload: false,
    };
  }
  if (current?.engine.compatible === true) {
    return {
      status: "selected",
      requirement,
      selected: current,
      current,
      candidates,
      automaticDownload: false,
    };
  }
  const compatible = candidates
    .filter((item) => item.engine.compatible === true)
    .sort((a, b) => compareVersions(b.version, a.version) || a.path.localeCompare(b.path));
  if (compatible.length > 0) {
    return {
      status: "selected",
      requirement,
      selected: compatible[0],
      current,
      candidates,
      automaticDownload: false,
    };
  }
  if (current?.engine.status === "unknown") {
    return {
      status: "unverified",
      requirement,
      selected: current,
      current,
      candidates,
      automaticDownload: false,
      reason: "unsupported-range-syntax",
    };
  }
  return {
    status: "unavailable",
    requirement,
    selected: null,
    current,
    candidates,
    automaticDownload: false,
    reason: "no-compatible-installed-runtime",
  };
}

export function applyNodeRuntimeToEnvironment(environment, resolution) {
  const result = { ...environment };
  const selected = resolution?.selected;
  if (!selected?.binDir) return result;
  const separator = path.delimiter;
  const existing = String(result.PATH ?? "").split(separator).filter(Boolean);
  result.PATH = [selected.binDir, ...existing.filter((entry) => entry !== selected.binDir)].join(separator);
  result.PROPED_TARGET_NODE_VERSION = selected.version;
  result.PROPED_TARGET_NODE_SOURCE = selected.source;
  return result;
}

export function summarizeNodeRuntimeResolution(resolution) {
  return {
    status: resolution.status,
    requirement: resolution.requirement,
    selected: resolution.selected ? {
      source: resolution.selected.source,
      version: resolution.selected.version,
      path: resolution.selected.path,
    } : null,
    current: resolution.current ? {
      source: resolution.current.source,
      version: resolution.current.version,
      path: resolution.current.path,
    } : null,
    installedCandidates: resolution.candidates.map((item) => ({
      source: item.source,
      version: item.version,
      path: item.path,
      engineStatus: item.engine.status,
      compatible: item.engine.compatible,
    })),
    automaticDownload: false,
    reason: resolution.reason ?? null,
  };
}
