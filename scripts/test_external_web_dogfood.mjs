#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDogfoodCampaign } from "../protocol/external-web-dogfood.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTPUT = path.join(ROOT, "protocol/out/external-web-dogfood");
const FIXTURE = path.join(ROOT, "protocol/fixtures/external-web-dogfood-result.json");
const UPDATE_FIXTURE = process.argv.includes("--update-fixture");

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function writeArtifacts(result) {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);

  const atlas = {
    schemaVersion: 2,
    strategy: "external-web-dogfood",
    targetCount: result.targetCount,
    failureCount: result.failureCount,
    zeroFailureCount: result.zeroFailureCount,
    upstreamWritesPerformed: result.upstreamWritesPerformed,
    targets: result.targets.map((target) => ({
      id: target.id,
      framework: target.framework,
      revision: target.revision,
      sourceSha256: target.source.sha256,
      states: target.exploration.states,
      transitions: target.exploration.transitions,
      failures: target.failures,
      replaySignature: target.replay.signature,
      diagnostics: target.diagnostics,
      semanticHash: target.semanticHash,
    })),
    semanticHash: result.semanticHash,
  };
  fs.writeFileSync(path.join(OUTPUT, "atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);

  const dotLines = ["digraph external_web_dogfood {", "  rankdir=LR;"];
  for (const target of result.targets) {
    const label = `${target.framework}\\n${target.exploration.states} states / ${target.exploration.transitions} transitions\\nzero failure`;
    dotLines.push(`  "${target.id}" [label="${label}"];`);
  }
  dotLines.push("}");
  fs.writeFileSync(path.join(OUTPUT, "atlas.dot"), `${dotLines.join("\n")}\n`);

  const rows = result.targets.map((target, index) => {
    const y = 60 + index * 38;
    return `<text x="24" y="${y}">${target.framework}: ${target.exploration.states} states / ${target.exploration.transitions} transitions / ${target.failures.length} failures</text>`;
  }).join("");
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="230"><rect width="100%" height="100%" fill="white"/><text x="24" y="28">External Web dogfood campaign</text>${rows}</svg>\n`,
  );
  fs.writeFileSync(
    path.join(OUTPUT, "atlas.html"),
    `<!doctype html><html><meta charset="utf-8"><title>External Web dogfood</title><body><h1>External Web dogfood</h1><p>${result.targetCount} targets, ${result.failureCount} failures, ${result.upstreamWritesPerformed} upstream writes</p><pre>${escapeHtml(JSON.stringify(atlas, null, 2))}</pre></body></html>\n`,
  );
}

const first = runDogfoodCampaign(ROOT);
const second = runDogfoodCampaign(ROOT);
assert.deepEqual(second, first);
assert.equal(first.ok, true);
assert.equal(first.targetCount, 4);
assert.equal(first.zeroFailureCount, 4);
assert.equal(first.failureCount, 0);
assert.equal(first.upstreamWritesPerformed, 0);
assert.deepEqual(first.targets.map((target) => target.framework).sort(), ["next", "nuxt", "react", "vue"]);

for (const target of first.targets) {
  assert.equal(target.source.verified, true, target.id);
  assert.equal(target.upstreamWritePolicy, "read-only", target.id);
  assert.equal(target.failures.length, 0, target.id);
  assert.equal(target.replay.deterministic, true, target.id);
  assert.match(target.replay.signature, /^[0-9a-f]{64}$/, target.id);
  assert.equal(target.properties.every((property) => property.status === "pass"), true, target.id);
  assert.equal(target.diagnostics.every((diagnostic) => diagnostic.code === "unsupported_effect"), true, target.id);
  assert.equal(target.diagnostics.every((diagnostic) => diagnostic.policy === "descriptor-only"), true, target.id);
  assert.ok(target.zeroFailureReason, target.id);
}

const byFramework = Object.fromEntries(first.targets.map((target) => [target.framework, target]));
for (const framework of ["react", "vue"]) {
  assert.equal(byFramework[framework].exploration.states, 5);
  assert.equal(byFramework[framework].exploration.transitions, 4);
  assert.equal(byFramework[framework].replay.trace.length, 3);
  assert.equal(byFramework[framework].exploration.frontierExhausted, true);
}
for (const framework of ["next", "nuxt"]) {
  assert.equal(byFramework[framework].exploration.states, 1);
  assert.equal(byFramework[framework].exploration.transitions, 0);
  assert.deepEqual(byFramework[framework].replay.trace, []);
  assert.equal(byFramework[framework].exploration.frontierExhausted, true);
}

writeArtifacts(first);
if (UPDATE_FIXTURE || !fs.existsSync(FIXTURE)) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(first, null, 2)}\n`);
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(FIXTURE, "utf8")), first);
}
console.log(JSON.stringify(first));
