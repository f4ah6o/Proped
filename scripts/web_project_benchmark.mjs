#!/usr/bin/env node
import { runUnknownWebProjectBenchmark, runWebProjectCorpusBenchmark } from "../protocol/web-project-benchmark.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_benchmark.mjs <project> [project ...] [--corpus <production|external|file>] [--previous <summary.json>] [--baseline <baseline.json>] [--checkout-root <dir>] [--no-prepare] [--offline] [--no-artifacts] [--project-artifacts] [--output <dir>] [--sandbox-mode <auto|manifest|strict|constrained|caller-enforced>]\n\nDirect paths require all targets to auto-onboard. Corpus mode evaluates its versioned production quality gate, keeps findings separate, and can compare either a prior full summary (--previous) or a committed stable baseline (--baseline).");
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
let corpus = null;
let previous = null;
let baseline = null;
let checkoutRoot = null;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-prepare") prepare = false;
  else if (arg === "--offline") offline = true;
  else if (arg === "--no-artifacts") writeArtifacts = false;
  else if (arg === "--project-artifacts") projectArtifacts = true;
  else if (arg === "--output" || arg === "--sandbox-mode" || arg === "--corpus" || arg === "--previous" || arg === "--baseline" || arg === "--checkout-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--output") output = value;
    else if (arg === "--sandbox-mode") sandboxMode = value;
    else if (arg === "--corpus") corpus = value;
    else if (arg === "--previous") previous = value;
    else if (arg === "--baseline") baseline = value;
    else checkoutRoot = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else projects.push(arg);
}
if (!corpus && projects.length === 0) usage("web benchmark requires project paths or --corpus");
if (corpus && projects.length > 0) usage("web benchmark accepts either project paths or --corpus, not both");
if (previous && !corpus) usage("--previous requires --corpus");
if (baseline && !corpus) usage("--baseline requires --corpus");

try {
  const options = { prepare, offline, writeArtifacts, projectArtifacts, output, sandboxMode, previous, baseline, checkoutRoot };
  const result = corpus
    ? runWebProjectCorpusBenchmark(resolveWebProjectCorpus(corpus), options)
    : runUnknownWebProjectBenchmark(projects, options);
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.code ?? "web_benchmark_failed", message: error.message }));
  process.exitCode = 2;
}
