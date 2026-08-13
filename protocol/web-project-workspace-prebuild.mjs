import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeExecutionEnvironment } from "./web-execution-sandbox.mjs";

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function tail(value, limit = 4096) {
  const text = typeof value === "string" ? value : "";
  return text.length <= limit ? text : text.slice(-limit);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function workspacePatterns(pkg) {
  if (Array.isArray(pkg?.workspaces)) return pkg.workspaces;
  if (Array.isArray(pkg?.workspaces?.packages)) return pkg.workspaces.packages;
  return [];
}

function safeWorkspacePattern(value) {
  if (typeof value !== "string" || !value.length || path.isAbsolute(value)) return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part === ".git")) return null;
  return normalized;
}

function expandWorkspacePattern(root, pattern) {
  const normalized = safeWorkspacePattern(pattern);
  if (!normalized) return [];
  if (!normalized.includes("*")) {
    const candidate = path.join(root, normalized);
    return fs.existsSync(path.join(candidate, "package.json")) ? [candidate] : [];
  }
  if (!normalized.endsWith("/*") || normalized.slice(0, -2).includes("*")) return [];
  const parent = path.join(root, normalized.slice(0, -2));
  let entries;
  try { entries = fs.readdirSync(parent, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(parent, entry.name, "package.json")))
    .map((entry) => path.join(parent, entry.name))
    .sort();
}

function workspacePackageMap(workspace, rootPackage) {
  const packages = new Map();
  for (const pattern of workspacePatterns(rootPackage)) {
    for (const directory of expandWorkspacePattern(workspace, pattern)) {
      const pkg = readJson(path.join(directory, "package.json"));
      if (typeof pkg?.name !== "string" || !pkg.name.length || packages.has(pkg.name)) continue;
      packages.set(pkg.name, { name: pkg.name, root: directory, pkg });
    }
  }
  return packages;
}

function packageManagerPrefix(rootPackage) {
  if (typeof rootPackage?.packageManager !== "string") return null;
  const match = /^(npm|pnpm|yarn|bun)@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(rootPackage.packageManager.trim());
  if (!match) return null;
  return match[1] === "bun" ? ["bun"] : ["corepack", match[1]];
}

function localWorkspaceDependencies(pkg, packages) {
  const result = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = pkg?.[field];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [name, selector] of Object.entries(dependencies)) {
      if (typeof selector === "string" && selector.startsWith("workspace:") && packages.has(name)) result.push(name);
    }
  }
  return [...new Set(result)].sort();
}

function javaScriptWorkspacePrebuild(project, workspace) {
  const rootPackage = readJson(path.join(workspace, "package.json"));
  const prefix = packageManagerPrefix(rootPackage);
  if (!prefix || workspacePatterns(rootPackage).length === 0) return null;
  const packages = workspacePackageMap(workspace, rootPackage);
  const projectPackage = readJson(path.join(project, "package.json"));
  if (!projectPackage?.name || packages.get(projectPackage.name)?.root !== project) return null;

  const order = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      const error = new Error(`JavaScript workspace dependency cycle requires review: ${name}`);
      error.code = "workspace_dependency_cycle";
      throw error;
    }
    const entry = packages.get(name);
    if (!entry) return;
    visiting.add(name);
    for (const dependency of localWorkspaceDependencies(entry.pkg, packages)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    if (name !== projectPackage.name && typeof entry.pkg?.scripts?.build === "string" && entry.pkg.scripts.build.length > 0) {
      order.push({
        packageName: name,
        cwd: entry.root,
        command: [...prefix, "run", "build"],
      });
    }
  };
  for (const dependency of localWorkspaceDependencies(projectPackage, packages)) visit(dependency);
  if (order.length === 0) return null;
  return {
    kind: "javascript-workspace",
    root: workspace,
    descriptor: "package.json#workspaces",
    command: order[0].command,
    commands: order,
    shell: false,
    confidence: 0.95,
  };
}

export function discoverWebProjectWorkspacePrebuild(projectRoot, workspaceRoot, { allowMoonBit = true } = {}) {
  if (!workspaceRoot) return null;
  const project = fs.realpathSync(projectRoot);
  const workspace = fs.realpathSync(workspaceRoot);
  if (!inside(workspace, project)) {
    const error = new Error("workspace root does not contain the Web project");
    error.code = "workspace_root_mismatch";
    throw error;
  }
  if (workspace === project) return null;
  const descriptor = path.join(workspace, "moon.work");
  if (allowMoonBit && fs.existsSync(descriptor) && fs.statSync(descriptor).isFile()) {
    return {
      kind: "moonbit-workspace",
      root: workspace,
      descriptor: "moon.work",
      command: ["moon", "build", "--target", "js", "--release"],
      shell: false,
      confidence: 0.95,
    };
  }
  return javaScriptWorkspacePrebuild(project, workspace);
}

function killTimedOutProcessTree(result) {
  if (result?.error?.code !== "ETIMEDOUT" || !Number.isSafeInteger(result.pid) || result.pid <= 0) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(result.pid), "/t", "/f"], { encoding: "utf8", shell: false, timeout: 10_000 });
    } else {
      process.kill(-result.pid, "SIGKILL");
    }
  } catch {
    // The process group may already be gone after the direct child timeout.
  }
}

function executeWorkspaceCommand(entry, environment, timeoutMs) {
  const result = spawnSync(entry.command[0], entry.command.slice(1), {
    cwd: entry.cwd,
    env: environment,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    detached: process.platform !== "win32",
  });
  killTimedOutProcessTree(result);
  return result;
}

export function prepareWebProjectWorkspace(prebuild, { sourceEnvironment = process.env, timeoutMs = 300_000 } = {}) {
  if (!prebuild) return null;
  if (!["moonbit-workspace", "javascript-workspace"].includes(prebuild.kind)) {
    const error = new Error(`unsupported workspace prebuild kind: ${prebuild.kind}`);
    error.code = "workspace_prebuild_unsupported";
    throw error;
  }
  const environment = safeExecutionEnvironment(sourceEnvironment, { osEnforced: false });
  const entries = prebuild.kind === "javascript-workspace"
    ? prebuild.commands
    : [{ packageName: null, cwd: prebuild.root, command: prebuild.command }];
  const startedAt = Date.now();
  const completed = [];
  for (const entry of entries) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(1, timeoutMs - elapsed);
    const result = executeWorkspaceCommand(entry, environment, remaining);
    const commandResult = {
      packageName: entry.packageName ?? null,
      cwd: entry.cwd,
      command: entry.command,
      exitCode: result.status,
      signal: result.signal ?? null,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr || result.error?.message || ""),
    };
    completed.push(commandResult);
    if (result.error?.code === "ENOENT") {
      return {
        ok: false,
        runtime: "web-project-workspace-prebuild",
        status: "tool-unavailable",
        command: entry.command,
        commands: completed,
        workspaceRoot: prebuild.root,
        descriptor: prebuild.descriptor,
        shell: false,
        credentials: "environment-allowlist-deny",
        exitCode: null,
        signal: null,
        stdoutTail: "",
        stderrTail: "",
      };
    }
    const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGKILL" && result.status == null;
    const ok = result.status === 0 && !result.error;
    if (!ok) {
      return {
        ok: false,
        runtime: "web-project-workspace-prebuild",
        status: timedOut ? "timeout" : "failed",
        command: entry.command,
        commands: completed,
        workspaceRoot: prebuild.root,
        descriptor: prebuild.descriptor,
        shell: false,
        credentials: "environment-allowlist-deny",
        exitCode: result.status,
        signal: result.signal ?? null,
        stdoutTail: commandResult.stdoutTail,
        stderrTail: commandResult.stderrTail,
      };
    }
  }
  const last = completed.at(-1) ?? null;
  return {
    ok: true,
    runtime: "web-project-workspace-prebuild",
    status: "prepared",
    command: prebuild.command,
    commands: completed,
    workspaceRoot: prebuild.root,
    descriptor: prebuild.descriptor,
    shell: false,
    credentials: "environment-allowlist-deny",
    exitCode: 0,
    signal: null,
    stdoutTail: last?.stdoutTail ?? "",
    stderrTail: last?.stderrTail ?? "",
  };
}
