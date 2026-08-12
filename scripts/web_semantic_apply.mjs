#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadWebProjectManifestV2, withApprovedWebSemantics } from "../protocol/web-project-manifest-v2.mjs";
import { validateApprovedSemanticHints } from "../protocol/web-approved-semantics-runtime.mjs";

function usage(message) {
  const text = "Usage: node scripts/web_semantic_apply.mjs <manifest-v2.json> <semantic-hints.json> [--output <file>]";
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(text);
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) usage();
if (argv.length < 2) usage("manifest and semantic hints files are required");
const manifestFile = path.resolve(argv[0]);
const hintsFile = path.resolve(argv[1]);
let output = null;
for (let index = 2; index < argv.length; index += 1) {
  const key = argv[index];
  if (key !== "--output") usage(`unknown option: ${key}`);
  const value = argv[++index];
  if (!value) usage("--output requires a file");
  output = path.resolve(value);
}
try {
  const manifest = loadWebProjectManifestV2(manifestFile);
  const hints = validateApprovedSemanticHints(JSON.parse(fs.readFileSync(hintsFile, "utf8")));
  const applied = withApprovedWebSemantics(manifest, hints);
  const text = `${JSON.stringify(applied, null, 2)}\n`;
  if (output) fs.writeFileSync(output, text);
  else process.stdout.write(text);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "semantic_apply_failed", message: error.message }));
  process.exitCode = 1;
}
