#!/usr/bin/env node
import {
  aggregateWebProjectCorpusShards,
  materializeWebProjectCorpusShard,
  productionContractShardMatrix,
  readWebProjectCorpusShardSummaries,
  runWebProjectCorpusShard,
  writeWebProjectBenchmarkJson,
} from "../protocol/web-project-benchmark-shard.mjs";
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(`Usage:
  node scripts/web_project_benchmark_shard.mjs matrix
  node scripts/web_project_benchmark_shard.mjs materialize --corpus <promoted-production|external-production> --targets <id[,id...]> --checkout-root <dir> [--no-fetch]
  node scripts/web_project_benchmark_shard.mjs run --corpus <promoted-production|external-production> --targets <id[,id...]> --checkout-root <dir> --output <summary.json> [--sandbox-mode <mode>] [--prepare-timeout-ms <ms>] [--no-prepare] [--offline]
  node scripts/web_project_benchmark_shard.mjs aggregate --corpus <promoted-production|external-production> --input-dir <dir> --output <summary.json> [--baseline <baseline.json>]

Shard runs collect evidence only. Full production quality and baseline gates are evaluated once by aggregate.`);
  process.exit(message ? 2 : 0);
}

function parseTargets(value) {
  if (!value) usage("--targets requires a comma-separated value");
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) usage("--targets requires at least one target id");
  return values;
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
const command = argv.shift();
if (!new Set(["matrix", "materialize", "run", "aggregate"]).has(command)) usage(`unknown command: ${command}`);

if (command === "matrix") {
  if (argv.length > 0) usage("matrix does not accept arguments");
  const corpora = [resolveWebProjectCorpus("promoted-production"), resolveWebProjectCorpus("external-production")];
  console.log(JSON.stringify(productionContractShardMatrix(corpora)));
  process.exit(0);
}

let corpusArg = null;
let targetIds = null;
let checkoutRoot = null;
let inputDir = null;
let output = null;
let baseline = null;
let sandboxMode = "auto";
let prepare = true;
let offline = false;
let fetch = true;
let prepareTimeoutMs = undefined;

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-prepare") prepare = false;
  else if (arg === "--offline") offline = true;
  else if (arg === "--no-fetch") fetch = false;
  else if (["--corpus", "--targets", "--checkout-root", "--input-dir", "--output", "--baseline", "--sandbox-mode", "--prepare-timeout-ms"].includes(arg)) {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--corpus") corpusArg = value;
    else if (arg === "--targets") targetIds = parseTargets(value);
    else if (arg === "--checkout-root") checkoutRoot = value;
    else if (arg === "--input-dir") inputDir = value;
    else if (arg === "--output") output = value;
    else if (arg === "--baseline") baseline = value;
    else if (arg === "--sandbox-mode") sandboxMode = value;
    else if (arg === "--prepare-timeout-ms") {
      prepareTimeoutMs = Number(value);
      if (!Number.isSafeInteger(prepareTimeoutMs) || prepareTimeoutMs <= 0) usage("--prepare-timeout-ms must be a positive integer");
    }
  } else usage(`unknown option: ${arg}`);
}

if (!corpusArg) usage("--corpus is required");
const corpus = resolveWebProjectCorpus(corpusArg);

try {
  if (command === "materialize") {
    if (!targetIds) usage("materialize requires --targets");
    if (!checkoutRoot) usage("materialize requires --checkout-root");
    if (inputDir || output || baseline || offline || prepare === false || sandboxMode !== "auto" || prepareTimeoutMs != null) usage("materialize received run/aggregate-only options");
    const result = materializeWebProjectCorpusShard(corpus, targetIds, { checkoutRoot, fetch });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } else if (command === "run") {
    if (!targetIds) usage("run requires --targets");
    if (!checkoutRoot) usage("run requires --checkout-root");
    if (!output) usage("run requires --output");
    if (inputDir || baseline || fetch === false) usage("run received materialize/aggregate-only options");
    const result = runWebProjectCorpusShard(corpus, targetIds, {
      checkoutRoot,
      prepare,
      offline,
      sandboxMode,
      prepareTimeoutMs,
      writeArtifacts: false,
      projectArtifacts: false,
    });
    writeWebProjectBenchmarkJson(output, result);
    console.log(JSON.stringify(result));
    process.exitCode = 0;
  } else {
    if (!inputDir) usage("aggregate requires --input-dir");
    if (!output) usage("aggregate requires --output");
    if (targetIds || checkoutRoot || offline || prepare === false || fetch === false || sandboxMode !== "auto" || prepareTimeoutMs != null) usage("aggregate received materialize/run-only options");
    const shards = readWebProjectCorpusShardSummaries(inputDir, corpus.id);
    const result = aggregateWebProjectCorpusShards(corpus, shards, { baseline });
    writeWebProjectBenchmarkJson(output, result);
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.code ?? "web_benchmark_shard_failed",
    message: error.message,
    ...(error.missing ? { missing: error.missing } : {}),
    ...(error.extra ? { extra: error.extra } : {}),
  }));
  process.exitCode = 2;
}
