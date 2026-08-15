import { spawn, spawnSync } from "node:child_process";

export function cleanupIsolatedSpawnSyncProcessTree(result, { platform = process.platform } = {}) {
  if (!Number.isSafeInteger(result?.pid) || result.pid <= 0) return { attempted: false, cleaned: false };
  if (platform === "win32") {
    const killed = spawnSync("taskkill", ["/pid", String(result.pid), "/t", "/f"], { encoding: "utf8", shell: false, timeout: 10_000, windowsHide: true });
    return { attempted: true, cleaned: killed.status === 0 };
  }
  try {
    process.kill(-result.pid, "SIGKILL");
    return { attempted: true, cleaned: true };
  } catch {
    return { attempted: true, cleaned: false };
  }
}

export function spawnSyncIsolated(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    ...options,
    detached: process.platform !== "win32",
  });
  cleanupIsolatedSpawnSyncProcessTree(result);
  return result;
}

function cleanupIsolatedProcessTree(pid, { platform = process.platform } = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { attempted: false, cleaned: false };
  if (platform === "win32") {
    const killed = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    return { attempted: true, cleaned: killed.status === 0 };
  }
  try {
    process.kill(-pid, "SIGKILL");
    return { attempted: true, cleaned: true };
  } catch {
    return { attempted: true, cleaned: false };
  }
}

export function spawnIsolated(executable, args, options = {}) {
  const {
    timeout = 0,
    maxBuffer = 8 * 1024 * 1024,
    encoding = "utf8",
    ...spawnOptions
  } = options;
  if (encoding !== "utf8") throw new Error(`spawnIsolated only supports utf8 encoding, received ${encoding}`);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, args, {
        ...spawnOptions,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        pid: null,
        status: null,
        signal: null,
        error,
        stdout: "",
        stderr: "",
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminalError = null;
    let timedOut = false;
    let timer = null;

    const append = (stream, chunk) => {
      const next = stream + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") <= maxBuffer) return next;
      if (!terminalError) {
        terminalError = Object.assign(new Error("spawn output exceeded maxBuffer"), { code: "ENOBUFS" });
        cleanupIsolatedProcessTree(child.pid);
      }
      return next.slice(-maxBuffer);
    };

    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      terminalError ??= error;
    });

    if (Number.isFinite(timeout) && timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        terminalError = Object.assign(new Error(`spawn timed out after ${timeout}ms`), { code: "ETIMEDOUT" });
        cleanupIsolatedProcessTree(child.pid);
      }, timeout);
      timer.unref?.();
    }

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cleanupIsolatedProcessTree(child.pid);
      resolve({
        pid: child.pid,
        status: timedOut ? null : code,
        signal: timedOut ? "SIGTERM" : (signal ?? null),
        error: terminalError,
        stdout,
        stderr,
      });
    });
  });
}
