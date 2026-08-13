#!/usr/bin/env node
import { runUnknownWebProjectCampaign } from "../protocol/web-project-campaign.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_campaign.mjs <project> [--no-prepare] [--prepare-timeout-ms <ms>] [--offline] [--no-artifacts] [--sandbox-mode <auto|manifest|strict|constrained|caller-enforced>]\n\nRuns blind inspect -> runtime/package-manager resolution -> safe prepare -> managed exploration -> replay/failure summary without requiring a handwritten manifest.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();

let project = null;
let prepare = true;
let offline = false;
let writeArtifacts = true;
let sandboxMode = "auto";
let prepareTimeoutMs = undefined;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-prepare") prepare = false;
  else if (arg === "--offline") offline = true;
  else if (arg === "--no-artifacts") writeArtifacts = false;
  else if (arg === "--prepare-timeout-ms") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--prepare-timeout-ms requires a value");
    prepareTimeoutMs = Number(value);
    if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs <= 0) usage("--prepare-timeout-ms must be a positive integer");
  } else if (arg === "--sandbox-mode") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--sandbox-mode requires a value");
    sandboxMode = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (project) usage("web campaign accepts exactly one project path");
  else project = arg;
}
if (!project) usage("web campaign requires a project path");
if (!["auto", "manifest", "strict", "constrained", "caller-enforced"].includes(sandboxMode)) usage("--sandbox-mode is invalid");

try {
  const result = runUnknownWebProjectCampaign(project, {
    prepare,
    offline,
    writeArtifacts,
    sandboxMode,
    prepareTimeoutMs,
  });
  (result.ok ? console.log : console.error)(JSON.stringify(result));
  if (result.ok) process.exitCode = 0;
  else if (result.status === "intervention-required") process.exitCode = 2;
  else process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_campaign_failed", message: error.message }));
  process.exitCode = 2;
}
