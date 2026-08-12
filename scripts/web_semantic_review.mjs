#!/usr/bin/env node
import fs from "node:fs";
import { analyzeWebSemanticProperties } from "../protocol/web-semantic-property-candidates.mjs";
import { analyzeWebSemanticProjections } from "../protocol/web-semantic-projection-candidates.mjs";
import { analyzeWebNormalizerCandidates } from "../protocol/web-normalizer-candidates.mjs";
import { analyzeWebServerHookCandidates } from "../protocol/web-server-hook-candidates.mjs";
import { buildWebSemanticReviewReport, formatWebSemanticReview } from "../protocol/web-semantic-review-report.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/web_semantic_review.mjs <project-root> [--volatility report.json] [--json]");
  process.exit(0);
}
const root = args.find((arg) => !arg.startsWith("--")) ?? ".";
const volatilityIndex = args.indexOf("--volatility");
try {
  const properties = analyzeWebSemanticProperties(root);
  const projections = analyzeWebSemanticProjections(root);
  let normalizers = null;
  const serverHooks = analyzeWebServerHookCandidates(root);
  if (volatilityIndex >= 0) {
    if (!args[volatilityIndex + 1]) throw new Error("--volatility requires a report file");
    const volatility = JSON.parse(fs.readFileSync(args[volatilityIndex + 1], "utf8"));
    normalizers = analyzeWebNormalizerCandidates(root, volatility);
  }
  const report = buildWebSemanticReviewReport({ properties, projections, normalizers, serverHooks });
  if (args.includes("--json")) console.log(JSON.stringify(report));
  else process.stdout.write(formatWebSemanticReview(report));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "semantic_review_failed", message: error.message }));
  process.exit(2);
}
