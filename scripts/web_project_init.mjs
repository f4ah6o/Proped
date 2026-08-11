#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { createWebProjectManifestV2FromInspection } from "../protocol/web-project-manifest-v2.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_init.mjs <project> [--id <id>] [--output <file>]\n\nDefault is read-only: the generated v2 manifest is printed to stdout. --output explicitly writes it.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let project = null;
let id = null;
let output = null;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--id" || arg === "--output") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage(`${arg} requires a value`);
    if (arg === "--id") id = value;
    else output = value;
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (project) usage("web init accepts exactly one project path");
  else project = arg;
}
if (!project) usage("web init requires a project path");
try {
  const inspection = inspectWebProject(project);
  const manifest = createWebProjectManifestV2FromInspection(inspection, { projectRoot: ".", id });
  const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
  if (output) {
    const file = path.resolve(output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rendered);
  }
  process.stdout.write(rendered);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_init_failed", message: error.message }));
  process.exitCode = 2;
}
