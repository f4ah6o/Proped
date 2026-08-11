#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash } from "../protocol/ui-driver-v1.mjs";
import {
  DEFAULT_BENCHMARK_ITERATIONS,
  DEFAULT_MUTATION_QUALITY_CONTRACT,
  WEB_MUTATION_SCENARIOS,
  evaluateMutationCatalog,
  evaluateMutationQualityGate,
  measureMutationThroughput,
  runMutationScenario,
} from "../protocol/web-mutation-benchmark.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const HERE = path.dirname(SCRIPT);
const ROOT = path.resolve(HERE, "..");
const FIXTURE = path.join(ROOT, "protocol/fixtures/web-mutation-benchmark-result.json");
const DEFAULT_OUTPUT = path.join(ROOT, "protocol/out/web-mutation-benchmark");

const HELP = `Usage: node scripts/test_web_mutation_benchmark.mjs [options]

Options:
  --iterations <count>                    Throughput measurement iterations
  --minimum-mutation-score <0..1>         Required killed-mutation ratio
  --maximum-false-positive-rate <0..1>    Allowed healthy-control failure ratio
  --minimum-transitions-per-second <n>    Required transition throughput
  --maximum-elapsed-ms <n>                Allowed benchmark duration
  --output <directory>                    Artifact output directory
  --no-artifacts                          Do not write JSON/HTML/SVG/DOT artifacts
  --update-fixture                        Replace the deterministic golden fixture
  --help                                  Show this help
`;

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function finiteNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${option} requires a finite number`);
  return parsed;
}

export function parseBenchmarkArgs(argv) {
  const options = {
    iterations: DEFAULT_BENCHMARK_ITERATIONS,
    contract: { ...DEFAULT_MUTATION_QUALITY_CONTRACT },
    output: DEFAULT_OUTPUT,
    writeArtifacts: true,
    updateFixture: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    switch (option) {
      case "--iterations": {
        const value = finiteNumber(requireValue(argv, index, option), option);
        if (!Number.isInteger(value) || value <= 0) throw new Error("--iterations must be a positive integer");
        options.iterations = value;
        index += 1;
        break;
      }
      case "--minimum-mutation-score": {
        const value = finiteNumber(requireValue(argv, index, option), option);
        if (value < 0 || value > 1) throw new Error("--minimum-mutation-score must be between 0 and 1");
        options.contract.minimumMutationScore = value;
        index += 1;
        break;
      }
      case "--maximum-false-positive-rate": {
        const value = finiteNumber(requireValue(argv, index, option), option);
        if (value < 0 || value > 1) throw new Error("--maximum-false-positive-rate must be between 0 and 1");
        options.contract.maximumFalsePositiveRate = value;
        index += 1;
        break;
      }
      case "--minimum-transitions-per-second": {
        const value = finiteNumber(requireValue(argv, index, option), option);
        if (value < 0) throw new Error("--minimum-transitions-per-second must be non-negative");
        options.contract.minimumTransitionsPerSecond = value;
        index += 1;
        break;
      }
      case "--maximum-elapsed-ms": {
        const value = finiteNumber(requireValue(argv, index, option), option);
        if (value < 0) throw new Error("--maximum-elapsed-ms must be non-negative");
        options.contract.maximumElapsedMs = value;
        index += 1;
        break;
      }
      case "--output":
        options.output = path.resolve(process.cwd(), requireValue(argv, index, option));
        index += 1;
        break;
      case "--no-artifacts":
        options.writeArtifacts = false;
        break;
      case "--update-fixture":
        options.updateFixture = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${option}`);
    }
  }
  return options;
}

export function writeArtifacts(output, stable, performance, qualityGate) {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const report = { ...stable, performance, qualityGate };
  fs.writeFileSync(path.join(output, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  const atlas = {
    schemaVersion: 2,
    strategy: "web-mutation-benchmark",
    mutationScore: stable.metrics.mutationScore,
    falsePositiveRate: stable.metrics.falsePositiveRate,
    mutations: stable.mutations,
    controls: stable.controls,
    performance,
    qualityGate,
    semanticHash: stable.semanticHash,
  };
  fs.writeFileSync(path.join(output, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  const edges = stable.mutations.map((mutation) =>
    `  "${mutation.operator}" -> "${mutation.property}" [label="${mutation.minimalTraceLength} actions"];`,
  ).join("\n");
  fs.writeFileSync(path.join(output, "atlas.dot"), `digraph mutations {\n${edges}\n}\n`);
  fs.writeFileSync(
    path.join(output, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="200"><rect width="100%" height="100%" fill="white"/><text x="24" y="42">Web mutation benchmark</text><text x="24" y="82">Mutation score: ${(stable.metrics.mutationScore * 100).toFixed(0)}% / false positives: ${stable.metrics.falsePositiveCount}</text><text x="24" y="122">Quality gate: ${qualityGate.ok ? "pass" : `fail (${qualityGate.failureCount})`} / ${stable.metrics.minimalTraceActions} minimized actions</text><text x="24" y="162">${Math.round(performance.transitionsPerSecond)} transitions/second</text></svg>\n`,
  );
  fs.writeFileSync(
    path.join(output, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>Web mutation benchmark</title><body><h1>Web mutation benchmark</h1><p>Quality gate: <strong>${qualityGate.ok ? "pass" : "fail"}</strong></p><pre>${JSON.stringify(atlas, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`,
  );
}

function assertProtocolContracts(catalog) {
  assert.equal(catalog.mutationCount, 8);
  assert.equal(catalog.killedCount, 8);
  assert.equal(catalog.survivedCount, 0);
  assert.equal(catalog.mutationScore, 1);
  assert.equal(catalog.falsePositiveCount, 0);
  assert.equal(catalog.falsePositiveRate, 0);
  assert.deepEqual(
    catalog.mutations.map((mutation) => mutation.property).sort(),
    [
      "deterministic_replay",
      "duplicate_submit",
      "entity_consistency",
      "focus_integrity",
      "hydration_warning",
      "pending_effect_leak",
      "stale_response",
      "unhandled_exception",
    ],
  );
  for (const mutation of catalog.mutations) {
    assert.equal(mutation.minimalTraceLength, mutation.expectedMinimalLength, mutation.operator);
    assert.equal(mutation.deterministicReplay, true, mutation.operator);
    assert.ok(mutation.signature, mutation.operator);
    const scenario = WEB_MUTATION_SCENARIOS.find((candidate) => candidate.id === mutation.operator);
    assert.equal(runMutationScenario(scenario, { mutant: false }).violations.length, 0);
  }
}

function assertQualityGateContracts(catalog) {
  const fast = { transitionsPerSecond: 20_000, elapsedMs: 100 };
  assert.equal(evaluateMutationQualityGate({ catalog, performance: fast }).ok, true);
  const broken = structuredClone(catalog);
  broken.mutationScore = 0.75;
  broken.falsePositiveRate = 0.25;
  broken.mutations[0].killed = false;
  broken.mutations[1].deterministicReplay = false;
  broken.mutations[2].minimalTraceLength += 1;
  broken.controls[0].violationCount = 1;
  const gate = evaluateMutationQualityGate({
    catalog: broken,
    performance: { transitionsPerSecond: 1, elapsedMs: 20_000 },
  });
  assert.equal(gate.ok, false);
  assert.deepEqual(
    gate.failures.map((failure) => failure.code),
    [
      "mutation_score_below_minimum",
      "false_positive_rate_above_maximum",
      "nondeterministic_replay",
      "unexpected_minimal_trace_length",
      "throughput_below_minimum",
      "elapsed_time_above_maximum",
    ],
  );
  assert.throws(() => evaluateMutationQualityGate({
    catalog,
    performance: fast,
    contract: { minimumMutationScore: 1.1 },
  }), /between 0 and 1/);
}

function assertArgumentContracts() {
  assert.throws(() => parseBenchmarkArgs(["--unknown"]), /unknown option/);
  assert.throws(() => parseBenchmarkArgs(["--iterations"]), /requires a value/);
  assert.throws(() => parseBenchmarkArgs(["--iterations", "0"]), /positive integer/);
  assert.throws(() => parseBenchmarkArgs(["--maximum-elapsed-ms", "NaN"]), /finite number/);
  assert.throws(() => parseBenchmarkArgs(["--minimum-mutation-score", "1.1"]), /between 0 and 1/);
  assert.throws(() => parseBenchmarkArgs(["--maximum-false-positive-rate", "-0.1"]), /between 0 and 1/);
  assert.throws(() => parseBenchmarkArgs(["--minimum-transitions-per-second", "-1"]), /non-negative/);
  const parsed = parseBenchmarkArgs([
    "--iterations", "2",
    "--minimum-mutation-score", "0.75",
    "--maximum-false-positive-rate", "0.25",
    "--minimum-transitions-per-second", "0",
    "--maximum-elapsed-ms", "20000",
    "--output", ".tmp/custom-web-mutation",
    "--no-artifacts",
  ]);
  assert.equal(parsed.iterations, 2);
  assert.equal(parsed.contract.minimumMutationScore, 0.75);
  assert.equal(parsed.contract.maximumFalsePositiveRate, 0.25);
  assert.equal(parsed.writeArtifacts, false);
  assert.equal(parsed.output, path.resolve(process.cwd(), ".tmp/custom-web-mutation"));
}

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PROPED_WEB_MUTATION_SKIP_CLI_TESTS: "1" },
  });
}

function parseCliJson(text, label) {
  const trimmed = text.trim();
  assert.notEqual(trimmed, "", `${label} must emit JSON`);
  return JSON.parse(trimmed);
}

function assertCliContracts() {
  const unknown = runCli(["--unknown"]);
  assert.equal(unknown.status, 2);
  assert.equal(parseCliJson(unknown.stderr, "unknown argument").error, "invalid_arguments");

  const missing = runCli(["--iterations"]);
  assert.equal(missing.status, 2);
  assert.equal(parseCliJson(missing.stderr, "missing argument").error, "invalid_arguments");

  const invalid = runCli(["--iterations", "0"]);
  assert.equal(invalid.status, 2);
  assert.equal(parseCliJson(invalid.stderr, "invalid argument").error, "invalid_arguments");

  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: node scripts\/test_web_mutation_benchmark\.mjs/m);

  const testRoot = path.join(ROOT, ".tmp", "web-mutation-quality-gate-cli-test");
  const customOutput = path.join(testRoot, "custom-output");
  const suppressedOutput = path.join(testRoot, "suppressed-output");
  fs.rmSync(testRoot, { recursive: true, force: true });
  try {
    const custom = runCli([
      "--iterations", "1",
      "--minimum-transitions-per-second", "0",
      "--maximum-elapsed-ms", "10000",
      "--output", customOutput,
    ]);
    assert.equal(custom.status, 0, custom.stderr);
    assert.deepEqual(
      fs.readdirSync(customOutput).sort(),
      ["atlas.dot", "atlas.html", "atlas.json", "atlas.svg", "summary.json"],
    );

    const suppressed = runCli([
      "--iterations", "1",
      "--minimum-transitions-per-second", "0",
      "--maximum-elapsed-ms", "10000",
      "--output", suppressedOutput,
      "--no-artifacts",
    ]);
    assert.equal(suppressed.status, 0, suppressed.stderr);
    assert.equal(fs.existsSync(suppressedOutput), false);
    assert.equal(parseCliJson(suppressed.stdout, "artifact-suppressed run").output, null);

    const rejected = runCli([
      "--iterations", "1",
      "--minimum-transitions-per-second", "1000000000000000",
      "--no-artifacts",
    ]);
    assert.equal(rejected.status, 1);
    const rejectedResult = parseCliJson(rejected.stderr, "quality-gate failure");
    assert.equal(rejectedResult.qualityGate.ok, false);
    assert.ok(
      rejectedResult.qualityGate.failures.some((failure) => failure.code === "throughput_below_minimum"),
    );
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

let options;
try {
  options = parseBenchmarkArgs(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message: error.message }));
  process.exit(2);
}

if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const catalog = evaluateMutationCatalog();
assertProtocolContracts(catalog);
assertQualityGateContracts(catalog);
assertArgumentContracts();

const stable = {
  ok: true,
  runtime: "framework-neutral-web-mutation-benchmark",
  benchmarkVersion: catalog.benchmarkVersion,
  seed: catalog.seed,
  scope: {
    sourceOfTruth: "protocol/web-property-pack.mjs",
    externalRepositories: "read-only",
    realNetwork: "deny",
    filesystemMutation: "deny-except-generated-local-report",
    mailPaymentCloudNative: "deny",
  },
  metrics: {
    mutationCount: catalog.mutationCount,
    killedCount: catalog.killedCount,
    survivedCount: catalog.survivedCount,
    mutationScore: catalog.mutationScore,
    falsePositiveControlCount: catalog.falsePositiveControlCount,
    falsePositiveCount: catalog.falsePositiveCount,
    falsePositiveRate: catalog.falsePositiveRate,
    originalTraceActions: catalog.originalTraceActions,
    minimalTraceActions: catalog.minimalTraceActions,
  },
  qualityContract: { ...DEFAULT_MUTATION_QUALITY_CONTRACT },
  performanceContract: {
    iterations: DEFAULT_BENCHMARK_ITERATIONS,
    minimumTransitionsPerSecond: DEFAULT_MUTATION_QUALITY_CONTRACT.minimumTransitionsPerSecond,
    maximumElapsedMs: DEFAULT_MUTATION_QUALITY_CONTRACT.maximumElapsedMs,
    measuredFieldsExcludedFromSemanticHash: ["elapsedMs", "transitionsPerSecond"],
  },
  mutations: catalog.mutations,
  controls: catalog.controls,
};
stable.semanticHash = semanticHash(stable);

const performance = measureMutationThroughput({ iterations: options.iterations });
const qualityGate = evaluateMutationQualityGate({ catalog, performance, contract: options.contract });
if (options.writeArtifacts) writeArtifacts(options.output, stable, performance, qualityGate);

if (options.updateFixture || !fs.existsSync(FIXTURE)) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(stable, null, 2)}\n`);
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), stable);
}

if (process.env.PROPED_WEB_MUTATION_SKIP_CLI_TESTS !== "1") {
  assertCliContracts();
}

const result = { ...stable, performance, qualityGate, output: options.writeArtifacts ? options.output : null };
if (!qualityGate.ok) {
  console.error(JSON.stringify(result));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result));
}
