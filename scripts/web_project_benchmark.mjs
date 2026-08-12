#!/usr/bin/env node
import { runUnknownWebProjectBenchmark } from "../protocol/web-project-benchmark.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_benchmark.mjs <project> [project ...] [--no-prepare] [--offline] [--no-artifacts] [--project-artifacts] [--output <dir>] [--sandbox-mode <auto|manifest|strict|constrained|caller-enforced>]\n\nRuns the same unknown-project campaign across multiple targets and aggregates auto-onboarding, intervention, finding, replay, and exploration metrics. Quality findings do not make the benchmark exit nonzero; intervention-required targets do.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
const projects = [];
let prepare = true;
let offline = false;
let writeArtifacts = true;
let projectArtifacts = false;
let output = null;
let sandboxMode = "auto";
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-prepare") prepare = false;
  else if (arg === "--offline") offline = true;
  else if (arg === "--no-artifacts") writeArtifacts = false;
  else if (arg === "--project-artifacts") projectArtifacts = true;
  else if (arg === "--output" || arg === "--sandbox-mode") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--output") output = value;
    else sandboxMode = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else projects.push(arg);
}
if (projects.length === 0) usage("web benchmark requires at least one project path");

try {
  const result = runUnknownWebProjectBenchmark(projects, {
    prepare,
    offline,
    writeArtifacts,
    projectArtifacts,
    output,
    sandboxMode,
  });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_benchmark_failed", message: error.message }));
  process.exitCode = 2;
}
