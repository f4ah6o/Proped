#!/usr/bin/env node
import { resolveWebProjectCorpus } from "../protocol/web-project-corpus.mjs";
import {
  materializeWebProjectCorpus,
  verifyMaterializedWebProjectCorpus,
} from "../protocol/web-project-corpus-materialize.mjs";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage:\n  node scripts/web_project_corpus.mjs materialize <external|file> --checkout-root <dir> [--no-fetch]\n  node scripts/web_project_corpus.mjs verify <external|file> --checkout-root <dir>\n\nMaterialization is an explicit Git-only source acquisition phase. It never executes target project code or pushes/writes upstream. Benchmarking remains a separate command.");
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
const command = argv.shift();
if (!new Set(["materialize", "verify"]).has(command)) usage(`unknown corpus command: ${command}`);
const corpusArg = argv.shift();
if (!corpusArg || corpusArg.startsWith("--")) usage("corpus name or file is required");
let checkoutRoot = null;
let fetch = true;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--no-fetch") fetch = false;
  else if (arg === "--checkout-root") {
    const value = argv[++index];
    if (!value || value.startsWith("--")) usage("--checkout-root requires a value");
    checkoutRoot = value;
  } else usage(`unknown option: ${arg}`);
}
if (!checkoutRoot) usage("--checkout-root is required");
if (command === "verify" && fetch === false) usage("--no-fetch is only valid for materialize");

try {
  const corpus = resolveWebProjectCorpus(corpusArg);
  const result = command === "materialize"
    ? materializeWebProjectCorpus(corpus, { checkoutRoot, fetch })
    : verifyMaterializedWebProjectCorpus(corpus, { checkoutRoot });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.code ?? "web_corpus_failed",
    message: error.message,
  }));
  process.exitCode = 2;
}
