import { launchManagedChromium, managedBrowserRuntimeDetails } from "./managed-browser-runtime.mjs";
import { captureIndexedDbInventory } from "./indexeddb-inventory.mjs";
import { enrichIndexedDbInventoryWithDexie } from "./dexie-inventory-adapter.mjs";
import { discoverAccessibleActions } from "../../protocol/accessible-action-discovery.mjs";
import { createSemanticSnapshot } from "../../protocol/dom-semantic-snapshot.mjs";
import { evaluateWebProperties } from "../../protocol/web-property-pack.mjs";
import { semanticHash } from "../../protocol/ui-driver-v1.mjs";
import { waitForSemanticQuiescence } from "../../protocol/semantic-quiescence.mjs";

const ACTION_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "form",
  "dialog",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="listbox"]',
].join(",");

function targetKey(target) {
  return JSON.stringify({
    role: target.role,
    name: target.name,
    within: target.within ?? [],
    testIdentity: target.testIdentity ?? null,
  });
}

function riskFor(action) {
  const text = `${action.target?.name ?? ""} ${action.label ?? ""}`.toLowerCase();
  if (/\b(delete account|purchase|buy|pay|send message|send email|logout|log out|sign out)\b/.test(text)) return "destructive";
  if (/\b(delete|remove|clear|archive|submit|save|create|add)\b/.test(text)) return "bounded-mutation";
  return "safe";
}

export class GenericPlaywrightBrowserDriver {
  constructor({
    url,
    inputCorpus = ["", " ", "a", "ab", "invalid", "😀"],
    timeoutMs = 5_000,
    headless = true,
    viewport = { width: 1280, height: 900 },
    locale = "en-US",
    timezoneId = "UTC",
    allowOrigins = [],
    quiescence = {},
    readyCheck = null,
    indexedDBMode = "off",
    indexedDBAdapter = null,
  } = {}) {
    if (!url) throw new Error("GenericPlaywrightBrowserDriver requires url");
    this.url = new URL(url).href;
    this.origin = new URL(this.url).origin;
    this.inputCorpus = inputCorpus;
    this.timeoutMs = timeoutMs;
    this.headless = headless;
    this.viewport = viewport;
    this.locale = locale;
    this.timezoneId = timezoneId;
    this.allowOrigins = new Set([this.origin, ...allowOrigins]);
    this.quiescence = {
      timeoutMs,
      stableSamples: 3,
      sampleIntervalMs: 25,
      ...quiescence,
    };
    this.readyCheck = readyCheck;
    if (!["off", "auto-metadata"].includes(indexedDBMode)) throw new Error(`unsupported indexedDBMode: ${indexedDBMode}`);
    this.indexedDBMode = indexedDBMode;
    if (indexedDBAdapter !== null && indexedDBAdapter?.kind !== "dexie") throw new Error(`unsupported IndexedDB adapter: ${indexedDBAdapter?.kind}`);
    this.indexedDBAdapter = indexedDBAdapter;
    this.consoleEntries = [];
    this.routeEntries = [];
    this.targetResolvers = new Map();
    this.pendingRequests = new Set();
    this.lastSettle = null;
  }

  async launch() {
    if (this.browser) return;
    this.browser = await launchManagedChromium({ headless: this.headless });
    this.browserVersion = this.browser.version();
    this.managedRuntime = managedBrowserRuntimeDetails();
  }

  async createContext() {
    await this.launch();
    this.contextSequence = (this.contextSequence ?? 0) + 1;
    this.consoleEntries = [];
    this.routeEntries = [];
    this.targetResolvers = new Map();
    this.pendingRequests = new Set();
    this.lastSettle = null;
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      viewport: this.viewport,
      locale: this.locale,
      timezoneId: this.timezoneId,
      permissions: [],
    });
    this.context.setDefaultTimeout(this.timeoutMs);
    this.context.setDefaultNavigationTimeout(this.timeoutMs);

    await this.context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const entry = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      };
      if (["data:", "blob:"].includes(requestUrl.protocol) || this.allowOrigins.has(requestUrl.origin)) {
        this.routeEntries.push({ ...entry, decision: "continue", reason: "allowed_origin" });
        await route.continue();
        return;
      }
      this.routeEntries.push({ ...entry, decision: "abort", reason: "external_network_denied" });
      await route.abort("blockedbyclient");
    });

    if (typeof this.context.routeWebSocket === "function") {
      await this.context.routeWebSocket("**", async (socket) => {
        const url = new URL(socket.url());
        if (this.allowOrigins.has(url.origin)) {
          // Playwright does not expose a generic continue primitive here. Keep the
          // campaign fail-closed instead of silently allowing an uncontrolled peer.
          this.routeEntries.push({ url: socket.url(), method: "WEBSOCKET", resourceType: "websocket", decision: "abort", reason: "websocket_requires_explicit_scheduler" });
        } else {
          this.routeEntries.push({ url: socket.url(), method: "WEBSOCKET", resourceType: "websocket", decision: "abort", reason: "external_websocket_denied" });
        }
        await socket.close({ code: 1008, reason: "Proped generic browser network policy" });
      });
    }

    this.page = await this.context.newPage();
    this.page.on("request", (request) => {
      try {
        const url = new URL(request.url());
        if (this.allowOrigins.has(url.origin) && !["data:", "blob:"].includes(url.protocol) && request.resourceType() !== "websocket") {
          this.pendingRequests.add(request);
        }
      } catch {
        // Non-standard URLs are not counted as observable same-origin work.
      }
    });
    const finishRequest = (request) => this.pendingRequests.delete(request);
    this.page.on("requestfinished", finishRequest);
    this.page.on("requestfailed", finishRequest);
    this.page.on("console", (message) => {
      this.consoleEntries.push({ kind: message.type(), message: message.text() });
    });
    this.page.on("pageerror", (error) => {
      this.consoleEntries.push({ kind: "uncaught", message: error.message });
    });
    this.page.on("download", (download) => {
      this.routeEntries.push({
        url: download.url(), method: "DOWNLOAD", resourceType: "download",
        decision: "abort", reason: "download_denied",
      });
      void download.cancel();
    });
  }

  async reset() {
    if (this.context) await this.context.close();
    await this.createContext();
    await this.page.goto(this.url, { waitUntil: "domcontentloaded" });
    this.lastSettle = await this.settle();
    return this.snapshot();
  }

  async advanceSemanticFrame() {
    await this.page.evaluate(async () => {
      await Promise.resolve();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  }

  pendingRequestCount() {
    return this.pendingRequests.size;
  }

  async indexedDbInventory() {
    if (this.indexedDBMode !== "auto-metadata") return null;
    const inventory = await captureIndexedDbInventory(this.page);
    if (this.indexedDBAdapter?.kind === "dexie") return enrichIndexedDbInventoryWithDexie(inventory, this.indexedDBAdapter);
    return inventory;
  }

  async quiescenceFingerprint() {
    const raw = await this.rawSnapshot();
    const indexedDB = await this.indexedDbInventory();
    return createSemanticSnapshot({
      url: raw.url,
      semanticDom: raw.semanticDom,
      forms: raw.forms,
      focus: raw.focus,
      storage: raw.storage,
      pending: [],
      effects: [],
      console: [],
      applicationState: indexedDB ? { indexedDB } : null,
    }).fingerprint;
  }

  async settle() {
    const readyCheck = this.readyCheck
      ? async () => Boolean(await this.readyCheck(this.page))
      : null;
    return waitForSemanticQuiescence({
      sampleFingerprint: async () => this.quiescenceFingerprint(),
      pendingCount: async () => this.pendingRequestCount(),
      advanceFrame: async () => this.advanceSemanticFrame(),
      readyCheck,
      timeoutMs: this.quiescence.timeoutMs,
      stableSamples: this.quiescence.stableSamples,
      sampleIntervalMs: this.quiescence.sampleIntervalMs,
    });
  }

  async domDescriptors() {
    return this.page.evaluate((selector) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const roleOf = (element) => {
        const explicit = element.getAttribute("role");
        if (explicit) return explicit;
        const tag = element.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "form") return "form";
        if (tag === "a" && element.hasAttribute("href")) return "link";
        if (tag === "select") return element.multiple ? "listbox" : "combobox";
        if (tag === "dialog") return "dialog";
        if (tag === "textarea") return "textbox";
        if (tag === "input") {
          return ({ checkbox: "checkbox", radio: "radio", search: "searchbox", number: "spinbutton", button: "button", submit: "button" })[element.type] ?? "textbox";
        }
        return tag;
      };
      const labelledByText = (element) => {
        const ids = normalize(element.getAttribute("aria-labelledby")).split(" ").filter(Boolean);
        return normalize(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
      };
      const associatedLabel = (element) => {
        if (element.id) {
          const explicit = [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === element.id);
          if (explicit) return normalize(explicit.textContent);
        }
        return normalize(element.closest("label")?.textContent ?? "");
      };
      const identityOf = (element) => {
        const testIdentity = normalize(element.getAttribute("data-testid"));
        const explicitTitle = normalize(element.getAttribute("title"));
        if (testIdentity && explicitTitle) return { name: explicitTitle, strategy: "test-id", confidence: 1, source: "data-testid+title" };
        const aria = normalize(element.getAttribute("aria-label"));
        if (aria) return { name: aria, strategy: "role-name", confidence: 0.99, source: "aria-label" };
        const labelled = labelledByText(element);
        if (labelled) return { name: labelled, strategy: "role-name", confidence: 0.99, source: "aria-labelledby" };
        const label = associatedLabel(element);
        if (label) return { name: label, strategy: "label", confidence: 0.98, source: "label" };
        if (["BUTTON", "A"].includes(element.tagName)) {
          const text = normalize(element.textContent);
          if (/[\p{L}\p{N}]/u.test(text)) return { name: text, strategy: "role-name", confidence: 0.98, source: "text" };
        }
        const title = normalize(element.getAttribute("title"));
        if (title) return { name: title, strategy: "role-name", confidence: 0.9, source: "title" };
        const placeholder = normalize(element.getAttribute("placeholder"));
        if (placeholder) return { name: placeholder, strategy: "placeholder", confidence: 0.9, source: "placeholder" };
        const name = normalize(element.getAttribute("name"));
        if (name) return { name, strategy: "name-attribute", confidence: 0.7, source: "name" };
        if (testIdentity) return { name: testIdentity, strategy: "test-id", confidence: 1, source: "data-testid" };
        return { name: "", strategy: "none", confidence: 0, source: "none" };
      };
      const scopeOf = (element) => {
        const scopes = [];
        for (const [tag, role] of [["dialog", "dialog"], ["form", "form"]]) {
          const scope = element.closest(tag);
          if (scope && scope !== element) {
            const identity = identityOf(scope);
            if (identity.name) scopes.push(`${role}:${identity.name}`);
          }
        }
        return scopes;
      };
      const hidden = (element) => {
        const style = getComputedStyle(element);
        const hiddenAncestor = element.closest('[hidden],[aria-hidden="true"]');
        return Boolean(hiddenAncestor) || style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0 || (element.tagName === "DIALOG" && !element.open);
      };
      return [...document.querySelectorAll(selector)].map((element) => {
        const role = roleOf(element);
        const identity = identityOf(element);
        const descriptor = {
          role,
          name: identity.name,
          within: scopeOf(element),
          hidden: hidden(element),
          disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
          locator: {
            strategy: element.getAttribute("data-testid") ? "test-id" : identity.strategy,
            confidence: element.getAttribute("data-testid") ? 1 : identity.confidence,
            source: element.getAttribute("data-testid") ? "data-testid" : identity.source,
          },
          insideForm: Boolean(element.closest("form")),
        };
        if (role === "checkbox" || role === "radio") descriptor.checked = Boolean(element.checked) || element.getAttribute("aria-checked") === "true";
        if ((role === "combobox" || role === "listbox") && element.options) {
          descriptor.options = [...element.options].map((option) => normalize(option.textContent)).filter(Boolean);
        }
        const testIdentity = normalize(element.getAttribute("data-testid"));
        if (testIdentity) descriptor.testIdentity = testIdentity;
        return descriptor;
      });
    }, ACTION_SELECTOR);
  }

  locatorFromResolver(target, resolver) {
    let base = this.page;
    for (const scope of target.within ?? []) {
      const separator = scope.indexOf(":");
      const role = scope.slice(0, separator);
      const name = scope.slice(separator + 1);
      base = base.getByRole(role, { name, exact: true });
    }
    if (target.testIdentity) return base.locator(`[data-testid=${JSON.stringify(target.testIdentity)}]`);
    if (resolver?.strategy === "placeholder") return base.getByPlaceholder(target.name, { exact: true });
    if (resolver?.strategy === "label") return base.getByLabel(target.name, { exact: true });
    if (resolver?.strategy === "name-attribute") return base.locator(`[name=${JSON.stringify(target.name)}]`);
    return base.getByRole(target.role, { name: target.name, exact: true });
  }

  async actions() {
    const descriptors = await this.domDescriptors();
    const discovered = discoverAccessibleActions(descriptors, { inputCorpus: this.inputCorpus });
    const resolverByTarget = new Map();
    for (const descriptor of descriptors) {
      if (!descriptor.name) continue;
      const key = targetKey({ role: descriptor.role, name: descriptor.name, within: descriptor.within, testIdentity: descriptor.testIdentity });
      if (!resolverByTarget.has(key)) resolverByTarget.set(key, descriptor.locator);
    }

    const diagnostics = [...discovered.diagnostics];
    const discoveredActions = [...discovered.actions];
    for (const descriptor of descriptors) {
      if (!["textbox", "searchbox", "spinbutton"].includes(descriptor.role) || !descriptor.name) continue;
      const target = { role: descriptor.role, name: descriptor.name, within: descriptor.within ?? [] };
      if (descriptor.testIdentity) target.testIdentity = descriptor.testIdentity;
      const id = `press|${target.role}|${target.name}|${(target.within ?? []).map((scope) => `within=${scope}`).join("|")}${target.testIdentity ? `|test=${target.testIdentity}` : ""}|input=${JSON.stringify("Enter")}`;
      discoveredActions.push({
        id,
        kind: "press",
        target,
        input: "Enter",
        label: `press ${target.role} "${target.name}" with "Enter"`,
        ambiguity: "none",
        destructiveRisk: "bounded-mutation",
      });
    }
    const actions = [];
    const targetMetrics = new Map();
    for (const action of discoveredActions) {
      if (action.target.role === "dialog") {
        diagnostics.push({ kind: "unsupported_generic_action", actionId: action.id, message: "generic browser mode uses dialog controls rather than invoking dialog lifecycle methods directly" });
        continue;
      }
      const key = targetKey(action.target);
      const resolver = resolverByTarget.get(key) ?? { strategy: "role-name", confidence: 0.75, source: "fallback" };
      const locator = this.locatorFromResolver(action.target, resolver);
      const count = await locator.count();
      const metric = targetMetrics.get(key) ?? { count, resolver, target: action.target };
      targetMetrics.set(key, metric);
      if (count !== 1) {
        if (!metric.reported) {
          diagnostics.push({
            kind: "ambiguous_locator",
            target: action.target,
            count,
            locatorStrategy: resolver.strategy,
            confidence: resolver.confidence,
            message: count === 0 ? "generated locator resolved no elements" : "generated locator resolved multiple elements",
          });
          metric.reported = true;
        }
        continue;
      }
      this.targetResolvers.set(key, resolver);
      actions.push({
        ...action,
        locator: { strategy: resolver.strategy, confidence: resolver.confidence, count },
        destructiveRisk: action.destructiveRisk ?? riskFor(action),
      });
    }
    const metrics = {
      descriptorCount: descriptors.length,
      actionableTargetCount: targetMetrics.size,
      uniqueLocatorTargets: [...targetMetrics.values()].filter((item) => item.count === 1).length,
      ambiguousLocatorTargets: [...targetMetrics.values()].filter((item) => item.count !== 1).length,
    };
    metrics.locatorUniqueness = metrics.actionableTargetCount === 0 ? 1 : metrics.uniqueLocatorTargets / metrics.actionableTargetCount;
    return {
      actions: actions.sort((a, b) => a.id.localeCompare(b.id)),
      diagnostics,
      metrics,
      semanticHash: semanticHash({ actions, diagnostics, metrics }),
    };
  }

  locatorForTarget(target) {
    const resolver = this.targetResolvers.get(targetKey(target));
    return this.locatorFromResolver(target, resolver);
  }

  async execute(action) {
    if (!this.page) throw new Error("generic browser session is not active");
    const before = await this.snapshot();
    const locator = this.locatorForTarget(action.target);
    const count = await locator.count();
    if (count !== 1) throw new Error(`target resolution expected exactly 1 element, found ${count}: ${JSON.stringify(action.target)}`);

    if (action.kind === "type") await locator.fill(String(action.input));
    else if (action.kind === "clear") await locator.fill("");
    else if (action.kind === "click") await locator.click();
    else if (action.kind === "submit") await locator.evaluate((form) => form.requestSubmit());
    else if (action.kind === "check") await locator.check();
    else if (action.kind === "uncheck") await locator.uncheck();
    else if (action.kind === "select") {
      if (action.target.role === "radio") await locator.check();
      else await locator.selectOption({ label: String(action.input) });
    } else if (action.kind === "press") await locator.press(String(action.input));
    else throw new Error(`unsupported generic browser action: ${action.kind}`);

    const settle = await this.settle();
    this.lastSettle = settle;
    const after = await this.snapshot();
    return {
      snapshot: after,
      settle,
      violations: evaluateWebProperties({ before, action, after }),
    };
  }

  async reload() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    this.lastSettle = await this.settle();
    return this.snapshot();
  }

  async goBack() {
    await this.page.goBack({ waitUntil: "domcontentloaded" });
    this.lastSettle = await this.settle();
    return this.snapshot();
  }

  async rawSnapshot() {
    return this.page.evaluate(() => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const roleOf = (element) => {
        if (!element) return "";
        const explicit = element.getAttribute?.("role");
        if (explicit) return explicit;
        const tag = element.tagName?.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "form") return "form";
        if (tag === "a" && element.hasAttribute("href")) return "link";
        if (tag === "select") return element.multiple ? "listbox" : "combobox";
        if (tag === "dialog") return "dialog";
        if (tag === "main") return "main";
        if (tag === "section") return "region";
        if (tag === "textarea") return "textbox";
        if (tag === "input") return ({ checkbox: "checkbox", radio: "radio", search: "searchbox", number: "spinbutton", button: "button", submit: "button" })[element.type] ?? "textbox";
        return tag ?? "generic";
      };
      const labelFor = (element) => {
        const aria = normalize(element?.getAttribute?.("aria-label"));
        if (aria) return aria;
        const labelledBy = normalize(element?.getAttribute?.("aria-labelledby"));
        if (labelledBy) {
          const text = normalize(labelledBy.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
          if (text) return text;
        }
        if (element?.id) {
          const label = [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === element.id);
          if (label) return normalize(label.textContent);
        }
        const wrapping = element?.closest?.("label");
        if (wrapping) return normalize(wrapping.textContent);
        if (["BUTTON", "A"].includes(element?.tagName)) return normalize(element.textContent);
        return normalize(element?.getAttribute?.("title") ?? element?.getAttribute?.("placeholder") ?? element?.getAttribute?.("name") ?? "");
      };
      const scopeOf = (element) => {
        const scopes = [];
        const dialog = element.closest?.("dialog");
        if (dialog && dialog !== element) {
          const name = labelFor(dialog);
          if (name) scopes.push(`dialog:${name}`);
        }
        const form = element.closest?.("form");
        if (form && form !== element) {
          const name = labelFor(form);
          if (name) scopes.push(`form:${name}`);
        }
        return scopes;
      };
      let visited = 0;
      const semanticNode = (node) => {
        if (visited >= 2_000) return null;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = normalize(node.textContent).slice(0, 512);
          if (!text) return null;
          visited += 1;
          return { role: "text", text, children: [] };
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        visited += 1;
        const attributes = {};
        for (const attribute of [...node.attributes]) {
          if (["value", "style"].includes(attribute.name)) continue;
          attributes[attribute.name] = attribute.value.slice(0, 512);
        }
        const children = [...node.childNodes].map(semanticNode).filter(Boolean);
        return { role: roleOf(node), name: labelFor(node), text: children.length === 0 ? normalize(node.textContent).slice(0, 512) : "", attributes, children };
      };
      const controls = [...document.querySelectorAll("input,textarea,select")];
      const forms = controls.map((element) => ({
        identity: { role: roleOf(element), name: labelFor(element), within: scopeOf(element) },
        value: element.value,
        checked: Boolean(element.checked),
        selected: element.tagName === "SELECT" ? [...element.selectedOptions].map((option) => normalize(option.textContent)) : [],
      }));
      const active = document.activeElement;
      const focus = active && active !== document.body
        ? { role: roleOf(active), name: labelFor(active), within: scopeOf(active), disabled: Boolean(active.disabled) || active.getAttribute?.("aria-disabled") === "true" }
        : undefined;
      const storageObject = (storage) => {
        try { return Object.fromEntries(Object.keys(storage).sort().map((key) => [key, storage.getItem(key)])); }
        catch { return {}; }
      };
      return {
        url: location.href,
        semanticDom: semanticNode(document.querySelector("main") ?? document.body),
        forms,
        focus,
        storage: { local: storageObject(localStorage), session: storageObject(sessionStorage) },
        visitedNodes: visited,
      };
    });
  }

  async snapshot() {
    const raw = await this.rawSnapshot();
    const indexedDB = await this.indexedDbInventory();
    const snapshot = createSemanticSnapshot({
      url: raw.url,
      semanticDom: raw.semanticDom,
      forms: raw.forms,
      focus: raw.focus,
      storage: raw.storage,
      pending: [],
      effects: [],
      console: this.consoleEntries,
      applicationState: indexedDB ? { indexedDB } : null,
    });
    return {
      ...snapshot,
      routes: this.routeEntries.map((entry) => ({ ...entry })),
      browser: {
        name: "chromium",
        version: this.browserVersion,
        contextSequence: this.contextSequence,
        ephemeralProfile: true,
        serviceWorkers: "block",
        networkPolicy: "same-origin-only",
        managedRuntime: { ...this.managedRuntime },
      },
      capture: { visitedNodes: raw.visitedNodes, maximumNodes: 2_000 },
      settle: this.lastSettle ? { ...this.lastSettle } : null,
      pendingRequests: this.pendingRequestCount(),
    };
  }

  async replay(actionIds, { attempts = 2 } = {}) {
    const runs = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.reset();
      const trace = [];
      let snapshot = await this.snapshot();
      for (const id of actionIds) {
        const inventory = await this.actions();
        const action = inventory.actions.find((candidate) => candidate.id === id);
        if (!action) {
          runs.push({ ok: false, missingActionId: id, trace, fingerprint: snapshot.fingerprint });
          snapshot = null;
          break;
        }
        const result = await this.execute(action);
        trace.push(id);
        snapshot = result.snapshot;
      }
      if (snapshot) runs.push({ ok: true, trace, fingerprint: snapshot.fingerprint });
    }
    const hashes = runs.filter((run) => run.ok).map((run) => run.fingerprint);
    return {
      attempts,
      runs,
      deterministic: hashes.length === attempts && new Set(hashes).size === 1,
      semanticHash: semanticHash(runs),
    };
  }

  async dispose() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.context = null;
    this.page = null;
    this.browser = null;
  }
}
