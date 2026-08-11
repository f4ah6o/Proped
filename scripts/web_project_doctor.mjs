#!/usr/bin/env node
import path from "node:path";
import { loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";
import { diagnoseWebProjectManifestV2 } from "../protocol/web-project-doctor.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_doctor.mjs <proped.web.json> [--repository-root <dir>]");
  process.exit(message ? 2 : 0);
}
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let repositoryRoot = null;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--repository-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--repository-root requires a value");
    repositoryRoot = path.resolve(value);
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("doctor accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
if (!manifestFile) usage("doctor requires a manifest file");
try {
  const manifest = loadWebProjectManifestV2(manifestFile);
  const report = diagnoseWebProjectManifestV2(manifest, repositoryRoot ?? path.dirname(manifestFile));
  (report.ok ? console.log : console.error)(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "doctor_failed", message: error.message }));
  process.exitCode = 2;
}
