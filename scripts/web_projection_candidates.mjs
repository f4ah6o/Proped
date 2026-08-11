#!/usr/bin/env node
import { analyzeWebSemanticProjections } from "../protocol/web-semantic-projection-candidates.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/web_projection_candidates.mjs <project-root> [--json]");
  process.exit(0);
}
const root = args.find((arg) => !arg.startsWith("--")) ?? ".";
try {
  const report = analyzeWebSemanticProjections(root);
  console.log(JSON.stringify(report, null, args.includes("--json") ? 0 : 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "semantic_projection_analysis_failed", message: error.message }));
  process.exit(2);
}
