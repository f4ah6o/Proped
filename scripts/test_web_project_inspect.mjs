#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectWebProject } from "../protocol/web-project-inspect.mjs";
import { compileWebProjectManifestV2, createWebProjectManifestV2FromInspection } from "../protocol/web-project-manifest-v2.mjs";

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
      dependencies: { react: "19.0.0", vite: "8.0.0", "react-router-dom": "7.0.0", hono: "4.0.0", "drizzle-orm": "0.44.0" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "src/app.tsx": "localStorage.setItem('x','1'); new WebSocket('ws://example.invalid'); fetch('/api/items')",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.name, "pnpm");
  assert.equal(report.packageManager.reference, "pnpm@10.0.0");
  assert.equal(report.packageManager.version, "10.0.0");
  assert.equal(report.packageManager.corepack, true);
  assert.deepEqual(report.commands.install.argv, ["corepack", "pnpm", "install", "--frozen-lockfile"]);
  assert.deepEqual(report.commands.build.argv, ["corepack", "pnpm", "run", "build"]);
  assert.equal(report.framework.name, "react-vite");
  assert.equal(report.project.mode, "spa");
  assert.equal(report.project.outputDir, "dist");
  assert.equal(report.runtime.routing.model, "react-router");
  assert.ok(report.runtime.stateSources.includes("localStorage"));
  assert.equal(report.runtime.websocket.detected, true);
  assert.equal(report.runtime.server.detected, true);
  assert.deepEqual(report.runtime.server.frameworks, ["hono"]);
  assert.deepEqual(report.runtime.server.persistenceDependencies, ["drizzle-orm"]);
  assert.equal(report.runtime.server.relativeApiCalls, 1);
  assert.equal(report.safety.packageScriptsExecuted, false);
}

{
  const root = fixture({
    "package.json": json({
      name: "pnpm-integrity",
      packageManager: "pnpm@9.15.0+sha512-deadbeef",
      scripts: { build: "vite build" },
      dependencies: { vite: "6.0.0" },
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.reference, "pnpm@9.15.0+sha512-deadbeef");
  assert.equal(report.packageManager.version, "9.15.0");
  assert.equal(report.packageManager.corepack, true);
  assert.deepEqual(report.commands.build.argv, ["corepack", "pnpm", "run", "build"]);
}

{
  const root = fixture({
    "package.json": json({
      name: "yarn-classic",
      packageManager: "yarn@1.22.22",
    }),
    "yarn.lock": "# yarn lockfile v1\n",
  });
  const report = inspectWebProject(root);
  assert.deepEqual(report.commands.install.argv, ["corepack", "yarn", "install", "--frozen-lockfile"]);
}

{
  const root = fixture({
    "package.json": json({ name: "pnpm-unpinned", packageManager: "pnpm@latest" }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.corepack, false);
  assert.ok(report.ambiguities.some((item) => item.code === "package-manager-version-unpinned" && item.severity === "error"));
  const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: ".", id: "pnpm-unpinned" });
  assert.throws(() => compileWebProjectManifestV2(manifest, root), /critical inference ambiguity requires review/);
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
      name: "next-server-no-start-script",
      dependencies: { next: "16.0.0", react: "19.0.0", "react-dom": "19.0.0" },
    }),
    "package-lock.json": "{}\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "next");
  assert.equal(report.project.mode, "server-rendered");
  assert.deepEqual(report.commands.serve.argv, ["npm", "exec", "--offline", "--", "next", "start"]);
  assert.equal(report.commands.serve.source, "framework.next-start");
}

{
  const root = fixture({
    "package.json": json({
      name: "nuxt-server-no-preview-script",
      dependencies: { nuxt: "4.5.2", vue: "3.5.0" },
    }),
    "package-lock.json": "{}\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "nuxt");
  assert.equal(report.project.mode, "server-rendered");
  assert.deepEqual(report.commands.serve.argv, ["npm", "exec", "--offline", "--", "nuxi", "preview"]);
  assert.equal(report.commands.serve.source, "framework.nuxt-preview");
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
    "package.json": json({ name: "nvmrc-only" }),
    ".nvmrc": "v22.22.3\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, "22.22.3");
  assert.equal(report.nodePreferredVersion, "22.22.3");
  assert.equal(report.nodeRequirementResolution.status, "resolved");
  assert.deepEqual(report.nodeRequirementResolution.sources, [{ source: ".nvmrc", kind: "pin", requirement: "22.22.3", raw: "v22.22.3" }]);
}

{
  const root = fixture({
    "package.json": json({ name: "nvmrc-major" }),
    ".nvmrc": "22\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, ">=22.0.0 <23.0.0");
  assert.equal(report.nodeRequirementResolution.status, "resolved");
  assert.equal(report.nodeRequirementResolution.sources[0].kind, "range");
}

{
  const root = fixture({
    "package.json": json({ name: "range-and-major-selector", engines: { node: "^22.15.0" } }),
    ".nvmrc": "22\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, "^22.15.0 >=22.0.0 <23.0.0");
  assert.equal(report.nodeRequirementResolution.status, "resolved");
}

{
  const root = fixture({
    "package.json": json({ name: "unparseable-selector" }),
    ".nvmrc": "lts/*\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, null);
  assert.equal(report.nodeRequirementResolution.status, "ambiguous");
  assert.ok(report.ambiguities.some((item) => item.code === "node-requirement-source-unsupported" && item.severity === "error"));
  const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: ".", id: "unsupported-node-selector" });
  assert.throws(() => compileWebProjectManifestV2(manifest, root), /critical inference ambiguity requires review/);
}

{
  const root = fixture({
    "package.json": json({ name: "volta-only", volta: { node: "20.20.0" } }),
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, "20.20.0");
  assert.equal(report.nodeRequirementResolution.sources[0].source, "package.json#volta.node");
}

{
  const root = fixture({
    "package.json": json({ name: "range-and-pin", engines: { node: "^22.15.0" } }),
    ".node-version": "22.22.3\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, "^22.15.0");
  assert.equal(report.nodePreferredVersion, "22.22.3");
  assert.equal(report.nodeRequirementResolution.preferredVersion, "22.22.3");
  assert.equal(report.nodeRequirementResolution.status, "resolved");
  assert.equal(report.ambiguities.some((item) => item.code === "node-requirement-source-conflict"), false);
}

{
  const root = fixture({
    "package.json": json({ name: "conflicting-pins", engines: { node: "^22.15.0" }, volta: { node: "22.22.3" } }),
    ".nvmrc": "20.20.0\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.nodeRequirement, null);
  assert.equal(report.nodeRequirementResolution.status, "ambiguous");
  assert.ok(report.ambiguities.some((item) => item.code === "node-requirement-source-conflict" && item.severity === "error"));
  const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: ".", id: "conflicting-node-sources" });
  assert.throws(() => compileWebProjectManifestV2(manifest, root), /critical inference ambiguity requires review/);
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


{
  const root = fixture({
    "package.json": json({
      name: "waku-fullstack",
      engines: { node: "^24.0.0 || ^22.15.0" },
      scripts: { build: "waku build", preview: "waku preview", dev: "waku dev" },
      dependencies: { react: "19.0.0", vite: "8.0.0", waku: "1.0.0-beta.8", hono: "4.0.0" },
    }),
    "package-lock.json": "{}\n",
    "src/app.tsx": "fetch('/api/status')",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "waku");
  assert.equal(report.project.mode, "server-rendered");
  assert.equal(report.project.outputDir, "dist");
  assert.equal(report.commands.serve.source, "scripts.preview");
  assert.equal(report.runtime.routing.model, "waku-router");
  assert.equal(report.runtime.server.detected, true);
  assert.deepEqual(report.runtime.server.frameworks, ["hono"]);
}


{
  const root = fixture({
    "index.html": "<!doctype html><script>fetch('/api/items')</script>",
    "server.py": `
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
PORT = int(os.environ.get("PORT", "4174"))
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
class Handler(BaseHTTPRequestHandler):
    def do_GET(self): pass
    def do_POST(self): pass
    def do_PUT(self): pass
    def do_DELETE(self): pass
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
`,
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "python-http-server");
  assert.equal(report.project.mode, "server-rendered");
  assert.deepEqual(report.commands.serve.argv, ["python3", "server.py"]);
  assert.equal(report.runtime.server.detected, true);
  assert.ok(report.runtime.server.frameworks.includes("python-http.server"));
  assert.ok(report.runtime.server.persistenceDependencies.includes("python-sqlite3"));
  assert.equal(report.runtime.auth.detected, true);
  assert.equal(report.runtime.server.relativeApiCalls, 1);
  assert.ok(report.runtime.environment.variables.some((item) => item.name === "SESSION_SECRET" && item.exposure === "sensitive-candidate"));
  const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: ".", id: "python-stateful" });
  assert.equal(manifest.server.mode, "command");
  assert.equal(manifest.server.mutationPolicy, "deny");
}

{
  const root = fixture({
    "calculator.html": "<!doctype html><main><button>Calculate</button></main>\n",
    "calculator.js": "document.querySelector('button')?.addEventListener('click', () => {});\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "static");
  assert.equal(report.project.mode, "static");
  assert.equal(report.project.outputDir, ".");
  assert.ok(report.evidence.includes("framework:root:single-html=calculator.html"));
}

{
  const root = fixture({
    "one.html": "<!doctype html><main>One</main>\n",
    "two.html": "<!doctype html><main>Two</main>\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "unknown");
  const manifest = createWebProjectManifestV2FromInspection(report, { projectRoot: ".", id: "ambiguous-static-html" });
  assert.equal(manifest.server.mode, "review-required");
}


{
  const root = fixture({
    "package.json": json({
      name: "sveltekit-app",
      packageManager: "pnpm@10.20.0",
      scripts: { build: "vite build", preview: "vite preview" },
      dependencies: {
        "@sveltejs/kit": "2.52.2",
        "@sveltejs/adapter-node": "5.0.0",
        svelte: "5.55.7",
        vite: "7.3.2",
      },
    }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "src/routes/+page.svelte": "<button>Save</button>\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "sveltekit");
  assert.equal(report.project.mode, "server-rendered");
  assert.equal(report.project.outputDir, ".svelte-kit");
  assert.equal(report.runtime.routing.model, "sveltekit-file-system");
  assert.equal(report.commands.serve.source, "scripts.preview");
}

{
  const root = fixture({
    "package.json": json({
      name: "astro-site",
      scripts: { build: "astro build", preview: "astro preview" },
      dependencies: { astro: "5.5.2" },
    }),
    "package-lock.json": "{}\n",
    "src/pages/index.astro": "<main>Astro</main>\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "astro");
  assert.equal(report.project.mode, "static-export");
  assert.equal(report.project.outputDir, "dist");
  assert.equal(report.runtime.routing.model, "astro-file-system");
  assert.equal(report.commands.serve.source, "scripts.preview");
}

{
  const root = fixture({
    "package.json": json({
      name: "remix-custom-server",
      scripts: { build: "vite build && vite build --ssr", start: "vite-node server.ts" },
      dependencies: {
        "@remix-run/express": "2.4.0",
        "@remix-run/node": "2.4.0",
        "@remix-run/react": "2.4.0",
        express: "4.18.2",
        react: "18.2.0",
        "vite-node": "1.1.0",
      },
    }),
    "package-lock.json": "{}\n",
    "server.ts": "import express from 'express'; const app = express(); app.get('/health', () => {});\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "remix");
  assert.equal(report.project.mode, "server-rendered");
  assert.equal(report.project.outputDir, "build");
  assert.equal(report.runtime.routing.model, "remix-file-system");
  assert.equal(report.commands.serve.source, "scripts.start");
  assert.ok(report.runtime.server.frameworks.includes("express"));
}

{
  const root = fixture({
    "package.json": json({
      name: "lit-widget",
      scripts: { build: "vite build", preview: "vite preview" },
      devDependencies: { lit: "3.0.0", vite: "6.0.0" },
    }),
    "package-lock.json": "{}\n",
    "src/widget.ts": "import { LitElement } from 'lit'; customElements.define('x-widget', class extends LitElement {});\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.framework.name, "web-components-vite");
  assert.equal(report.project.mode, "spa");
  assert.equal(report.project.outputDir, "dist");
}

{
  const root = fixture({
    "package.json": json({
      name: "yarn-pnp-app",
      packageManager: "yarn@3.3.1",
      scripts: { build: "vite build", preview: "vite preview" },
      dependencies: { vite: "4.0.0" },
    }),
    "yarn.lock": "__metadata:\n  version: 6\n",
    ".pnp.cjs": "module.exports = {};\n",
  });
  const report = inspectWebProject(root);
  assert.equal(report.packageManager.name, "yarn");
  assert.equal(report.packageManager.installMode, "pnp");
  assert.equal(report.packageManager.installRoot, ".");
  assert.deepEqual(report.commands.install.argv, ["corepack", "yarn", "install", "--immutable"]);
  assert.ok(report.evidence.includes("package-manager-install-mode:pnp:."));
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

const canopy = path.join(ROOT, ".tmp/external-canopy/apps/web");
let optionalCanopy = null;
if (fs.existsSync(path.join(canopy, "package.json"))) {
  const report = inspectWebProject(canopy);
  assert.equal(report.framework.name, "waku");
  assert.equal(report.project.mode, "server-rendered");
  assert.equal(report.commands.serve.source, "scripts.preview");
  assert.equal(report.runtime.routing.model, "waku-router");
  assert.deepEqual(report.runtime.server.frameworks, ["hono"]);
  optionalCanopy = { framework: report.framework.name, mode: report.project.mode, serve: report.commands.serve.source, routing: report.runtime.routing.model, serverFrameworks: report.runtime.server.frameworks };
}

console.log(JSON.stringify({
  ok: true,
  runtime: "web-project-inspect-test",
  committedTargets: committed.length,
  optionalRealTargets: real,
  optionalCanopy,
}));
