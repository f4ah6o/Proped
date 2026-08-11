#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWebProjectManifest,
  runWebProject,
} from "../protocol/web-project-runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const HELP = `Usage:
  node scripts/web_project_runner.mjs validate <manifest>
  node scripts/web_project_runner.mjs run <manifest> [--output <dir>] [--no-artifacts] [--strict-sandbox] [--writable <dir>]

Commands:
  validate    Validate a Web project manifest without executing stages
  run         Execute the ordered stage graph and aggregate its quality result

Options:
  --output <dir>    Override the manifest artifact output directory
  --no-artifacts    Do not write summary/atlas artifacts
  --strict-sandbox  Run stages in the Linux bubblewrap strict execution sandbox
  --writable <dir>  Additional repository-relative writable build directory (repeatable)
  --help            Show this help
`;

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(HELP);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help")) usage();
  const [command, manifestPath, ...rest] = argv;
  if (!["validate", "run"].includes(command)) usage(`unknown command: ${command}`);
  if (!manifestPath || manifestPath.startsWith("--")) usage(`${command} requires a manifest path`);
  const options = { command, manifestPath, output: undefined, writeArtifacts: true, strictSandbox: false, writablePaths: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === "--no-artifacts") {
      if (command !== "run") usage("--no-artifacts is only valid with run");
      options.writeArtifacts = false;
      continue;
    }
    if (option === "--strict-sandbox") {
      if (command !== "run") usage("--strict-sandbox is only valid with run");
      options.strictSandbox = true;
      continue;
    }
    if (option === "--writable") {
      if (command !== "run") usage("--writable is only valid with run");
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) usage("--writable requires a value");
      options.writablePaths.push(value);
      index += 1;
      continue;
    }
    if (option === "--output") {
      if (command !== "run") usage("--output is only valid with run");
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) usage("--output requires a value");
      options.output = value;
      index += 1;
      continue;
    }
    usage(`unknown option: ${option}`);
  }
  return options;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message: error.message }));
  process.exit(2);
}

let manifest;
try {
  manifest = loadWebProjectManifest(ROOT, options.manifestPath);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "invalid_manifest", message: error.message }));
  process.exit(2);
}

if (options.command === "validate") {
  console.log(JSON.stringify({
    ok: true,
    command: "web project validate",
    id: manifest.id,
    schemaVersion: manifest.schemaVersion,
    stageCount: manifest.stages.length,
    stageIds: manifest.stages.map((stage) => stage.id),
  }));
  process.exit(0);
}

let report;
try {
  report = runWebProject(ROOT, manifest, {
    output: options.output,
    writeArtifacts: options.writeArtifacts,
    sandbox: options.strictSandbox ? { mode: "strict", writablePaths: options.writablePaths } : null,
  });
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "execution_environment_failed", message: error.message }));
  process.exit(2);
}
const destination = report.ok ? console.log : console.error;
destination(JSON.stringify(report));
process.exitCode = report.ok ? 0 : 1;
