#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";
import { generateGitHubActionsWorkflow } from "../protocol/github-actions-workflow.mjs";

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_ci.mjs <proped.web.json> [--output <workflow.yml>] [--proped-ref <40-char-sha>] [--repository <owner/repo>]\n\nDefault is stdout-only; --output explicitly writes the workflow.");
  process.exit(message ? 2 : 0);
}
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let output = null;
let propedRef = null;
let repository = "f4ah6o/Proped-Rabbita";
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (["--output", "--proped-ref", "--repository"].includes(arg)) {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--output") output = value;
    else if (arg === "--proped-ref") propedRef = value;
    else repository = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("web ci accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
try {
  const manifest = loadWebProjectManifestV2(manifestFile);
  const generated = generateGitHubActionsWorkflow(manifest, {
    manifestPath: path.basename(manifestFile),
    propedRepository: repository,
    propedRef,
    toolRoot: TOOL_ROOT,
  });
  if (output) {
    const file = path.resolve(output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated.workflow);
  }
  process.stdout.write(generated.workflow);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "workflow_generation_failed", message: error.message }));
  process.exitCode = 2;
}
