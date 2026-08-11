#!/usr/bin/env node
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";

const HELP = `Usage:
  node scripts/web_project_inspect.mjs <project> [--json]

Read-only discovery for an unknown Web project. No install/build/start script is executed.

Options:
  --json    Print the machine-readable inspection report
  --help    Show this help
`;

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(HELP);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) usage();
  let target = null;
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) usage(`unknown option: ${arg}`);
    else if (target) usage("web inspect accepts exactly one project path");
    else target = arg;
  }
  if (!target) usage("web inspect requires a project path");
  return { target, json };
}

function printHuman(report) {
  console.log(`Web project: ${report.target.packageName ?? report.target.root}`);
  console.log(`  framework:       ${report.framework.name} (${report.confidence.framework.toFixed(2)})`);
  console.log(`  package manager: ${report.packageManager.name ?? "unknown"} (${report.confidence.packageManager.toFixed(2)})`);
  console.log(`  mode:            ${report.project.mode} (${report.confidence.serveMode.toFixed(2)})`);
  console.log(`  output:          ${report.project.outputDir ?? "unknown"}`);
  console.log(`  state sources:   ${report.runtime.stateSources.join(", ")}`);
  console.log(`  routing:         ${report.runtime.routing.model}`);
  if (report.runtime.indexedDB.detected) console.log(`  indexedDB:       yes${report.runtime.indexedDB.dexie ? " (Dexie)" : ""}`);
  if (report.runtime.websocket.detected) console.log("  websocket:       detected");
  if (report.runtime.auth.detected) console.log(`  auth deps:       ${report.runtime.auth.dependencies.join(", ")}`);
  if (report.ambiguities.length) {
    console.log("  ambiguities:");
    for (const ambiguity of report.ambiguities) console.log(`    - ${ambiguity.code}: ${ambiguity.message}`);
  }
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
  const report = inspectWebProject(args.target);
  if (args.json) console.log(JSON.stringify(report));
  else printHuman(report);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "inspection_failed", message: error.message }));
  process.exitCode = 2;
}
