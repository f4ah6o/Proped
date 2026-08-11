#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";

const CONTRACT_VERSION = "1";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

function usage(message) {
  if (message) console.error(JSON.stringify({ ok: false, error: "invalid_arguments", message }));
  else console.log("Usage: node web/playwright-browser/test-real-todomvc.mjs --framework <react|vue> --dist <directory> --revision <git-sha>");
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const options = { framework: null, dist: null, revision: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") usage();
    if (!["--framework", "--dist", "--revision"].includes(arg)) usage(`unknown argument: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) usage(`missing value for ${arg}`);
    if (arg === "--framework") options.framework = value;
    if (arg === "--dist") options.dist = value;
    if (arg === "--revision") options.revision = value;
  }
  if (!options.framework || !["react", "vue"].includes(options.framework)) usage("--framework must be react or vue");
  if (!options.dist) usage("--dist is required");
  if (!options.revision || !/^[0-9a-f]{40}$/.test(options.revision)) usage("--revision must be a 40-character git SHA");
  const dist = path.resolve(ROOT, options.dist);
  const relative = path.relative(ROOT, dist);
  if (relative.startsWith("..") || path.isAbsolute(relative)) usage("--dist must stay inside the repository root");
  if (!fs.existsSync(path.join(dist, "index.html"))) usage(`index.html not found in ${options.dist}`);
  return { ...options, dist };
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
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }[ext] ?? "application/octet-stream";
}

async function startStaticServer(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const requested = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, requested);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const filePath = fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(root, "index.html");
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

async function browserSnapshot(page) {
  const items = await page.locator(".todo-list li").evaluateAll((nodes) => nodes
    .filter((node) => getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden")
    .map((node) => ({
      title: node.querySelector(".view label")?.textContent?.trim() ?? "",
      completed: Boolean(node.querySelector("input.toggle")?.checked),
      editing: node.classList.contains("editing"),
    })));
  const countText = await page.locator(".todo-count").count()
    ? (await page.locator(".todo-count").first().textContent())?.trim() ?? ""
    : "";
  const selectedFilter = await page.locator(".filters a.selected").count()
    ? (await page.locator(".filters a.selected").first().textContent())?.trim() ?? null
    : null;
  const toggleAll = page.locator("input.toggle-all");
  const clearCompleted = page.locator("button.clear-completed");
  const editInput = page.locator("input.edit");
  return {
    route: new URL(page.url()).hash.replace(/^#/, "") || "/",
    items,
    activeCount: Number.parseInt(countText, 10),
    countText,
    selectedFilter,
    toggleAllChecked: await toggleAll.count() ? await toggleAll.isChecked() : null,
    clearCompletedVisible: await clearCompleted.count() ? await clearCompleted.isVisible() : false,
    editingCount: await editInput.count(),
    editFocused: await editInput.count() ? await editInput.first().evaluate((node) => node === document.activeElement) : false,
    localStorageKeys: await page.evaluate(() => Object.keys(localStorage).sort()),
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

async function addTodo(page, title) {
  const input = page.locator("input.new-todo");
  await input.fill(title);
  await input.press("Enter");
}

async function clickFilter(page, name) {
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForTimeout(0);
}

async function toggleVisible(page, index) {
  await page.locator(".todo-list li").nth(index).locator("input.toggle").click();
}

async function editVisible(page, index, value, key = "Enter") {
  const item = page.locator(".todo-list li").nth(index);
  await item.locator(".view label").dblclick();
  const input = item.locator("input.edit");
  await input.fill(value);
  await input.press(key);
}

async function withFreshPage(browser, origin, run) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: false,
    permissions: [],
  });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await page.goto(`${origin}/#/`, { waitUntil: "domcontentloaded" });
  await page.locator("input.new-todo").waitFor();
  try {
    return await run(page, errors);
  } finally {
    await context.close();
  }
}

async function runContractOnce(browser, origin) {
  const failures = [];
  const scenarios = [];

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "   "); trace.push("add:blank");
    let snapshot = await browserSnapshot(page);
    if (snapshot.items.length !== 0) failures.push(createFailure("blank_add_ignored", [...trace], 0, snapshot.items.length));
    await addTodo(page, "x"); trace.push("add:x");
    snapshot = await browserSnapshot(page);
    if (snapshot.items.map((item) => item.title).join("|") !== "x") failures.push(createFailure("single_character_add", [...trace], ["x"], snapshot.items.map((item) => item.title)));
    await addTodo(page, "  alpha  "); trace.push("add:trimmed-alpha");
    snapshot = await browserSnapshot(page);
    const titles = snapshot.items.map((item) => item.title);
    if (titles.join("|") !== "x|alpha") failures.push(createFailure("add_title_trimmed", [...trace], ["x", "alpha"], titles));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "add-input", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    for (const title of ["alpha", "beta", "gamma"]) { await addTodo(page, title); trace.push(`add:${title}`); }
    await toggleVisible(page, 1); trace.push("toggle:beta");
    let snapshot = await browserSnapshot(page);
    if (snapshot.activeCount !== 2) failures.push(createFailure("active_count_matches_model", [...trace], 2, snapshot.activeCount));
    await clickFilter(page, "Completed"); trace.push("route:completed");
    snapshot = await browserSnapshot(page);
    if (snapshot.items.map((item) => item.title).join("|") !== "beta") failures.push(createFailure("completed_filter_consistency", [...trace], ["beta"], snapshot.items.map((item) => item.title)));
    await clickFilter(page, "Active"); trace.push("route:active");
    snapshot = await browserSnapshot(page);
    if (snapshot.items.map((item) => item.title).join("|") !== "alpha|gamma") failures.push(createFailure("active_filter_consistency", [...trace], ["alpha", "gamma"], snapshot.items.map((item) => item.title)));
    await toggleVisible(page, 0); trace.push("toggle:alpha-in-active");
    snapshot = await browserSnapshot(page);
    if (snapshot.items.map((item) => item.title).join("|") !== "gamma") failures.push(createFailure("filtered_update_removes_completed", [...trace], ["gamma"], snapshot.items.map((item) => item.title)));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "filter-count", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "alpha"); trace.push("add:alpha");
    await addTodo(page, "beta"); trace.push("add:beta");
    await toggleVisible(page, 0); trace.push("toggle:alpha");
    await clickFilter(page, "Completed"); trace.push("route:completed");
    const snapshot = await browserSnapshot(page);
    if (snapshot.toggleAllChecked !== false) failures.push(createFailure("toggle_all_reflects_all_todos", [...trace], false, snapshot.toggleAllChecked));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "toggle-all-filter-independent", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "alpha"); trace.push("add:alpha");
    await addTodo(page, "beta"); trace.push("add:beta");
    await toggleVisible(page, 0); trace.push("toggle:alpha");
    await page.getByRole("button", { name: "Clear completed", exact: true }).click(); trace.push("clear-completed");
    const snapshot = await browserSnapshot(page);
    const titles = snapshot.items.map((item) => item.title);
    if (titles.join("|") !== "beta" || snapshot.items.some((item) => item.completed)) failures.push(createFailure("clear_completed_preserves_active", [...trace], [{ title: "beta", completed: false }], snapshot.items));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "clear-completed", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "alpha"); trace.push("add:alpha");
    await editVisible(page, 0, "  changed  "); trace.push("edit:changed-enter");
    let snapshot = await browserSnapshot(page);
    if (snapshot.items[0]?.title !== "changed") failures.push(createFailure("edit_title_trimmed", [...trace], "changed", snapshot.items[0]?.title ?? null));
    await editVisible(page, 0, "   "); trace.push("edit:blank-enter");
    snapshot = await browserSnapshot(page);
    if (snapshot.items.length !== 0) failures.push(createFailure("empty_edit_deletes_todo", [...trace], 0, snapshot.items.length));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "edit-enter", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "alpha"); trace.push("add:alpha");
    const item = page.locator(".todo-list li").first();
    await item.locator(".view label").dblclick(); trace.push("edit:start");
    const input = item.locator("input.edit");
    await input.fill("changed"); trace.push("edit:draft-changed");
    await input.press("Escape"); trace.push("edit:escape");
    const snapshot = await browserSnapshot(page);
    const title = snapshot.items[0]?.title ?? null;
    if (snapshot.editingCount !== 0 || title !== "alpha") failures.push(createFailure("escape_cancels_edit", [...trace], { editingCount: 0, title: "alpha" }, { editingCount: snapshot.editingCount, title }));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "edit-escape", trace, snapshot };
  }));

  scenarios.push(await withFreshPage(browser, origin, async (page, errors) => {
    const trace = [];
    await addTodo(page, "alpha"); trace.push("add:alpha");
    await addTodo(page, "beta"); trace.push("add:beta");
    await toggleVisible(page, 0); trace.push("toggle:alpha");
    await clickFilter(page, "Completed"); trace.push("route:completed");
    const before = await browserSnapshot(page);
    await page.reload({ waitUntil: "domcontentloaded" }); trace.push("reload");
    await page.locator("input.new-todo").waitFor();
    const after = await browserSnapshot(page);
    if (after.items.map((item) => `${item.title}:${item.completed}`).join("|") !== "alpha:true" || after.activeCount !== 1) {
      failures.push(createFailure("reload_persists_todos", [...trace], { visible: ["alpha:true"], activeCount: 1 }, { visible: after.items.map((item) => `${item.title}:${item.completed}`), activeCount: Number.isNaN(after.activeCount) ? null : after.activeCount, localStorageKeys: after.localStorageKeys }));
    }
    if (after.route !== "/completed" || after.selectedFilter !== "Completed") failures.push(createFailure("reload_preserves_active_route", [...trace], { route: "/completed", selectedFilter: "Completed" }, { route: after.route, selectedFilter: after.selectedFilter }));
    if (errors.length) failures.push(createFailure("unhandled_browser_error", [...trace], [], errors));
    return { id: "reload-persistence", trace, before, snapshot: after };
  }));

  return { scenarios, failures };
}

function normalizeRun(run) {
  return {
    scenarios: run.scenarios,
    failures: run.failures,
  };
}

const options = parseArgs(process.argv.slice(2));
const server = await startStaticServer(options.dist);
const browser = await chromium.launch({ headless: true });
try {
  const first = await runContractOnce(browser, server.origin);
  const second = await runContractOnce(browser, server.origin);
  const deterministic = semanticHash(normalizeRun(first)) === semanticHash(normalizeRun(second));
  if (!deterministic) {
    first.failures.push(createFailure("deterministic_replay", ["repeat-contract"], semanticHash(normalizeRun(first)), semanticHash(normalizeRun(second))));
  }
  const result = {
    ok: first.failures.length === 0,
    runtime: "external-todomvc-browser",
    contractVersion: CONTRACT_VERSION,
    repository: "tastejs/todomvc",
    revision: options.revision,
    framework: options.framework,
    browser: {
      name: "chromium",
      version: browser.version(),
      serviceWorkers: "block",
      externalNetwork: "deny",
      contextPolicy: "fresh-per-scenario",
    },
    scenarioCount: first.scenarios.length,
    failureCount: first.failures.length,
    deterministicReplay: deterministic,
    scenarios: first.scenarios,
    failures: first.failures,
  };
  result.semanticHash = semanticHash({
    ...result,
    browser: { ...result.browser, version: null },
  });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
