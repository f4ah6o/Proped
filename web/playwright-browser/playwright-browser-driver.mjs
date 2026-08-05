import { chromium } from "playwright";
import { discoverAccessibleActions } from "../../protocol/accessible-action-discovery.mjs";
import { createSemanticSnapshot } from "../../protocol/dom-semantic-snapshot.mjs";
import { evaluateWebProperties } from "../../protocol/web-property-pack.mjs";
import { BROWSER_FIXTURE_HTML, FIXTURE_URL } from "./browser-fixture.mjs";

const ACTION_SELECTOR = "button,a[href],input,select,form,dialog";

export class PlaywrightBrowserDriver {
  constructor({ inputCorpus = ["", " ", "a", "ab", "invalid", "😀"], timeoutMs = 2_000 } = {}) {
    this.inputCorpus = inputCorpus;
    this.timeoutMs = timeoutMs;
    this.consoleEntries = [];
    this.routeEntries = [];
    this.disposed = false;
  }

  async launch() {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
    this.browserVersion = this.browser.version();
  }

  async createContext() {
    await this.launch();
    this.contextSequence = (this.contextSequence ?? 0) + 1;
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      viewport: { width: 960, height: 720 },
      locale: "en-US",
      timezoneId: "UTC",
      permissions: [],
    });
    this.context.setDefaultTimeout(this.timeoutMs);
    this.context.setDefaultNavigationTimeout(this.timeoutMs);

    await this.context.route("**/*", async (route) => {
      const request = route.request();
      const entry = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      };
      if (request.url() === FIXTURE_URL && request.isNavigationRequest()) {
        this.routeEntries.push({ ...entry, decision: "fulfill", source: "memory-fixture" });
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: BROWSER_FIXTURE_HTML,
          headers: {
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; connect-src https://blocked.invalid; style-src 'unsafe-inline'",
          },
        });
        return;
      }
      this.routeEntries.push({ ...entry, decision: "abort", reason: "network_denied" });
      await route.abort("blockedbyclient");
    });

    if (typeof this.context.routeWebSocket === "function") {
      await this.context.routeWebSocket("**", async (socket) => {
        this.routeEntries.push({
          url: socket.url(), method: "WEBSOCKET", resourceType: "websocket",
          decision: "abort", reason: "websocket_denied",
        });
        await socket.close({ code: 1008, reason: "network denied" });
      });
    }

    this.page = await this.context.newPage();
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

  async reset(seed = 17, fixture = "browser-fault-form") {
    if (this.context) await this.context.close();
    this.seed = seed;
    this.fixture = fixture;
    this.disposed = false;
    this.consoleEntries = [];
    this.routeEntries = [];
    await this.createContext();
    await this.page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded" });
    await this.settle();
    return this.snapshot();
  }

  async settle() {
    await this.page.waitForFunction(() =>
      window.__fixture?.ready === true && window.__fixture.state.pendingBrowserTasks === 0,
      null,
      { timeout: this.timeoutMs },
    );
    await this.page.evaluate(() => Promise.resolve());
    return {
      status: "settled",
      readiness: "window.__fixture.ready",
      pendingBrowserTasks: 0,
      networkIdleUsed: false,
    };
  }

  async domDescriptors() {
    return this.page.evaluate((selector) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const roleOf = (element) => {
        if (element.hasAttribute("role")) return element.getAttribute("role");
        const tag = element.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "form") return "form";
        if (tag === "a" && element.hasAttribute("href")) return "link";
        if (tag === "select") return "combobox";
        if (tag === "dialog") return "dialog";
        if (tag === "input") {
          return ({ checkbox: "checkbox", radio: "radio", search: "searchbox", number: "spinbutton" })[element.type] ?? "textbox";
        }
        return tag;
      };
      const nameOf = (element) => {
        const aria = element.getAttribute("aria-label");
        if (aria) return normalize(aria);
        if (element.id) {
          const label = [...document.querySelectorAll("label")]
            .find((candidate) => candidate.htmlFor === element.id);
          if (label) return normalize(label.textContent);
        }
        if (["BUTTON", "A"].includes(element.tagName)) return normalize(element.textContent);
        return normalize(element.getAttribute("name") ?? "");
      };
      const scopeOf = (element) => {
        const scopes = [];
        const dialog = element.closest("dialog");
        if (dialog && dialog !== element) scopes.push(`dialog:${nameOf(dialog)}`);
        const form = element.closest("form");
        if (form && form !== element) scopes.push(`form:${nameOf(form)}`);
        return scopes;
      };
      return [...document.querySelectorAll(selector)].map((element) => {
        const role = roleOf(element);
        const descriptor = {
          role,
          name: nameOf(element),
          within: scopeOf(element),
          hidden: element.hidden || element.getAttribute("aria-hidden") === "true" ||
            (element.tagName === "DIALOG" && !element.open),
          disabled: Boolean(element.disabled),
        };
        if (role === "checkbox" || role === "radio") descriptor.checked = Boolean(element.checked);
        if (role === "combobox" || role === "listbox") {
          descriptor.options = [...element.options].map((option) => option.textContent);
        }
        const testIdentity = element.getAttribute("data-testid");
        if (testIdentity) descriptor.testIdentity = testIdentity;
        return descriptor;
      });
    }, ACTION_SELECTOR);
  }

  async actions() {
    const discovered = discoverAccessibleActions(await this.domDescriptors(), {
      inputCorpus: this.inputCorpus,
    });
    const state = await this.page.evaluate(() => window.__fixture.snapshot());
    const synthetic = [];
    for (const request of state.pendingSearch) {
      synthetic.push({
        id: `inject|network|Search response|generation=${request.generation}|query=${JSON.stringify(request.query)}`,
        kind: "inject",
        target: { role: "status", name: "Search response" },
        input: { ...request },
        label: `Deliver search response ${request.generation}`,
        ambiguity: "none",
      });
    }
    for (const request of state.pendingSubmit) {
      synthetic.push({
        id: `inject|network|Submit response|id=${request.id}`,
        kind: "inject",
        target: { role: "status", name: "Submit response" },
        input: { ...request, effectKind: "submit" },
        label: `Complete submit ${request.id}`,
        ambiguity: "none",
      });
    }
    return {
      actions: [...discovered.actions, ...synthetic].sort((a, b) => a.id.localeCompare(b.id)),
      diagnostics: discovered.diagnostics,
    };
  }

  locatorForTarget(target) {
    let locator = this.page;
    for (const scope of target.within ?? []) {
      const separator = scope.indexOf(":");
      const role = scope.slice(0, separator);
      const name = scope.slice(separator + 1);
      locator = locator.getByRole(role, { name, exact: true });
    }
    return locator.getByRole(target.role, { name: target.name, exact: true });
  }

  async execute(action) {
    if (this.disposed || !this.page) throw new Error("Playwright browser session is disposed");
    const before = await this.snapshot();
    if (action.kind === "inject") {
      if (action.target.name === "Search response") {
        await this.page.evaluate((id) => window.__fixture.deliverSearch(id), action.input.id);
      } else if (action.target.name === "Submit response") {
        await this.page.evaluate((id) => window.__fixture.completeSubmit(id), action.input.id);
      } else {
        throw new Error(`unsupported injected effect: ${action.target.name}`);
      }
    } else {
      const locator = this.locatorForTarget(action.target);
      const count = await locator.count();
      if (count !== 1) {
        throw new Error(`target resolution expected 1 element, found ${count}: ${JSON.stringify(action.target)}`);
      }
      if (action.kind === "type") {
        const value = String(action.input);
        if (action.target.role === "spinbutton" && value !== "" && Number.isNaN(Number(value))) {
          await locator.evaluate((element, input) => {
            element.value = input;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }, value);
        } else {
          await locator.fill(value);
        }
      } else if (action.kind === "clear") await locator.fill("");
      else if (action.kind === "click") await locator.click();
      else if (action.kind === "submit") await locator.evaluate((form) => form.requestSubmit());
      else if (action.kind === "check") await locator.check();
      else if (action.kind === "uncheck") await locator.uncheck();
      else if (action.kind === "select") await locator.selectOption({ label: String(action.input) });
      else if (["confirm", "cancel", "close"].includes(action.kind)) {
        await locator.evaluate((dialog, kind) => window.__fixture.closeDialog(kind), action.kind);
      } else {
        throw new Error(`unsupported Playwright browser action: ${action.kind}`);
      }
    }
    const settle = await this.settle();
    const after = await this.snapshot();
    return {
      snapshot: after,
      violations: evaluateWebProperties({ before, action, after }),
      settle,
      emittedEffects: after.effects,
    };
  }

  async rawSnapshot() {
    return this.page.evaluate(() => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const roleOf = (element) => {
        if (!element) return "";
        if (element.hasAttribute?.("role")) return element.getAttribute("role");
        const tag = element.tagName?.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "form") return "form";
        if (tag === "a" && element.hasAttribute("href")) return "link";
        if (tag === "select") return "combobox";
        if (tag === "dialog") return "dialog";
        if (tag === "output") return "status";
        if (tag === "main") return "main";
        if (tag === "section") return "region";
        if (tag === "input") {
          return ({ checkbox: "checkbox", radio: "radio", search: "searchbox", number: "spinbutton" })[element.type] ?? "textbox";
        }
        return tag ?? "generic";
      };
      const nameOf = (element) => {
        if (!element) return "";
        const aria = element.getAttribute?.("aria-label");
        if (aria) return normalize(aria);
        if (element.id) {
          const label = [...document.querySelectorAll("label")]
            .find((candidate) => candidate.htmlFor === element.id);
          if (label) return normalize(label.textContent);
        }
        if (["BUTTON", "A"].includes(element.tagName)) return normalize(element.textContent);
        return normalize(element.getAttribute?.("name") ?? "");
      };
      const scopeOf = (element) => {
        const scopes = [];
        const dialog = element.closest?.("dialog");
        if (dialog && dialog !== element) scopes.push(`dialog:${nameOf(dialog)}`);
        const form = element.closest?.("form");
        if (form && form !== element) scopes.push(`form:${nameOf(form)}`);
        return scopes;
      };
      const semanticNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = normalize(node.textContent);
          return text ? { role: "text", text, children: [] } : null;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const attributes = Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value]));
        const children = [...node.childNodes].map(semanticNode).filter(Boolean);
        return {
          role: roleOf(node),
          name: nameOf(node),
          text: children.length === 0 ? normalize(node.textContent) : "",
          attributes,
          children,
        };
      };
      const controls = [...document.querySelectorAll("input,select")];
      const forms = controls.map((element) => ({
        identity: { role: roleOf(element), name: nameOf(element), within: scopeOf(element) },
        value: element.value,
        checked: Boolean(element.checked),
        selected: element.tagName === "SELECT"
          ? [...element.selectedOptions].map((option) => option.textContent)
          : [],
      }));
      const active = document.activeElement;
      const focus = active && active !== document.body
        ? { role: roleOf(active), name: nameOf(active), within: scopeOf(active), disabled: Boolean(active.disabled) }
        : undefined;
      return {
        url: location.href,
        semanticDom: semanticNode(document.querySelector("main")),
        forms,
        focus,
        storage: {
          local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
          session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
        },
        state: window.__fixture.snapshot(),
      };
    });
  }

  async snapshot() {
    const raw = await this.rawSnapshot();
    const pending = [
      ...raw.state.pendingSearch.map((request) => ({
        kind: "network", key: `search:${request.query}`, generation: request.generation,
      })),
      ...raw.state.pendingSubmit.map((request) => ({
        kind: "submit", key: `submit:${request.title}`, generation: Number(request.id.split("-")[1]),
      })),
    ];
    const snapshot = createSemanticSnapshot({
      url: raw.url,
      semanticDom: raw.semanticDom,
      forms: raw.forms,
      focus: raw.focus,
      storage: raw.storage,
      pending,
      effects: pending,
      console: this.consoleEntries,
      applicationState: {
        generation: raw.state.generation,
        searchQuery: raw.state.searchQuery,
        searchResults: raw.state.searchResults,
        title: raw.state.title,
        numberText: raw.state.numberText,
        numberResult: raw.state.numberResult,
        submitCount: raw.state.submitCount,
        lastNetwork: raw.state.lastNetwork,
        blockedRouteCount: this.routeEntries.filter((entry) => entry.decision === "abort").length,
      },
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
        networkPolicy: "deny-except-memory-fixture",
      },
    };
  }

  async dispose() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.context = null;
    this.page = null;
    this.browser = null;
    this.disposed = true;
    return { disposed: true };
  }
}
