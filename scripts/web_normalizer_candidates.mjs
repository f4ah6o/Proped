#!/usr/bin/env node
import fs from "node:fs";
import { analyzeWebNormalizerCandidates } from "../protocol/web-normalizer-candidates.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/web_normalizer_candidates.mjs <project-root> --volatility <report.json> [--json]");
  process.exit(0);
}
const root = args.find((arg) => !arg.startsWith("--")) ?? ".";
const volatilityIndex = args.indexOf("--volatility");
if (volatilityIndex < 0 || !args[volatilityIndex + 1]) {
  console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message: "--volatility <report.json> is required" }));
  process.exit(2);
}
try {
  const volatility = JSON.parse(fs.readFileSync(args[volatilityIndex + 1], "utf8"));
  const report = analyzeWebNormalizerCandidates(root, volatility);
  console.log(JSON.stringify(report, null, args.includes("--json") ? 0 : 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "normalizer_candidate_analysis_failed", message: error.message }));
  process.exit(2);
}
