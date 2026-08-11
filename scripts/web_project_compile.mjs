#!/usr/bin/env node
import path from "node:path";
import { compileWebProjectManifestV2, loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_compile.mjs <proped.web.json> [--repository-root <dir>] [--v1-only]");
  process.exit(message ? 2 : 0);
}
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let repositoryRoot = null;
let v1Only = false;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--v1-only") v1Only = true;
  else if (arg === "--repository-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--repository-root requires a value");
    repositoryRoot = path.resolve(value);
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("compile accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
try {
  const manifest = loadWebProjectManifestV2(manifestFile);
  const compiled = compileWebProjectManifestV2(manifest, repositoryRoot ?? path.dirname(manifestFile));
  console.log(JSON.stringify(v1Only ? compiled.manifest : compiled));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "compile_failed", message: error.message }));
  process.exitCode = 2;
}
