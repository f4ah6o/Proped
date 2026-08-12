#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import {
  compileWebProjectManifestV2,
  createWebProjectManifestV2FromInspection,
  validateWebProjectManifestV2,
} from "../protocol/web-project-manifest-v2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inspection = inspectWebProject(path.join(ROOT, "web/next-ssr-hydration"));
const generated = createWebProjectManifestV2FromInspection(inspection, { projectRoot: "web/next-ssr-hydration" });
assert.equal(generated.schemaVersion, 2);
assert.equal(generated.project.framework, "next");
assert.equal(generated.server.mode, "review-required");
assert.equal(generated.server.start, null);
assert.deepEqual(generated.server.hooks, { reset: null, readOnly: [] });
assert.equal(generated.server.mutationPolicy, "deny");
assert.equal(generated.replay.attempts, 3);
assert.equal(generated.sandbox.mode, "strict");
assert.ok(generated.properties.packs.includes("browser-safety"));
validateWebProjectManifestV2(generated);

assert.throws(() => compileWebProjectManifestV2(generated, ROOT), /review-required/);
const resolved = {
  ...generated,
  server: { ...generated.server, mode: "external", url: "http://127.0.0.1:3000", outputDir: null, start: null },
};
const compiled = compileWebProjectManifestV2(resolved, ROOT);
assert.equal(compiled.manifest.schemaVersion, 1);
assert.deepEqual(compiled.manifest.stages.map((stage) => stage.id), ["project-build", "generic-browser"]);
assert.equal(compiled.manifest.stages[1].dependsOn[0], "project-build");
assert.equal(compiled.execution.strictSandbox, true);
assert.deepEqual(compiled.execution.bootstrapInstall, inspection.commands.install.argv);
const browserArgv = compiled.manifest.stages[1].command;
const hookArgIndex = browserArgv.indexOf("--server-hooks-json");
assert.ok(hookArgIndex > 0);
assert.deepEqual(JSON.parse(browserArgv[hookArgIndex + 1]), { reset: null, readOnly: [] });
const mutationArgIndex = browserArgv.indexOf("--allow-managed-mutations");
assert.ok(mutationArgIndex > 0);
assert.equal(browserArgv[mutationArgIndex + 1], "false");
assert.throws(() => validateWebProjectManifestV2({ ...generated, server: { ...generated.server, mode: "external", mutationPolicy: "bounded-managed", url: "http://127.0.0.1:3000", outputDir: null, start: null } }), /requires command server mode/);
const boundedManaged = {
  ...generated,
  server: { ...generated.server, mode: "command", mutationPolicy: "bounded-managed", outputDir: null, url: null, start: ["node", "server.mjs"] },
};
validateWebProjectManifestV2(boundedManaged);
const boundedCommand = compileWebProjectManifestV2(boundedManaged, ROOT).manifest.stages.at(-1).command;
assert.equal(boundedCommand[boundedCommand.indexOf("--allow-managed-mutations") + 1], "true");
assert.throws(() => validateWebProjectManifestV2({ ...generated, server: { ...generated.server, hooks: { reset: null, readOnly: [{ id: "bad", method: "POST", path: "/x", expectedStatus: [200], timeoutMs: 1, maxBytes: 1 }] } } }), /GET or HEAD/);

const optional = [
  [".tmp/todomvc/examples/react", "static-output", "react-webpack"],
  [".tmp/todomvc/examples/vue", "static-output", "vue-vite"],
  [".tmp/drawdb", "static-output", "react-vite"],
];
const dogfood = [];
for (const [relative, expectedServer, expectedFramework] of optional) {
  const target = path.join(ROOT, relative);
  try {
    const report = inspectWebProject(target);
    const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: relative });
    const result = compileWebProjectManifestV2(manifest, ROOT);
    assert.equal(manifest.server.mode, expectedServer);
    assert.equal(manifest.project.framework, expectedFramework);
    assert.equal(result.manifest.stages.at(-1).id, "generic-browser");
    if (relative === ".tmp/drawdb") {
      assert.equal(manifest.state.indexedDB.adapter.kind, "dexie");
      assert.equal(manifest.state.indexedDB.adapter.declaredVersion, "^3.2.4");
      assert.equal(manifest.state.indexedDB.adapter.resolvedVersion, "3.2.7");
    }
    dogfood.push({
      target: relative, framework: manifest.project.framework, server: manifest.server.mode, packs: manifest.properties.packs,
      indexedDBAdapter: manifest.state.indexedDB.adapter?.kind ?? null,
    });
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
}

assert.throws(() => validateWebProjectManifestV2({ ...generated, unexpected: true }), /unknown field unexpected/);

const canopyRoot = path.join(ROOT, ".tmp/external-canopy/apps/web");
let optionalCanopy = null;
if (fs.existsSync(path.join(canopyRoot, "package.json"))) {
  const inspection = inspectWebProject(canopyRoot);
  const manifest = createWebProjectManifestV2FromInspection(inspection, { projectRoot: "." });
  const compiled = compileWebProjectManifestV2(manifest, canopyRoot);
  assert.equal(manifest.project.framework, "waku");
  assert.equal(manifest.server.mode, "command");
  assert.deepEqual(manifest.server.start, ["npm", "run", "preview"]);
  assert.ok(manifest.properties.packs.includes("navigation"));
  assert.ok(manifest.properties.packs.includes("reload-persistence"));
  assert.equal(compiled.manifest.stages.find((stage) => stage.id === "generic-browser")?.command.includes("--start-json"), true);
  optionalCanopy = { framework: manifest.project.framework, server: manifest.server.mode, start: manifest.server.start, packs: manifest.properties.packs };
}

console.log(JSON.stringify({
  ok: true,
  runtime: "web-project-manifest-v2-test",
  generatedFramework: generated.project.framework,
  compiledStages: compiled.manifest.stages.map((stage) => stage.id),
  optionalRealTargets: dogfood,
}));
