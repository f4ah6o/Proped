import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertSandboxCapabilities,
  sandboxCapabilityRequirement,
  sandboxCapabilitySet,
} from "./sandbox-capability-model.mjs";

const ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "LANG",
  "LC_ALL",
  "TZ",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PROPED_COMPONENT_BENCHMARK_MAX_MS",
  "COREPACK_ENABLE_NETWORK",
  "COREPACK_ENABLE_AUTO_PIN",
  "COREPACK_HOME",
  "MOON_HOME",
]);

const MACOS_CREDENTIAL_RELATIVE_PATHS = Object.freeze([
  ".ssh",
  ".aws",
  ".azure",
  ".config/gcloud",
  ".config/gh",
  ".git-credentials",
  ".netrc",
  ".moon/credentials.json",
  "Library/Keychains",
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

export function safeExecutionEnvironment(
  sourceEnvironment = process.env,
  { osEnforced = false, temporaryDirectory = null } = {},
) {
  const environment = {};
  for (const key of ENV_ALLOWLIST) {
    if (sourceEnvironment[key] !== undefined) environment[key] = sourceEnvironment[key];
  }
  if (environment.MOON_HOME === undefined) {
    const sourceHome = sourceEnvironment.HOME;
    if (sourceHome && path.isAbsolute(sourceHome)) {
      const defaultMoonHome = path.join(sourceHome, ".moon");
      if (fs.existsSync(defaultMoonHome)) environment.MOON_HOME = fs.realpathSync(defaultMoonHome);
    }
  }
  if (osEnforced) {
    const isolatedTemporaryDirectory = temporaryDirectory ?? "/tmp";
    environment.HOME = isolatedTemporaryDirectory;
    environment.TMPDIR = isolatedTemporaryDirectory;
    environment.TMP = isolatedTemporaryDirectory;
    environment.TEMP = isolatedTemporaryDirectory;
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

function unavailableCapabilities({
  platform,
  backend,
  reason,
  capabilities = sandboxCapabilitySet(),
  requiredLevel = "strict",
}) {
  return {
    available: false,
    platform,
    backend,
    capabilities,
    requiredCapabilities: sandboxCapabilityRequirement(requiredLevel),
    diagnostic: `${requiredLevel}_capability_unavailable`,
    reason,
    strictFilesystem: false,
    networkDeny: false,
    processIsolation: false,
  };
}

export function callerEnforcedSandboxCapabilities({ platform = process.platform } = {}) {
  return {
    available: true,
    platform,
    backend: null,
    capabilities: sandboxCapabilitySet(),
    requiredCapabilities: sandboxCapabilityRequirement("caller_enforced"),
    diagnostic: "caller_enforced_execution",
  };
}

export function macosCredentialReadDenyPaths(sourceEnvironment = process.env) {
  const home = sourceEnvironment.HOME;
  if (!home || !path.isAbsolute(home)) return [];
  return MACOS_CREDENTIAL_RELATIVE_PATHS.map((candidate) => path.join(home, candidate));
}

export function macosConstrainedSourceEnvironment(sourceEnvironment = process.env) {
  const environment = { ...sourceEnvironment };
  if (environment.PLAYWRIGHT_BROWSERS_PATH !== undefined) return environment;
  const home = environment.HOME;
  if (!home || !path.isAbsolute(home)) return environment;
  const defaultBrowserCache = path.join(home, "Library", "Caches", "ms-playwright");
  if (fs.existsSync(defaultBrowserCache)) {
    environment.PLAYWRIGHT_BROWSERS_PATH = fs.realpathSync(defaultBrowserCache);
  }
  return environment;
}

export function macosConstrainedSandboxCapabilities({ platform = process.platform, backendPath = null } = {}) {
  if (platform !== "darwin") {
    return unavailableCapabilities({
      platform,
      backend: null,
      requiredLevel: "constrained",
      reason: "the constrained Seatbelt backend is only available on macOS",
    });
  }
  const resolvedBackend = backendPath ?? executableOnPath("sandbox-exec");
  if (!resolvedBackend) {
    return unavailableCapabilities({
      platform,
      backend: "sandbox-exec",
      requiredLevel: "constrained",
      reason: "sandbox-exec is not installed or is not on PATH",
    });
  }
  const capabilities = sandboxCapabilitySet({
    filesystem: "constrained",
    network: "constrained",
    process: "constrained",
  });
  return {
    available: true,
    platform,
    backend: "sandbox-exec",
    backendPath: resolvedBackend,
    capabilities,
    requiredCapabilities: sandboxCapabilityRequirement("constrained"),
    diagnostic: "constrained_capabilities_satisfied",
    strictEligible: false,
    strictFilesystem: false,
    filesystemWriteDeny: true,
    networkDeny: true,
    childPolicyInheritance: true,
    processIsolation: false,
    hostProcessVisibility: "not-isolated",
    credentials: "environment-allowlist-home-relocation-known-path-denylist",
    hostHomeReadIsolation: "unsupported",
    backendStability: "legacy-system-tool",
  };
}

export function strictSandboxCapabilities({ platform = process.platform, backendPath = null } = {}) {
  if (platform === "darwin") {
    const constrained = macosConstrainedSandboxCapabilities({ platform, backendPath });
    return {
      ...constrained,
      available: false,
      requiredCapabilities: sandboxCapabilityRequirement("strict"),
      diagnostic: "strict_capability_unavailable",
      reason: constrained.available
        ? "macOS sandbox-exec provides constrained filesystem/network/child-policy enforcement but not Linux-equivalent strict process and host-home isolation"
        : constrained.reason,
    };
  }
  if (platform !== "linux") {
    return unavailableCapabilities({
      platform,
      backend: null,
      reason: "strict Web execution sandbox currently requires Linux bubblewrap",
    });
  }
  const resolvedBackend = backendPath ?? executableOnPath("bwrap");
  if (!resolvedBackend) {
    return unavailableCapabilities({
      platform,
      backend: "bubblewrap",
      reason: "bubblewrap is not installed or is not on PATH",
    });
  }
  const capabilities = sandboxCapabilitySet({
    filesystem: "strict",
    network: "strict",
    process: "strict",
  });
  return {
    available: true,
    platform,
    backend: "bubblewrap",
    backendPath: resolvedBackend,
    capabilities,
    requiredCapabilities: sandboxCapabilityRequirement("strict"),
    diagnostic: "strict_capabilities_satisfied",
    strictFilesystem: true,
    networkDeny: true,
    processIsolation: true,
    credentials: "environment-allowlist",
  };
}

export function sandboxCapabilitiesForMode({ mode = "caller-enforced", platform = process.platform, backendPath = null } = {}) {
  if (mode === "caller-enforced") return callerEnforcedSandboxCapabilities({ platform });
  if (mode === "constrained") return macosConstrainedSandboxCapabilities({ platform, backendPath });
  if (mode === "strict") return strictSandboxCapabilities({ platform, backendPath });
  throw new Error(`unsupported sandbox mode: ${mode}`);
}

export function assertStrictSandboxCapabilities({ platform = process.platform, backendPath = null } = {}) {
  const report = strictSandboxCapabilities({ platform, backendPath });
  assertSandboxCapabilities(report.capabilities, report.requiredCapabilities, {
    platform: report.platform,
    backend: report.backend,
  });
  if (!report.available) throw new Error(report.reason);
  return report;
}

export function assertConstrainedSandboxCapabilities({ platform = process.platform, backendPath = null } = {}) {
  const report = macosConstrainedSandboxCapabilities({ platform, backendPath });
  assertSandboxCapabilities(report.capabilities, report.requiredCapabilities, {
    platform: report.platform,
    backend: report.backend,
  });
  if (!report.available) throw new Error(report.reason);
  return report;
}

function prepareWritablePath(repositoryRoot, candidate) {
  const root = fs.realpathSync(repositoryRoot);
  const resolved = path.resolve(root, candidate);
  if (!inside(root, resolved) || resolved === root) {
    throw new Error(`sandbox writable path must be a repository subpath: ${candidate}`);
  }
  const gitRoot = path.join(root, ".git");
  if (inside(gitRoot, resolved)) {
    throw new Error(`sandbox never permits writes inside .git: ${candidate}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);
  if (!inside(root, real) || real === root) {
    throw new Error(`sandbox writable path escapes repository root through a symlink: ${candidate}`);
  }
  if (inside(gitRoot, real)) {
    throw new Error(`sandbox never permits writes inside .git: ${candidate}`);
  }
  return real;
}

function prepareInvocationInputs({ command, cwd, repositoryRoot, writablePaths = [] } = {}) {
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || part.length === 0)) {
    throw new Error("sandbox requires a non-empty argv command");
  }
  const root = fs.realpathSync(repositoryRoot);
  const realCwd = fs.realpathSync(cwd);
  if (!inside(root, realCwd)) throw new Error("sandbox cwd must stay inside repository root");
  const writable = [...new Set(writablePaths.map((candidate) => prepareWritablePath(root, candidate)))].sort();
  return { root, realCwd, writable };
}


function bubblewrapSupportsWorkspaceOverlay(backendPath, sourceEnvironment = process.env) {
  const result = spawnSync(backendPath, ["--help"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    env: { PATH: sourceEnvironment.PATH ?? "" },
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return result.status === 0 && text.includes("--overlay-src") && text.includes("--overlay");
}

export function createStrictSandboxWorkspaceOverlay({
  repositoryRoot,
  platform = process.platform,
  backendPath = null,
  sourceEnvironment = process.env,
} = {}) {
  const capabilities = assertStrictSandboxCapabilities({ platform, backendPath });
  if (platform !== "linux") return null;
  const root = fs.realpathSync(repositoryRoot);

  if (typeof process.geteuid === "function" && process.geteuid() !== 0
      && bubblewrapSupportsWorkspaceOverlay(capabilities.backendPath, sourceEnvironment)) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proped-web-overlay-"));
    const upperDir = path.join(temporaryRoot, "upper");
    const workDir = path.join(temporaryRoot, "work");
    fs.mkdirSync(upperDir, { recursive: true, mode: 0o755 });
    fs.mkdirSync(workDir, { recursive: true, mode: 0o755 });
    return {
      kind: "bubblewrap-overlayfs",
      root,
      temporaryRoot,
      upperDir,
      workDir,
      backendPath: capabilities.backendPath,
    };
  }

  if (typeof process.geteuid !== "function" || process.geteuid() !== 0) return null;
  const mountExecutable = executableOnPath("mount", sourceEnvironment);
  const umountExecutable = executableOnPath("umount", sourceEnvironment);
  if (!mountExecutable || !umountExecutable) return null;
  const temporaryBase = fs.existsSync("/var/tmp") ? "/var/tmp" : os.tmpdir();
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryBase, "proped-web-overlay-"));
  const upperDir = path.join(temporaryRoot, "upper");
  const workDir = path.join(temporaryRoot, "work");
  const mergedRoot = path.join(temporaryRoot, "merged");
  fs.chmodSync(temporaryRoot, 0o755);
  fs.mkdirSync(upperDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(workDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(mergedRoot, { recursive: true, mode: 0o755 });
  const mounted = spawnSync(mountExecutable, [
    "-t", "overlay", "overlay",
    "-o", `lowerdir=${root},upperdir=${upperDir},workdir=${workDir}`,
    mergedRoot,
  ], {
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    env: { PATH: sourceEnvironment.PATH ?? "" },
  });
  if (mounted.status !== 0) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    return null;
  }
  return {
    kind: "host-overlayfs",
    root,
    temporaryRoot,
    upperDir,
    workDir,
    mergedRoot: fs.realpathSync(mergedRoot),
    mountExecutable,
    umountExecutable,
    mounted: true,
  };
}

export function cleanupStrictSandboxWorkspaceOverlay(overlay) {
  if (!overlay?.temporaryRoot) return;
  if (overlay.kind === "host-overlayfs" && overlay.mounted && overlay.mergedRoot && overlay.umountExecutable) {
    const environment = { PATH: process.env.PATH ?? "" };
    let unmounted = spawnSync(overlay.umountExecutable, [overlay.mergedRoot], {
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      env: environment,
    });
    if (unmounted.status !== 0) {
      unmounted = spawnSync(overlay.umountExecutable, ["-l", overlay.mergedRoot], {
        encoding: "utf8",
        shell: false,
        timeout: 10_000,
        env: environment,
      });
    }
  }
  fs.rmSync(overlay.temporaryRoot, { recursive: true, force: true });
}

function prepareBubblewrapWorkspaceOverlay(root, overlay) {
  if (!overlay || overlay.kind !== "bubblewrap-overlayfs") return null;
  if (fs.realpathSync(overlay.root) !== root) throw new Error("strict sandbox workspace overlay root mismatch");
  if (!path.isAbsolute(overlay.upperDir) || !fs.existsSync(overlay.upperDir)) throw new Error("strict sandbox workspace overlay upper path is unavailable");
  fs.rmSync(overlay.workDir, { recursive: true, force: true });
  fs.mkdirSync(overlay.workDir, { recursive: true, mode: 0o755 });
  return overlay;
}

export function buildStrictSandboxInvocation({
  command,
  cwd,
  repositoryRoot,
  writablePaths = [],
  credentialReadDenyPaths = [],
  platform = process.platform,
  backendPath = null,
  privateWorkspace = false,
  workspaceOverlay = null,
  networkAccess = "deny",
} = {}) {
  const { root, realCwd, writable } = prepareInvocationInputs({ command, cwd, repositoryRoot, writablePaths });
  if (!["deny", "bootstrap-allow"].includes(networkAccess)) throw new Error(`unsupported strict sandbox network access: ${networkAccess}`);
  const preparedBubblewrapOverlay = prepareBubblewrapWorkspaceOverlay(root, workspaceOverlay);
  if (root.startsWith("/tmp/") || root === "/tmp") {
    throw new Error("strict sandbox repository root cannot be under /tmp because /tmp is replaced with a private tmpfs");
  }

  const capabilities = assertStrictSandboxCapabilities({ platform, backendPath });
  const deniedCredentialPaths = [...new Set(credentialReadDenyPaths
    .filter((candidate) => typeof candidate === "string" && path.isAbsolute(candidate) && fs.existsSync(candidate))
    .map((candidate) => path.resolve(candidate)))].sort();
  const args = [
    "--die-with-parent",
    ...(networkAccess === "deny" ? ["--unshare-net"] : []),
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--new-session",
    "--ro-bind", "/", "/",
    "--dev-bind", "/dev", "/dev",
    "--proc", "/proc",
  ];
  if (preparedBubblewrapOverlay) {
    args.push(
      "--overlay-src", root,
      "--overlay", preparedBubblewrapOverlay.upperDir, preparedBubblewrapOverlay.workDir, root,
    );
    const gitPath = path.join(root, ".git");
    if (fs.existsSync(gitPath)) args.push("--ro-bind", gitPath, gitPath);
  } else if (privateWorkspace) {
    args.push("--bind", root, root);
    const gitPath = path.join(root, ".git");
    if (fs.existsSync(gitPath)) args.push("--ro-bind", gitPath, gitPath);
  }
  args.push("--tmpfs", "/tmp");
  for (const denied of deniedCredentialPaths) {
    const stat = fs.lstatSync(denied);
    if (stat.isDirectory()) args.push("--tmpfs", denied, "--remount-ro", denied);
    else args.push("--ro-bind", "/dev/null", denied);
  }
  if (!privateWorkspace && !preparedBubblewrapOverlay) {
    for (const directory of writable) args.push("--bind", directory, directory);
  }
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
    environment: {
      HOME: "/tmp",
      TMPDIR: "/tmp",
      TMP: "/tmp",
      TEMP: "/tmp",
      PROPED_NETWORK_POLICY: networkAccess === "deny" ? "os-enforced-deny" : "bootstrap-network-explicit-allowed",
    },
    cleanupPaths: [],
    metadata: {
      mode: "strict",
      platform: capabilities.platform,
      backend: capabilities.backend,
      capabilities: capabilities.capabilities,
      requiredCapabilities: capabilities.requiredCapabilities,
      diagnostic: capabilities.diagnostic,
      network: networkAccess === "deny" ? "os-enforced-deny" : "bootstrap-explicit-allow",
      process: "pid-namespace-new-session",
      sourceTree: preparedBubblewrapOverlay
        ? "private-copy-on-write-worktree-host-read-only"
        : privateWorkspace ? "private-copy-on-write-worktree-host-read-only" : "read-only",
      workspaceOverlay: preparedBubblewrapOverlay
        ? "bubblewrap-persistent-overlayfs"
        : privateWorkspace ? "host-mounted-private-overlayfs" : "none",
      temporaryDirectory: "private-tmpfs",
      credentials: "environment-allowlist-and-host-path-mask",
      deniedCredentialPaths,
      upstreamGitWrites: "os-enforced-deny",
      writablePaths: writable.map((directory) => path.relative(root, directory)),
    },
  };
}

function seatbeltString(value) {
  return JSON.stringify(value);
}

export function buildMacosConstrainedSandboxInvocation({
  command,
  cwd,
  repositoryRoot,
  writablePaths = [],
  backendPath = null,
  credentialReadDenyPaths = macosCredentialReadDenyPaths(),
  temporaryDirectory = null,
} = {}) {
  const { root, realCwd, writable } = prepareInvocationInputs({ command, cwd, repositoryRoot, writablePaths });
  const capabilities = assertConstrainedSandboxCapabilities({ platform: "darwin", backendPath });
  const ownsTemporaryDirectory = temporaryDirectory === null;
  const requestedTemporaryDirectory = temporaryDirectory === null
    ? fs.mkdtempSync(path.join(os.tmpdir(), "proped-web-sandbox-"))
    : path.resolve(temporaryDirectory);
  fs.mkdirSync(requestedTemporaryDirectory, { recursive: true, mode: 0o700 });
  const isolatedTemporaryDirectory = fs.realpathSync(requestedTemporaryDirectory);

  const deniedCredentialPaths = [...new Set(credentialReadDenyPaths
    .filter((candidate) => typeof candidate === "string" && path.isAbsolute(candidate))
    .map((candidate) => path.resolve(candidate)))].sort();
  const profile = [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(allow network-inbound (local ip \"localhost:*\"))",
    "(allow network-outbound (remote ip \"localhost:*\"))",
    "(deny file-write*)",
    `(allow file-write* (literal ${seatbeltString(isolatedTemporaryDirectory)}))`,
    `(allow file-write* (subpath ${seatbeltString(isolatedTemporaryDirectory)}))`,
    ...writable.flatMap((directory) => [
      `(allow file-write* (literal ${seatbeltString(directory)}))`,
      `(allow file-write* (subpath ${seatbeltString(directory)}))`,
    ]),
    ...deniedCredentialPaths.map((directory) => `(deny file-read* (subpath ${seatbeltString(directory)}))`),
  ].join("\n");

  return {
    executable: capabilities.backendPath,
    args: ["-p", profile, ...command],
    environment: {
      HOME: isolatedTemporaryDirectory,
      TMPDIR: isolatedTemporaryDirectory,
      TMP: isolatedTemporaryDirectory,
      TEMP: isolatedTemporaryDirectory,
    },
    cleanupPaths: ownsTemporaryDirectory ? [isolatedTemporaryDirectory] : [],
    metadata: {
      mode: "constrained",
      platform: capabilities.platform,
      backend: capabilities.backend,
      capabilities: capabilities.capabilities,
      requiredCapabilities: capabilities.requiredCapabilities,
      diagnostic: capabilities.diagnostic,
      strictEligible: false,
      network: "os-enforced-external-deny-loopback-allow-seatbelt",
      process: "seatbelt-policy-inherited-no-process-namespace",
      sourceTree: "write-denied-except-explicit-writable-paths",
      temporaryDirectory: "private-host-directory",
      credentials: "environment-allowlist-home-relocated-known-path-denylist",
      hostHomeReadIsolation: "unsupported",
      upstreamGitWrites: "os-enforced-deny",
      writablePaths: writable.map((directory) => path.relative(root, directory)),
      credentialReadDenyPathCount: deniedCredentialPaths.length,
    },
  };
}

export function cleanupSandboxInvocation(invocation) {
  for (const candidate of invocation?.cleanupPaths ?? []) {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}
