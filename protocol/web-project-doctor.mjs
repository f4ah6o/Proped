import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { compileWebProjectManifestV2, validateWebProjectManifestV2 } from "./web-project-manifest-v2.mjs";
import { strictSandboxCapabilities } from "./web-execution-sandbox.mjs";
import { managedBrowserRuntimeDetails } from "../web/playwright-browser/managed-browser-runtime.mjs";

function executableAvailable(command, environment = process.env) {
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  const tool = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(tool, [command], { encoding: "utf8", shell: false, env: { PATH: environment.PATH ?? "" } });
  return result.status === 0;
}

function check(id, status, message, details = {}) {
  return { id, status, message, ...details };
}

export function diagnoseWebProjectManifestV2(manifest, repositoryRoot) {
  validateWebProjectManifestV2(manifest);
  const checks = [];
  const projectRoot = path.resolve(repositoryRoot, manifest.project.root);
  checks.push(fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()
    ? check("project-root", "pass", "project root exists")
    : check("project-root", "fail", "project root does not exist", { path: projectRoot }));

  if (manifest.project.packageManager) {
    checks.push(executableAvailable(manifest.project.packageManager)
      ? check("package-manager", "pass", `${manifest.project.packageManager} is available`)
      : check("package-manager", "fail", `${manifest.project.packageManager} is not available`));
  } else checks.push(check("package-manager", "warning", "package manager is unresolved"));

  if (manifest.bootstrap.build) {
    checks.push(executableAvailable(manifest.bootstrap.build[0])
      ? check("build-command", "pass", `build executable is available: ${manifest.bootstrap.build[0]}`)
      : check("build-command", "fail", `build executable is unavailable: ${manifest.bootstrap.build[0]}`));
  } else checks.push(check("build-command", "warning", "no build command is configured"));

  if (manifest.server.mode === "review-required") {
    checks.push(check("server", "fail", "server lifecycle requires review before compilation"));
  } else if (manifest.server.mode === "static-output") {
    const output = path.resolve(projectRoot, manifest.server.outputDir);
    if (fs.existsSync(path.join(output, "index.html"))) checks.push(check("server", "pass", "static output is ready", { output }));
    else if (manifest.bootstrap.build) checks.push(check("server", "pending", "static output is not built yet", { output }));
    else checks.push(check("server", "fail", "static output is missing and no build command is configured", { output }));
  } else if (manifest.server.mode === "command") {
    checks.push(executableAvailable(manifest.server.start?.[0])
      ? check("server", "pass", `server executable is available: ${manifest.server.start[0]}`)
      : check("server", "fail", `server executable is unavailable: ${manifest.server.start?.[0] ?? "<missing>"}`));
  } else {
    try {
      const url = new URL(manifest.server.url);
      checks.push(["http:", "https:"].includes(url.protocol)
        ? check("server", "pass", "external server URL is syntactically valid", { url: manifest.server.url })
        : check("server", "fail", "external server URL must use http or https"));
    } catch {
      checks.push(check("server", "fail", "external server URL is invalid"));
    }
  }

  const browser = managedBrowserRuntimeDetails();
  checks.push(check("managed-browser", "pass", `Proped-managed Playwright ${browser.playwrightVersion} / Chromium ${browser.chromiumVersion}`, { browser }));

  const sandbox = strictSandboxCapabilities();
  if (manifest.sandbox.mode === "strict") {
    checks.push(sandbox.available
      ? check("strict-sandbox", "pass", `strict sandbox available via ${sandbox.backend}`, { sandbox })
      : check("strict-sandbox", "warning", sandbox.reason, { sandbox }));
  } else checks.push(check("strict-sandbox", "warning", "manifest uses caller-enforced sandbox mode"));

  let compilation = null;
  try {
    compilation = compileWebProjectManifestV2(manifest, repositoryRoot);
    checks.push(check("v1-compile", "pass", "manifest compiles to Web project manifest v1", { stageCount: compilation.manifest.stages.length }));
  } catch (error) {
    checks.push(check("v1-compile", "fail", error.message));
  }

  const failures = checks.filter((item) => item.status === "fail");
  const warnings = checks.filter((item) => item.status === "warning");
  const pending = checks.filter((item) => item.status === "pending");
  return {
    ok: failures.length === 0,
    runtime: "web-project-doctor-v2",
    id: manifest.id,
    checks,
    failureCount: failures.length,
    warningCount: warnings.length,
    pendingCount: pending.length,
    runnableLocal: failures.length === 0 && (manifest.sandbox.mode !== "strict" || sandbox.available),
    strictSandboxAvailable: sandbox.available,
    compilation: compilation ? { stageCount: compilation.manifest.stages.length, execution: compilation.execution } : null,
  };
}
