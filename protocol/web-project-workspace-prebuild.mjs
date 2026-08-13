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

export function discoverWebProjectWorkspacePrebuild(projectRoot, workspaceRoot) {
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
  if (!fs.existsSync(descriptor) || !fs.statSync(descriptor).isFile()) return null;
  return {
    kind: "moonbit-workspace",
    root: workspace,
    descriptor: "moon.work",
    command: ["moon", "build", "--target", "js", "--release"],
    shell: false,
    confidence: 0.95,
  };
}

export function prepareWebProjectWorkspace(prebuild, { sourceEnvironment = process.env, timeoutMs = 300_000 } = {}) {
  if (!prebuild) return null;
  if (prebuild.kind !== "moonbit-workspace") {
    const error = new Error(`unsupported workspace prebuild kind: ${prebuild.kind}`);
    error.code = "workspace_prebuild_unsupported";
    throw error;
  }
  const environment = safeExecutionEnvironment(sourceEnvironment, { osEnforced: false });
  const result = spawnSync(prebuild.command[0], prebuild.command.slice(1), {
    cwd: prebuild.root,
    env: environment,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
  });
  if (result.error?.code === "ENOENT") {
    return {
      ok: false,
      runtime: "web-project-workspace-prebuild",
      status: "tool-unavailable",
      command: prebuild.command,
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
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM" && result.status == null;
  const ok = result.status === 0 && !result.error;
  return {
    ok,
    runtime: "web-project-workspace-prebuild",
    status: ok ? "prepared" : timedOut ? "timeout" : "failed",
    command: prebuild.command,
    workspaceRoot: prebuild.root,
    descriptor: prebuild.descriptor,
    shell: false,
    credentials: "environment-allowlist-deny",
    exitCode: result.status,
    signal: result.signal ?? null,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr || result.error?.message || ""),
  };
}
