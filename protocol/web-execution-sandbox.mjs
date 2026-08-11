import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "LANG",
  "LC_ALL",
  "TZ",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "PLAYWRIGHT_BROWSERS_PATH",
]);

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function executableOnPath(name, sourceEnvironment = process.env) {
  const result = spawnSync("which", [name], {
    encoding: "utf8",
    shell: false,
    env: { PATH: sourceEnvironment.PATH ?? "" },
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function safeExecutionEnvironment(sourceEnvironment = process.env, { osEnforced = false } = {}) {
  const environment = {};
  for (const key of ENV_ALLOWLIST) {
    if (sourceEnvironment[key] !== undefined) environment[key] = sourceEnvironment[key];
  }
  if (osEnforced) {
    environment.HOME = "/tmp";
    environment.TMPDIR = "/tmp";
    environment.TMP = "/tmp";
    environment.TEMP = "/tmp";
  } else {
    for (const key of ["HOME", "TMPDIR", "TMP", "TEMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) {
      if (sourceEnvironment[key] !== undefined) environment[key] = sourceEnvironment[key];
    }
  }
  environment.CI = sourceEnvironment.CI ?? "1";
  environment.NO_COLOR = sourceEnvironment.NO_COLOR ?? "1";
  environment.PROPED_NETWORK_POLICY = osEnforced ? "os-enforced-deny" : "caller-enforced-deny";
  environment.PROPED_FILESYSTEM_WRITE_POLICY = osEnforced ? "os-enforced-explicit-writable-paths" : "caller-enforced-artifacts-and-build-output";
  environment.PROPED_UPSTREAM_WRITE_POLICY = osEnforced ? "os-enforced-deny" : "caller-enforced-deny";
  environment.PROPED_CREDENTIAL_POLICY = "environment-allowlist-deny";
  return environment;
}

export function strictSandboxCapabilities({ platform = process.platform, backendPath = null } = {}) {
  if (platform !== "linux") {
    return {
      available: false,
      platform,
      backend: null,
      strictFilesystem: false,
      networkDeny: false,
      reason: "strict Web execution sandbox currently requires Linux bubblewrap",
    };
  }
  const resolvedBackend = backendPath ?? executableOnPath("bwrap");
  if (!resolvedBackend) {
    return {
      available: false,
      platform,
      backend: "bubblewrap",
      strictFilesystem: true,
      networkDeny: true,
      reason: "bubblewrap is not installed or is not on PATH",
    };
  }
  return {
    available: true,
    platform,
    backend: "bubblewrap",
    backendPath: resolvedBackend,
    strictFilesystem: true,
    networkDeny: true,
    credentials: "environment-allowlist",
  };
}

function prepareWritablePath(repositoryRoot, candidate) {
  const root = fs.realpathSync(repositoryRoot);
  const resolved = path.resolve(root, candidate);
  if (!inside(root, resolved) || resolved === root) {
    throw new Error(`strict sandbox writable path must be a repository subpath: ${candidate}`);
  }
  const gitRoot = path.join(root, ".git");
  if (inside(gitRoot, resolved)) {
    throw new Error(`strict sandbox never permits writes inside .git: ${candidate}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);
  if (!inside(root, real) || real === root) {
    throw new Error(`strict sandbox writable path escapes repository root through a symlink: ${candidate}`);
  }
  if (inside(gitRoot, real)) {
    throw new Error(`strict sandbox never permits writes inside .git: ${candidate}`);
  }
  return real;
}

export function buildStrictSandboxInvocation({
  command,
  cwd,
  repositoryRoot,
  writablePaths = [],
  platform = process.platform,
  backendPath = null,
} = {}) {
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || part.length === 0)) {
    throw new Error("strict sandbox requires a non-empty argv command");
  }
  const root = fs.realpathSync(repositoryRoot);
  const realCwd = fs.realpathSync(cwd);
  if (!inside(root, realCwd)) throw new Error("strict sandbox cwd must stay inside repository root");
  if (root.startsWith("/tmp/") || root === "/tmp") {
    throw new Error("strict sandbox repository root cannot be under /tmp because /tmp is replaced with a private tmpfs");
  }

  const capabilities = strictSandboxCapabilities({ platform, backendPath });
  if (!capabilities.available) throw new Error(capabilities.reason);
  const writable = [...new Set(writablePaths.map((candidate) => prepareWritablePath(root, candidate)))].sort();
  const args = [
    "--die-with-parent",
    "--unshare-net",
    "--ro-bind", "/", "/",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
  ];
  for (const directory of writable) args.push("--bind", directory, directory);
  args.push(
    "--setenv", "HOME", "/tmp",
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "TMP", "/tmp",
    "--setenv", "TEMP", "/tmp",
    "--chdir", realCwd,
    "--",
    ...command,
  );
  return {
    executable: capabilities.backendPath,
    args,
    metadata: {
      mode: "strict",
      backend: "bubblewrap",
      network: "os-enforced-deny",
      sourceTree: "read-only",
      temporaryDirectory: "private-tmpfs",
      credentials: "environment-allowlist-deny",
      upstreamGitWrites: "os-enforced-deny",
      writablePaths: writable.map((directory) => path.relative(root, directory)),
    },
  };
}
