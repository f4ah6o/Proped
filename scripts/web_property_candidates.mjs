#!/usr/bin/env node
import { analyzeWebSemanticProperties } from "../protocol/web-semantic-property-candidates.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/web_property_candidates.mjs <project-root> [--json]");
  process.exit(0);
}
const root = args.find((arg) => !arg.startsWith("--")) ?? ".";
try {
  const report = analyzeWebSemanticProperties(root);
  console.log(JSON.stringify(report, null, args.includes("--json") ? 0 : 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "semantic_property_analysis_failed", message: error.message }));
  process.exit(2);
}
