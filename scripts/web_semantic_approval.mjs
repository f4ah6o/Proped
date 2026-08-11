#!/usr/bin/env node
import fs from "node:fs";
import {
  compileWebSemanticApprovals,
  createWebSemanticApprovalPlan,
  decideWebSemanticCandidate,
} from "../protocol/web-semantic-approval.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log(`Usage:
  node scripts/web_semantic_approval.mjs init <review.json> [--output plan.json]
  node scripts/web_semantic_approval.mjs decide <review.json> <plan.json> <candidate-ref> <approve|reject|defer> [--ack-risk] [--note text] [--output plan.json]
  node scripts/web_semantic_approval.mjs compile <review.json> <plan.json> [--output hints.json]`);
  process.exit(message ? 2 : 0);
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeResult(value, output) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (output) fs.writeFileSync(output, text);
  else process.stdout.write(text);
}
function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage();
const command = args[0];
const output = option(args, "--output");
try {
  if (command === "init") {
    if (!args[1]) usage("init requires review.json");
    writeResult(createWebSemanticApprovalPlan(readJson(args[1])), output);
  } else if (command === "decide") {
    if (!args[1] || !args[2] || !args[3] || !args[4]) usage("decide requires review.json plan.json candidate-ref decision");
    const note = option(args, "--note");
    const next = decideWebSemanticCandidate(readJson(args[1]), readJson(args[2]), {
      ref: args[3], decision: args[4], riskAcknowledged: args.includes("--ack-risk"), note,
    });
    writeResult(next, output);
  } else if (command === "compile") {
    if (!args[1] || !args[2]) usage("compile requires review.json plan.json");
    writeResult(compileWebSemanticApprovals(readJson(args[1]), readJson(args[2])), output);
  } else usage(`unknown command: ${command}`);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "semantic_approval_failed", message: error.message }));
  process.exit(2);
}
