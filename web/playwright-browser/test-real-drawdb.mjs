#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";

const CONTRACT_VERSION = "2";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PRIMARY_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
const FIXTURE_DIAGRAM_ID = "proped-drawdb-fixture";

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node web/playwright-browser/test-real-drawdb.mjs --dist <directory> --source <directory> --revision <git-sha>");
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const options = { dist: null, source: null, revision: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") usage();
    if (!["--dist", "--source", "--revision"].includes(arg)) usage(`unknown argument: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) usage(`missing value for ${arg}`);
    if (arg === "--dist") options.dist = value;
    if (arg === "--source") options.source = value;
    if (arg === "--revision") options.revision = value;
  }
  if (!options.dist) usage("--dist is required");
  if (!options.source) usage("--source is required");
  if (!options.revision || !/^[0-9a-f]{40}$/.test(options.revision)) usage("--revision must be a 40-character git SHA");
  const dist = path.resolve(ROOT, options.dist);
  const relative = path.relative(ROOT, dist);
  if (relative.startsWith("..") || path.isAbsolute(relative)) usage("--dist must stay inside the repository root");
  if (!fs.existsSync(path.join(dist, "index.html"))) usage(`index.html not found in ${options.dist}`);
  const source = path.resolve(ROOT, options.source);
  const sourceRelative = path.relative(ROOT, source);
  if (sourceRelative.startsWith("..") || path.isAbsolute(sourceRelative)) usage("--source must stay inside the repository root");
  if (!fs.existsSync(path.join(source, "package.json"))) usage(`package.json not found in ${options.source}`);
  return { ...options, dist, source };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }[ext] ?? "application/octet-stream";
}

async function startStaticServer(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__proped_seed__") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("<!doctype html><html><body>seed</body></html>");
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const requested = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, requested);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const exists = fs.existsSync(requested) && fs.statSync(requested).isFile();
    if (!exists && path.extname(pathname)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    const filePath = exists ? requested : path.join(root, "index.html");
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function table(id, name, x, y, fields) {
  return {
    id,
    name,
    x,
    y,
    locked: false,
    fields,
    comment: "",
    indices: [],
    uniqueConstraints: [],
    color: "#6360f7",
    collapsed: false,
  };
}

function field(id, name, type, options = {}) {
  return {
    id,
    name,
    type,
    default: "",
    check: "",
    primary: options.primary ?? false,
    unique: options.unique ?? false,
    unsigned: options.unsigned ?? false,
    notNull: options.notNull ?? false,
    increment: options.increment ?? false,
    comment: "",
  };
}

function initialDiagram() {
  return {
    diagramId: FIXTURE_DIAGRAM_ID,
    database: "generic",
    name: "Proped drawDB fixture",
    gistId: "",
    loadedFromGistId: "",
    lastModified: new Date(0),
    tables: [
      table("t_users", "users", 80, 80, [
        field("f_users_id", "id", "INT", { primary: true, notNull: true, increment: true }),
      ]),
      table("t_posts", "posts", 460, 80, [
        field("f_posts_id", "id", "INT", { primary: true, notNull: true, increment: true }),
        field("f_posts_user", "user_id", "INT"),
      ]),
    ],
    references: [
      {
        id: "r_posts_users",
        startTableId: "t_posts",
        startFieldId: "f_posts_user",
        endTableId: "t_users",
        endFieldId: "f_users_id",
        name: "posts_user_id_fk",
        cardinality: "Many to one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ],
    notes: [],
    areas: [],
    pan: { x: 0, y: 0 },
    zoom: 1,
    enums: [],
    types: [],
  };
}

function emptyDiagram() {
  return { ...initialDiagram(), tables: [], references: [] };
}

async function seedIndexedDb(page, diagram) {
  await page.evaluate(async ({ diagram }) => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("drawDB");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("drawDB", 670);
      request.onupgradeneeded = () => {
        const db = request.result;
        const diagrams = db.createObjectStore("diagrams", { keyPath: "id", autoIncrement: true });
        diagrams.createIndex("lastModified", "lastModified", { unique: false });
        diagrams.createIndex("loadedFromGistId", "loadedFromGistId", { unique: false });
        diagrams.createIndex("diagramId", "diagramId", { unique: false });
        const templates = db.createObjectStore("templates", { keyPath: "id", autoIncrement: true });
        templates.createIndex("custom", "custom", { unique: false });
        templates.createIndex("templateId", "templateId", { unique: false });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("diagrams", "readwrite");
        tx.objectStore("diagrams").add(diagram);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { diagram });
}

function normalizeTableName(name) {
  return /^table_[A-Za-z0-9_-]+$/.test(name) ? "<generated>" : name;
}

async function savedDiagram(page) {
  return page.evaluate(async (diagramId) => new Promise((resolve, reject) => {
    const request = indexedDB.open("drawDB", 670);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("diagrams", "readonly");
      const index = tx.objectStore("diagrams").index("diagramId");
      const getRequest = index.get(diagramId);
      getRequest.onsuccess = () => {
        const diagram = getRequest.result;
        db.close();
        if (!diagram) { resolve(null); return; }
        resolve({
          database: diagram.database,
          name: diagram.name,
          tables: (diagram.tables ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            x: t.x,
            y: t.y,
            fields: (t.fields ?? []).map((f) => ({
              id: f.id, name: f.name, type: f.type, primary: Boolean(f.primary),
              unique: Boolean(f.unique), notNull: Boolean(f.notNull), increment: Boolean(f.increment),
            })),
          })),
          references: (diagram.references ?? []).map((r) => ({
            id: r.id,
            startTableId: r.startTableId,
            startFieldId: r.startFieldId,
            endTableId: r.endTableId,
            endFieldId: r.endFieldId,
            name: r.name,
          })),
        });
      };
    };
  }), FIXTURE_DIAGRAM_ID);
}

async function browserSnapshot(page) {
  const tableEntries = await page.locator('div[id^="scroll_table_"]:not([id*="_input_"])').evaluateAll((nodes) => nodes.map((node) => {
    const id = node.id.replace(/^scroll_table_/, "");
    const header = node.querySelector(".semi-collapse-header");
    return { id, name: header?.textContent?.trim() ?? "" };
  }));
  const relationshipCount = await page.locator(".relationship-path").count();
  const foreignObjectCount = await page.locator("svg foreignObject").count();
  const saved = await savedDiagram(page);
  return {
    route: new URL(page.url()).pathname,
    tables: tableEntries.map((entry) => ({
      id: ["t_users", "t_posts"].includes(entry.id) ? entry.id : "<generated>",
      name: normalizeTableName(entry.name),
    })),
    relationshipCount,
    foreignObjectCount,
    saved: saved ? {
      tables: saved.tables.map((t) => ({
        id: ["t_users", "t_posts"].includes(t.id) ? t.id : "<generated>",
        name: normalizeTableName(t.name),
        x: t.x,
        y: t.y,
        fields: t.fields.map((f) => ({
          id: ["f_users_id", "f_posts_id", "f_posts_user"].includes(f.id) ? f.id : "<generated>",
          name: f.name,
          type: f.type,
        })),
      })),
      references: saved.references.map((r) => ({
        id: r.id === "r_posts_users" ? r.id : "<generated>",
        startTableId: ["t_users", "t_posts"].includes(r.startTableId) ? r.startTableId : "<generated>",
        startFieldId: ["f_users_id", "f_posts_id", "f_posts_user"].includes(r.startFieldId) ? r.startFieldId : "<generated>",
        endTableId: ["t_users", "t_posts"].includes(r.endTableId) ? r.endTableId : "<generated>",
        endFieldId: ["f_users_id", "f_posts_id", "f_posts_user"].includes(r.endFieldId) ? r.endFieldId : "<generated>",
        name: r.name,
      })),
    } : null,
  };
}

function createFailure(property, trace, expected, actual) {
  return {
    property,
    failureClass: property,
    trace,
    expected,
    actual,
    semanticHash: semanticHash({ property, trace, expected, actual }),
  };
}

function semanticDiagram(diagram) {
  const tables = diagram?.tables ?? [];
  const relationships = diagram?.relationships ?? diagram?.references ?? [];
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const fieldName = (tableId, fieldId) =>
    tableById.get(tableId)?.fields?.find((field) => field.id === fieldId)?.name ?? null;
  return {
    tables: tables
      .map((table) => ({
        name: table.name,
        fields: (table.fields ?? [])
          .map((field) => ({
            name: field.name,
            type: String(field.type ?? "").toUpperCase(),
            primary: Boolean(field.primary),
            unique: Boolean(field.unique),
            notNull: Boolean(field.notNull),
            increment: Boolean(field.increment),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    relationships: relationships
      .map((relationship) => ({
        startTable: tableById.get(relationship.startTableId)?.name ?? null,
        startField: fieldName(relationship.startTableId, relationship.startFieldId),
        endTable: tableById.get(relationship.endTableId)?.name ?? null,
        endField: fieldName(relationship.endTableId, relationship.endFieldId),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function editImportedDiagram(diagram) {
  const edited = structuredClone(diagram);
  const posts = edited.tables.find((table) => table.name === "posts");
  if (!posts) throw new Error("round-trip fixture is missing posts table");
  posts.name = "articles";
  const userId = posts.fields.find((field) => field.name === "user_id");
  if (!userId) throw new Error("round-trip fixture is missing posts.user_id");
  userId.name = "author_id";
  return edited;
}

function mysqlSemanticFromSource(source, sql) {
  const require = createRequire(import.meta.url);
  const { createJiti } = require(path.join(source, "node_modules/jiti"));
  const jiti = createJiti(import.meta.url);
  const { importSQL } = jiti(path.join(source, "src/utils/importSQL/index.js"));
  const { Parser } = require(path.join(source, "node_modules/node-sql-parser"));
  const parser = new Parser();
  return semanticDiagram(importSQL(parser.astify(sql, { database: "mysql" }), "mysql", "generic"));
}

function runSourceRoundTrips(source) {
  const failures = [];
  const scenarios = [];
  const require = createRequire(import.meta.url);
  const { createJiti } = require(path.join(source, "node_modules/jiti"));
  const jiti = createJiti(import.meta.url);
  const { toDBML } = jiti(path.join(source, "src/utils/exportAs/dbml.js"));
  const { fromDBML } = jiti(path.join(source, "src/utils/importFrom/dbml.js"));
  const { jsonToMySQL } = jiti(path.join(source, "src/utils/exportSQL/generic.js"));
  const { importSQL } = jiti(path.join(source, "src/utils/importSQL/index.js"));
  const { Parser } = require(path.join(source, "node_modules/node-sql-parser"));

  const dbmlInput = `Table users {
  id int [pk, increment, not null]
}

Table posts {
  id int [pk, increment, not null]
  user_id int [not null]
}

Ref posts_user_id_fk {
  posts.user_id > users.id [delete: no action, update: no action]
}`;
  const dbmlTrace = ["import:dbml", "edit:posts->articles", "edit:user_id->author_id", "export:dbml", "reimport:dbml"];
  const dbmlImported = fromDBML(dbmlInput, "generic");
  const dbmlEdited = editImportedDiagram(dbmlImported);
  const dbmlExpected = semanticDiagram(dbmlEdited);
  const dbmlExport = toDBML({ ...dbmlEdited, database: "generic", enums: dbmlEdited.enums ?? [] });
  const dbmlActual = semanticDiagram(fromDBML(dbmlExport, "generic"));
  if (JSON.stringify(dbmlActual) !== JSON.stringify(dbmlExpected)) {
    failures.push(createFailure("dbml_roundtrip_semantic_equivalence", dbmlTrace, dbmlExpected, dbmlActual));
  }
  if (!dbmlExport.includes("articles") || !dbmlExport.includes("author_id")) {
    failures.push(createFailure("dbml_export_reflects_edit", dbmlTrace, { articles: true, author_id: true }, { articles: dbmlExport.includes("articles"), author_id: dbmlExport.includes("author_id") }));
  }
  scenarios.push({ id: "dbml-import-edit-export-reimport", trace: dbmlTrace, semantic: dbmlActual });

  const sqlInput = `CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (id)
);
CREATE TABLE posts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`;
  const sqlTrace = ["import:mysql", "edit:posts->articles", "edit:user_id->author_id", "export:mysql", "reimport:mysql"];
  const parser = new Parser();
  const sqlImported = importSQL(parser.astify(sqlInput, { database: "mysql" }), "mysql", "generic");
  const sqlEdited = editImportedDiagram(sqlImported);
  const sqlExpected = semanticDiagram(sqlEdited);
  const sqlExport = jsonToMySQL({ tables: sqlEdited.tables, references: sqlEdited.relationships, types: sqlEdited.types ?? [], database: "generic" });
  const sqlActual = semanticDiagram(importSQL(parser.astify(sqlExport, { database: "mysql" }), "mysql", "generic"));
  if (JSON.stringify(sqlActual) !== JSON.stringify(sqlExpected)) {
    failures.push(createFailure("sql_roundtrip_semantic_equivalence", sqlTrace, sqlExpected, sqlActual));
  }
  if (!sqlExport.includes("articles") || !sqlExport.includes("author_id")) {
    failures.push(createFailure("sql_export_reflects_edit", sqlTrace, { articles: true, author_id: true }, { articles: sqlExport.includes("articles"), author_id: sqlExport.includes("author_id") }));
  }
  scenarios.push({ id: "sql-import-edit-export-reimport", trace: sqlTrace, semantic: sqlActual });

  return { scenarios, failures };
}

function tableNames(snapshot) {
  return snapshot.tables.map((table) => table.name);
}

async function waitForTableCount(page, count) {
  await page.waitForFunction((expected) => document.querySelectorAll('div[id^="scroll_table_"]:not([id*="_input_"])').length === expected, count);
}

async function waitForRelationshipCount(page, count) {
  await page.waitForFunction((expected) => document.querySelectorAll(".relationship-path").length === expected, count);
}

async function waitForSavedTableCount(page, count) {
  await page.waitForFunction(async ({ diagramId, expected }) => new Promise((resolve) => {
    const request = indexedDB.open("drawDB", 670);
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("diagrams", "readonly");
      const getRequest = tx.objectStore("diagrams").index("diagramId").get(diagramId);
      getRequest.onsuccess = () => {
        const matches = (getRequest.result?.tables?.length ?? -1) === expected;
        db.close();
        resolve(matches);
      };
    };
  }), { diagramId: FIXTURE_DIAGRAM_ID, expected: count });
}

async function waitForSavedTableNames(page, names) {
  await page.waitForFunction(async ({ diagramId, expected }) => new Promise((resolve) => {
    const request = indexedDB.open("drawDB", 670);
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("diagrams", "readonly");
      const getRequest = tx.objectStore("diagrams").index("diagramId").get(diagramId);
      getRequest.onsuccess = () => {
        const actual = (getRequest.result?.tables ?? []).map((table) => table.name);
        db.close();
        resolve(actual.join("|") === expected.join("|"));
      };
    };
  }), { diagramId: FIXTURE_DIAGRAM_ID, expected: names });
}

async function withFreshPage(browser, origin, run, { acceptDownloads = false, seed = initialDiagram() } = {}) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads,
    permissions: [],
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const blockedRequests = [];
  let monacoNetworkFailure = false;
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    if (monacoNetworkFailure && error.message === "Event") return;
    errors.push(`pageerror:${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error" || message.text().includes("Failed to load resource")) return;
    if (message.text().includes("Monaco initialization: error")) { monacoNetworkFailure = true; return; }
    errors.push(`console:${message.text()}`);
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) await route.continue();
    else {
      blockedRequests.push(url.origin);
      await route.abort("blockedbyclient");
    }
  });
  await page.goto(`${origin}/__proped_seed__`, { waitUntil: "domcontentloaded" });
  await seedIndexedDb(page, seed);
  await page.goto(`${origin}/editor/diagrams/${FIXTURE_DIAGRAM_ID}`, { waitUntil: "domcontentloaded" });
  await page.locator("#canvas").waitFor();
  if (seed.tables.some((table) => table.id === "t_users")) await page.locator("#scroll_table_t_users").waitFor();
  if (seed.tables.some((table) => table.id === "t_posts")) await page.locator("#scroll_table_t_posts").waitFor();
  await waitForRelationshipCount(page, seed.references.length);
  try {
    return await run(page, errors, [...new Set(blockedRequests)].sort());
  } finally {
    await context.close();
  }
}

async function selectCanvasTable(page, name) {
  const target = page.locator("svg foreignObject").filter({ hasText: name }).first();
  await target.click();
}

async function clickAddTable(page) {
  const icon = page.locator('svg path[d="M4 2 L20 2 A4 4 0 0 1 22 4 L22 14 M14 22 L4 22 A4 4 0 0 1 1 18 L1 4 A4 4 0 0 1 5 2 M22 17 L22 25 M18 21 L26 21 M1 8 L22 8"]').first();
  await icon.waitFor();
  await icon.locator('xpath=ancestor::button').click();
}

async function undo(page) {
  await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
}

async function redo(page) {
  await page.keyboard.press(`${PRIMARY_MODIFIER}+y`);
}

async function visibleDropdownItem(page, text) {
  const items = page.locator(".semi-dropdown-item:visible");
  for (let i = 0; i < await items.count(); i += 1) {
    const item = items.nth(i);
    if ((await item.textContent())?.trim() === text) return item;
  }
  throw new Error(`visible dropdown item not found: ${text}`);
}

async function chooseFileMenuChild(page, parentText, childText) {
  await page.getByText("File", { exact: true }).first().hover();
  await page.waitForTimeout(120);
  const parent = await visibleDropdownItem(page, parentText);
  await parent.hover();
  await page.waitForTimeout(120);
  const child = await visibleDropdownItem(page, childText);
  await child.click();
}

async function renameSidebarTable(page, from, to) {
  const wrappers = page.locator('div[id^="scroll_table_"]:not([id*="_input_"])');
  let wrapper = null;
  for (let i = 0; i < await wrappers.count(); i += 1) {
    const candidate = wrappers.nth(i);
    const header = candidate.locator(".semi-collapse-header");
    if ((await header.textContent())?.trim() === from) { wrapper = candidate; break; }
  }
  if (!wrapper) throw new Error(`sidebar table not found: ${from}`);
  await wrapper.locator(".semi-collapse-header").click();
  const input = wrapper.locator('input[placeholder="Name"]').first();
  await input.waitFor();
  await input.fill(to);
  await input.press("Tab");
  await page.waitForFunction(({ from, to }) => {
    const nodes = [...document.querySelectorAll('div[id^="scroll_table_"]:not([id*="_input_"]) .semi-collapse-header')];
    return nodes.some((node) => node.textContent?.trim() === to) && !nodes.some((node) => node.textContent?.trim() === from);
  }, { from, to });
}

async function importDbmlViaUi(page, source) {
  await chooseFileMenuChild(page, "Import from", "DBML");
  const input = page.locator('.semi-modal:visible input[type="file"]').first();
  await input.setInputFiles({ name: "proped.dbml", mimeType: "text/plain", buffer: Buffer.from(source) });
  await page.locator('.semi-modal:visible .semi-modal-footer button').last().click();
  await page.locator('.semi-modal:visible').waitFor({ state: "hidden" });
}

async function importMysqlViaUi(page, source) {
  await chooseFileMenuChild(page, "Import from SQL", "MySQL");
  await page.getByText("Upload file", { exact: true }).last().click();
  const input = page.locator('.semi-modal:visible input[type="file"]').first();
  await input.setInputFiles({ name: "proped.sql", mimeType: "text/plain", buffer: Buffer.from(source) });
  const primary = page.locator('.semi-modal:visible .semi-modal-footer button').last();
  await primary.waitFor();
  for (let attempt = 0; attempt < 100 && await primary.isDisabled(); attempt += 1) await page.waitForTimeout(25);
  if (await primary.isDisabled()) return { ok: false, diagnostic: "import_action_disabled" };
  await primary.click();
  try {
    await page.locator('.semi-modal:visible').waitFor({ state: "hidden", timeout: 5000 });
    return { ok: true };
  } catch {
    const modal = page.locator('.semi-modal:visible');
    const diagnostic = (await modal.innerText()).trim();
    await modal.locator('.semi-modal-footer button').first().click({ force: true });
    await modal.waitFor({ state: "hidden" });
    return { ok: false, diagnostic };
  }
}

async function exportedSourceViaUi(page, parentText, childText) {
  await chooseFileMenuChild(page, parentText, childText);
  const modal = page.locator('.semi-modal:visible');
  await modal.waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('.semi-modal:visible .semi-modal-footer button').last().click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  const source = fs.readFileSync(downloadedPath, "utf8");
  await page.locator('.semi-modal:visible .semi-modal-footer button').first().click();
  await modal.waitFor({ state: "hidden" });
  return source;
}

async function canvasTablePosition(page, name) {
  const target = page.locator("svg foreignObject").filter({ hasText: name }).first();
  return {
    x: Number(await target.getAttribute("x")),
    y: Number(await target.getAttribute("y")),
  };
}

async function savedTablePosition(page, name) {
  const saved = await savedDiagram(page);
  const table = saved?.tables.find((candidate) => candidate.name === name);
  return table ? { x: table.x, y: table.y } : null;
}

async function waitForSavedTablePosition(page, name, expected) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const position = await savedTablePosition(page, name);
    if (position && position.x === expected.x && position.y === expected.y) return position;
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out waiting for saved position ${name}=${expected.x},${expected.y}`);
}

async function waitForSavedTablePositionChange(page, name, before) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const position = await savedTablePosition(page, name);
    if (position && (position.x !== before.x || position.y !== before.y)) return position;
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out waiting for saved position change for ${name}`);
}

async function dragCanvasTable(page, name, delta) {
  const target = page.locator("svg foreignObject").filter({ hasText: name }).first();
  const box = await target.boundingBox();
  if (!box) throw new Error(`table ${name} has no bounding box`);
  const start = { x: box.x + 40, y: box.y + 24 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
  await page.mouse.up();
}

async function runContractOnce(browser, origin, source) {
  const sourceRoundTrips = runSourceRoundTrips(source);
  const failures = [...sourceRoundTrips.failures];
  const scenarios = [...sourceRoundTrips.scenarios];

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    let snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts") failures.push(createFailure("initial_table_order", [...trace], ["users", "posts"], tableNames(snapshot)));
    await clickAddTable(page); trace.push("add-table");
    await waitForTableCount(page, 3);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts|<generated>") failures.push(createFailure("add_table_appends", [...trace], ["users", "posts", "<generated>"], tableNames(snapshot)));
    await undo(page); trace.push("undo:add-table");
    await waitForTableCount(page, 2);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts") failures.push(createFailure("add_table_undo_restores_state", [...trace], ["users", "posts"], tableNames(snapshot)));
    await redo(page); trace.push("redo:add-table");
    await waitForTableCount(page, 3);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts|<generated>") failures.push(createFailure("add_table_redo_preserves_order", [...trace], ["users", "posts", "<generated>"], tableNames(snapshot)));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "add-undo-redo", trace, snapshot, blockedRequests };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    await selectCanvasTable(page, "users"); trace.push("select-table:users");
    await page.keyboard.press("Delete"); trace.push("delete-table:users");
    await waitForTableCount(page, 1);
    await waitForRelationshipCount(page, 0);
    let snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "posts") failures.push(createFailure("delete_table_removes_selected", [...trace], ["posts"], tableNames(snapshot)));
    const errorsBeforeRepeatDelete = errors.length;
    await page.keyboard.press("Delete"); trace.push("delete-key-after-selected-delete");
    await page.waitForTimeout(50);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "posts" || errors.length !== errorsBeforeRepeatDelete) {
      failures.push(createFailure("delete_table_clears_selection", [...trace], { tables: ["posts"], newErrors: 0 }, { tables: tableNames(snapshot), newErrors: errors.slice(errorsBeforeRepeatDelete) }));
    }
    await undo(page); trace.push("undo:delete-table:users");
    await waitForTableCount(page, 2);
    await waitForRelationshipCount(page, 1);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts") failures.push(createFailure("delete_table_undo_preserves_order", [...trace], ["users", "posts"], tableNames(snapshot)));
    if (snapshot.relationshipCount !== 1) failures.push(createFailure("delete_table_undo_restores_relationship", [...trace], 1, snapshot.relationshipCount));
    await redo(page); trace.push("redo:delete-table:users");
    await waitForTableCount(page, 1);
    await waitForRelationshipCount(page, 0);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "posts") failures.push(createFailure("delete_table_redo_reapplies_delete", [...trace], ["posts"], tableNames(snapshot)));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "delete-undo-redo", trace, snapshot, blockedRequests };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    await page.locator("svg text").filter({ hasText: "posts_user_id_fk" }).dblclick(); trace.push("open-relationship:posts_user_id_fk");
    const deleteButton = page.locator('button:visible').filter({ hasText: "Delete" }).last();
    await deleteButton.waitFor();
    await deleteButton.click(); trace.push("delete-relationship");
    await waitForRelationshipCount(page, 0);
    let snapshot = await browserSnapshot(page);
    if (snapshot.relationshipCount !== 0) failures.push(createFailure("relationship_delete_applies", [...trace], 0, snapshot.relationshipCount));
    await undo(page); trace.push("undo:delete-relationship");
    await waitForRelationshipCount(page, 1);
    snapshot = await browserSnapshot(page);
    if (snapshot.relationshipCount !== 1) failures.push(createFailure("relationship_delete_undo_restores", [...trace], 1, snapshot.relationshipCount));
    const restored = snapshot.saved?.references?.find((reference) => reference.id === "r_posts_users") ?? null;
    if (restored && (restored.startTableId !== "t_posts" || restored.endTableId !== "t_users")) failures.push(createFailure("relationship_undo_preserves_endpoints", [...trace], { startTableId: "t_posts", endTableId: "t_users" }, { startTableId: restored.startTableId, endTableId: restored.endTableId }));
    await redo(page); trace.push("redo:delete-relationship");
    await waitForRelationshipCount(page, 0);
    snapshot = await browserSnapshot(page);
    if (snapshot.relationshipCount !== 0) failures.push(createFailure("relationship_delete_redo_reapplies", [...trace], 0, snapshot.relationshipCount));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "relationship-delete-undo-redo", trace, snapshot, blockedRequests };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    await page.locator("#scroll_table_t_users .semi-collapse-header").click(); trace.push("open-table-editor:users");
    const nameInput = page.locator('#scroll_table_t_users input[placeholder="Name"]').first();
    await nameInput.waitFor();
    await nameInput.fill("accounts"); trace.push("rename:users->accounts");
    await nameInput.press("Tab"); trace.push("blur:name");
    await page.waitForFunction(() => document.querySelector("#scroll_table_t_users")?.textContent?.includes("accounts"));
    let snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "accounts|posts") failures.push(createFailure("table_rename_applies", [...trace], ["accounts", "posts"], tableNames(snapshot)));
    await undo(page); trace.push("undo:rename");
    await page.waitForFunction(() => document.querySelector("#scroll_table_t_users")?.textContent?.includes("users"));
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "users|posts") failures.push(createFailure("table_rename_undo", [...trace], ["users", "posts"], tableNames(snapshot)));
    await redo(page); trace.push("redo:rename");
    await page.waitForFunction(() => document.querySelector("#scroll_table_t_users")?.textContent?.includes("accounts"));
    await waitForSavedTableNames(page, ["accounts", "posts"]);
    snapshot = await browserSnapshot(page);
    const savedNames = snapshot.saved?.tables.map((table) => table.name) ?? [];
    if (savedNames.join("|") !== "accounts|posts") failures.push(createFailure("table_rename_autosaves", [...trace], ["accounts", "posts"], savedNames));
    await page.reload({ waitUntil: "domcontentloaded" }); trace.push("reload");
    await page.locator("#scroll_table_t_users").waitFor();
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== "accounts|posts") failures.push(createFailure("table_rename_persists_reload", [...trace], ["accounts", "posts"], tableNames(snapshot)));
    if (snapshot.relationshipCount !== 1) failures.push(createFailure("rename_preserves_relationship", [...trace], 1, snapshot.relationshipCount));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "rename-persistence", trace, snapshot, blockedRequests };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    await clickAddTable(page); trace.push("add-table");
    await waitForTableCount(page, 3);
    await waitForSavedTableCount(page, 3); trace.push("autosave:observed");
    let snapshot = await browserSnapshot(page);
    const beforeReload = tableNames(snapshot);
    await page.reload({ waitUntil: "domcontentloaded" }); trace.push("reload");
    await waitForTableCount(page, 3);
    snapshot = await browserSnapshot(page);
    if (tableNames(snapshot).join("|") !== beforeReload.join("|")) failures.push(createFailure("add_table_persists_reload", [...trace], beforeReload, tableNames(snapshot)));
    if (snapshot.relationshipCount !== 1) failures.push(createFailure("add_table_persistence_preserves_relationship", [...trace], 1, snapshot.relationshipCount));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "add-persistence", trace, snapshot, blockedRequests };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    const source = `Table users {
  id int [pk, increment, not null]
}

Table posts {
  id int [pk, increment, not null]
  user_id int [not null]
}

Ref posts_user_id_fk {
  posts.user_id > users.id [delete: no action, update: no action]
}`;
    await importDbmlViaUi(page, source); trace.push("ui-import:dbml");
    await waitForTableCount(page, 2);
    await renameSidebarTable(page, "posts", "articles"); trace.push("ui-edit:posts->articles");
    await waitForSavedTableNames(page, ["users", "articles"]);
    const before = semanticDiagram(await savedDiagram(page));
    const exported = await exportedSourceViaUi(page, "Export as", "DBML"); trace.push("ui-export:dbml");
    if (!exported.includes("articles")) failures.push(createFailure("dbml_ui_export_reflects_edit", [...trace], true, exported.includes("articles")));
    await importDbmlViaUi(page, exported); trace.push("ui-reimport:dbml");
    await waitForTableCount(page, 2);
    await waitForSavedTableNames(page, ["users", "articles"]);
    const after = semanticDiagram(await savedDiagram(page));
    if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(createFailure("dbml_ui_roundtrip_semantic_equivalence", [...trace], before, after));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "dbml-ui-roundtrip", trace, semantic: after, blockedRequests };
  }, { acceptDownloads: true }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    const source = `CREATE TABLE users (id INT);`;
    const result = await importMysqlViaUi(page, source); trace.push("ui-import:mysql:minimal-valid");
    if (!result.ok) {
      failures.push(createFailure("sql_ui_import_rejects_valid_mysql", [...trace], { imported: true }, { imported: false, diagnostic: result.diagnostic }));
    } else {
      await waitForTableCount(page, 1);
    }
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "sql-ui-import-valid", trace, imported: result.ok, blockedRequests };
  }, { seed: emptyDiagram() }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    const expected = semanticDiagram(await savedDiagram(page));
    const exported = await exportedSourceViaUi(page, "Export SQL", "MySQL"); trace.push("ui-export:mysql");
    const actual = mysqlSemanticFromSource(source, exported); trace.push("source-reimport:mysql");
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(createFailure("sql_ui_export_semantic_equivalence", [...trace], expected, actual));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "sql-ui-export-semantic", trace, semantic: actual, blockedRequests };
  }, { acceptDownloads: true }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors, blockedRequests) => {
    const trace = [];
    const original = await savedTablePosition(page, "users");
    if (!original) throw new Error("users table missing from saved fixture");
    const originalCanvas = await canvasTablePosition(page, "users");
    if (originalCanvas.x !== original.x || originalCanvas.y !== original.y) {
      failures.push(createFailure("drag_initial_dom_saved_position_match", [...trace], original, originalCanvas));
    }
    await dragCanvasTable(page, "users", { x: 120, y: 96 }); trace.push("drag:users:+120,+96");
    const moved = await waitForSavedTablePositionChange(page, "users", original);
    const movedCanvas = await canvasTablePosition(page, "users");
    if (movedCanvas.x !== moved.x || movedCanvas.y !== moved.y) {
      failures.push(createFailure("drag_dom_saved_position_match", [...trace], moved, movedCanvas));
    }
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await undo(page); trace.push(`undo:drag:${cycle}`);
      await waitForSavedTablePosition(page, "users", original);
      const undoCanvas = await canvasTablePosition(page, "users");
      if (undoCanvas.x !== original.x || undoCanvas.y !== original.y) {
        failures.push(createFailure("drag_undo_restores_exact_position", [...trace], original, undoCanvas));
      }
      await redo(page); trace.push(`redo:drag:${cycle}`);
      await waitForSavedTablePosition(page, "users", moved);
      const redoCanvas = await canvasTablePosition(page, "users");
      if (redoCanvas.x !== moved.x || redoCanvas.y !== moved.y) {
        failures.push(createFailure("drag_redo_restores_exact_position", [...trace], moved, redoCanvas));
      }
    }
    await page.reload({ waitUntil: "domcontentloaded" }); trace.push("reload");
    await page.locator("#scroll_table_t_users").waitFor();
    const reloaded = await canvasTablePosition(page, "users");
    if (reloaded.x !== moved.x || reloaded.y !== moved.y) {
      failures.push(createFailure("drag_position_persists_reload", [...trace], moved, reloaded));
    }
    const snapshot = await browserSnapshot(page);
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "drag-undo-redo-drift", trace, original, moved, snapshot, blockedRequests };
  }));

  return { scenarios, failures };
}

function normalizeRun(run) {
  return { scenarios: run.scenarios, failures: run.failures };
}

const options = parseArgs(process.argv.slice(2));
const server = await startStaticServer(options.dist);
const browser = await chromium.launch({ headless: true });
try {
  const first = await runContractOnce(browser, server.origin, options.source);
  const second = await runContractOnce(browser, server.origin, options.source);
  const deterministic = semanticHash(normalizeRun(first)) === semanticHash(normalizeRun(second));
  if (!deterministic) first.failures.push(createFailure("deterministic_replay", ["repeat-contract"], semanticHash(normalizeRun(first)), semanticHash(normalizeRun(second))));
  const result = {
    ok: first.failures.length === 0,
    runtime: "external-drawdb-browser",
    contractVersion: CONTRACT_VERSION,
    repository: "drawdb-io/drawdb",
    revision: options.revision,
    browser: {
      name: "chromium",
      version: browser.version(),
      serviceWorkers: "block",
      externalNetwork: "deny",
      contextPolicy: "fresh-per-scenario",
      initialState: "seeded-dexie-fixture-ui-mutations-only",
    },
    scenarioCount: first.scenarios.length,
    failureCount: first.failures.length,
    deterministicReplay: deterministic,
    scenarios: first.scenarios,
    failures: first.failures,
  };
  result.semanticHash = semanticHash({ ...result, browser: { ...result.browser, version: null } });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
