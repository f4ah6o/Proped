#!/usr/bin/env node
import fs from "node:fs";
import { benchmarkSelectorSurvival, selectorContractFromInventory } from "../protocol/web-selector-survival.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node scripts/web_selector_survival.mjs <baseline-inventory.json> <candidate-inventory.json> [candidate...]");
  process.exit(message ? 2 : 0);
}
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) usage();
if (argv.length < 2) usage("selector survival requires baseline and at least one candidate inventory");
try {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const baseline = selectorContractFromInventory(read(argv[0]));
  const candidates = argv.slice(1).map((file) => ({ id: file, contract: selectorContractFromInventory(read(file)) }));
  console.log(JSON.stringify(benchmarkSelectorSurvival(baseline, candidates)));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: "selector_survival_failed", message: error.message }));
  process.exitCode = 2;
}
