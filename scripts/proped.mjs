#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMANDS = Object.freeze({
  inspect: "web_project_inspect.mjs",
  init: "web_project_init.mjs",
  doctor: "web_project_doctor.mjs",
  prepare: "web_project_prepare.mjs",
  compile: "web_project_compile.mjs",
  review: "web_semantic_review.mjs",
  approve: "web_semantic_approval.mjs",
  apply: "web_semantic_apply.mjs",
  run: "web_project_run_v2.mjs",
  campaign: "web_project_campaign.mjs",
  benchmark: "web_project_benchmark.mjs",
});

function help() {
  return `Proped Web CLI\n\nUsage:\n  proped web <command> [arguments]\n  node scripts/proped.mjs web <command> [arguments]\n\nCommands:\n  web inspect <project>                         Read-only project classification\n  web init <project>                            Generate manifest v2 (stdout by default)\n  web doctor <manifest>                         Validate onboarding/runtime prerequisites\n  web prepare <manifest>                        Explicitly install inferred project dependencies\n  web compile <manifest>                        Compile manifest v2 to the v1 stage graph\n  web review <project>                          Propose review-only semantic candidates\n  web approve <init|decide|compile> ...         Record explicit human semantic decisions\n  web apply <manifest> <semantic-hints>         Attach approved semantics to manifest v2\n  web run <manifest>                            Run the managed Web quality campaign\n  web campaign <project>                        Blind onboard, prepare, explore, replay, and summarize\n  web benchmark <project...>                    Compare auto-onboarding across multiple projects\n  web benchmark --corpus production             Run the versioned production onboarding quality gate\n\nThe dispatcher does not use a shell and preserves child exit codes.\n`;
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(help());
  process.exit(0);
}
if (args[0] !== "web") fail(`unknown top-level command: ${args[0]}`);
const command = args[1];
if (!command) fail("web command is required");
const script = COMMANDS[command];
if (!script) fail(`unknown web command: ${command}`);
const child = spawnSync(process.execPath, [path.join(ROOT, "scripts", script), ...args.slice(2)], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: false,
  stdio: ["inherit", "pipe", "pipe"],
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.error) {
  console.error(JSON.stringify({ ok: false, error: "dispatcher_failed", message: child.error.message }));
  process.exit(2);
}
process.exit(child.status ?? 2);
