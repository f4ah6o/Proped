#!/usr/bin/env node
import path from "node:path";
import { loadWebProjectManifestV2 } from "../protocol/web-project-manifest-v2.mjs";
import { prepareWebProject } from "../protocol/web-project-bootstrap.mjs";
import { evaluateNodeEngine } from "../protocol/web-node-engine.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_project_prepare.mjs <proped.web.json> [--repository-root <dir>] [--offline]\n\nThis is an explicit mutating setup phase. It runs the inferred install argv with shell=false and a credential-filtered environment. Network may be used unless --offline is supplied.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
let manifestFile = null;
let repositoryRoot = null;
let offline = false;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--offline") offline = true;
  else if (arg === "--repository-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--repository-root requires a value");
    repositoryRoot = path.resolve(value);
  } else if (arg.startsWith("--")) usage(`unknown option: ${arg}`);
  else if (manifestFile) usage("web prepare accepts exactly one manifest file");
  else manifestFile = path.resolve(arg);
}
if (!manifestFile) usage("web prepare requires a manifest file");

try {
  const root = repositoryRoot ?? path.dirname(manifestFile);
  const manifest = loadWebProjectManifestV2(manifestFile);
  const engine = evaluateNodeEngine(manifest.project.nodeRequirement ?? null, process.version);
  if (engine.status === "incompatible") {
    console.error(JSON.stringify({ ok: false, error: "node_engine_incompatible", message: `Node ${process.version} does not satisfy ${manifest.project.nodeRequirement}`, engine }));
    process.exit(2);
  }
  const result = prepareWebProject(root, manifest, { offline });
  (result.ok ? console.log : console.error)(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "web_prepare_failed", message: error.message }));
  process.exitCode = 2;
}
