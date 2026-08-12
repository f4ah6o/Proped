#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

function fixture(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "proped-web-inspect-"));
  for (const [relative, content] of Object.entries(structure)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

{
  const root = fixture({
    "package.json": json({
      name: "react-vite-app",
      packageManager: "pnpm@10.0.0",
      scripts: { build: "vite build", preview: "vite preview" },
      dependencies: { react: "19.0.0", vite: "8.0.0", "react-router-dom": "7.0.0" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "src/app.tsx": "localStorage.setItem('x','1'); new WebSocket('ws://example.invalid')",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.name, "pnpm");
  assert.equal(report.framework.name, "react-vite");
  assert.equal(report.project.mode, "spa");
  assert.equal(report.project.outputDir, "dist");
  assert.equal(report.runtime.routing.model, "react-router");
  assert.ok(report.runtime.stateSources.includes("localStorage"));
  assert.equal(report.runtime.websocket.detected, true);
  assert.equal(report.safety.packageScriptsExecuted, false);
}

{
  const root = fixture({
    "package.json": json({
      name: "docusaurus-site",
      packageManager: "pnpm@9.15.0",
      scripts: { build: "docusaurus build", serve: "docusaurus serve" },
      dependencies: { "@docusaurus/core": "3.8.1", react: "18.3.1", "react-dom": "18.3.1" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "docusaurus");
  assert.equal(report.project.mode, "static-export");
  assert.equal(report.project.outputDir, "build");
  assert.equal(report.commands.serve.source, "scripts.serve");
  assert.equal(report.runtime.routing.model, "docusaurus-client-router");
}

{
  const root = fixture({
    "package.json": json({
      name: "next-static-app",
      scripts: { build: "next build", start: "next start" },
      dependencies: { next: "16.0.0", react: "19.0.0", "react-dom": "19.0.0" },
    }),
    "package-lock.json": "{}\n",
    "next.config.mjs": "export default { output: 'export' };\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "next");
  assert.equal(report.project.mode, "static-export");
  assert.equal(report.project.outputDir, "out");
  assert.equal(report.runtime.routing.model, "next-file-system");
}

{
  const root = fixture({
    "package.json": json({
      name: "nuxt-spa",
      scripts: { build: "nuxi build", dev: "nuxi dev" },
      dependencies: { nuxt: "4.0.0", vue: "3.5.0", dexie: "4.0.0" },
    }),
    "package-lock.json": "{}\n",
    "nuxt.config.ts": "export default defineNuxtConfig({ ssr: false });\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "nuxt");
  assert.equal(report.project.mode, "spa");
  assert.equal(report.runtime.indexedDB.dexie, true);
}

{
  const root = fixture({
    "package.json": json({
      name: "mismatch",
      packageManager: "pnpm@10.0.0",
      dependencies: { vue: "3.5.0" },
    }),
    "package-lock.json": "{}\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.name, "pnpm");
  assert.ok(report.ambiguities.some((item) => item.code === "package-manager-declaration-lockfile-mismatch"));
}

const committed = [
  ["web/next-ssr-hydration", "next"],
  ["web/nuxt-ssr-hydration", "nuxt"],
  ["web/react-component", "react"],
  ["web/vue-component", "vue"],
];
for (const [relative, family] of committed) {
  const report = inspectWebProject(path.join(ROOT, relative));
  assert.ok(report.framework.name === family || report.framework.name.startsWith(`${family}-`), `${relative}: ${report.framework.name}`);
}

const optionalDogfood = [
  [".tmp/todomvc/examples/react", "react-webpack"],
  [".tmp/todomvc/examples/vue", "vue-vite"],
  [".tmp/drawdb", "react-vite"],
];
const real = [];
for (const [relative, expected] of optionalDogfood) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(path.join(absolute, "package.json"))) continue;
  const report = inspectWebProject(absolute);
  assert.equal(report.framework.name, expected, `${relative}: ${report.framework.name}`);
  if (relative === ".tmp/drawdb") {
    assert.equal(report.runtime.indexedDB.dexie, true);
    assert.equal(report.runtime.indexedDB.dexieDeclaredVersion, "^3.2.4");
    assert.equal(report.runtime.indexedDB.dexieResolvedVersion, "3.2.7");
  }
  real.push({
    target: relative,
    framework: report.framework.name,
    stateSources: report.runtime.stateSources,
    dexie: report.runtime.indexedDB.dexie,
    dexieDeclaredVersion: report.runtime.indexedDB.dexieDeclaredVersion,
    dexieResolvedVersion: report.runtime.indexedDB.dexieResolvedVersion,
  });
}

console.log(JSON.stringify({
  ok: true,
  runtime: "web-project-inspect-test",
  committedTargets: committed.length,
  optionalRealTargets: real,
}));
