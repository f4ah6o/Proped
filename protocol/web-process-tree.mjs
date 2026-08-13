import { spawnSync } from "node:child_process";

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
