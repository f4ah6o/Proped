import React, { act, createRef } from "react";
import { JSDOM } from "jsdom";
import { discoverAccessibleActions } from "../../protocol/accessible-action-discovery.mjs";
import { createSemanticSnapshot } from "../../protocol/dom-semantic-snapshot.mjs";
import { evaluateWebProperties } from "../../protocol/web-property-pack.mjs";
import { FaultyReactForm } from "./react-fixture.mjs";

const ROLE_BY_INPUT_TYPE = {
  checkbox: "checkbox",
  radio: "radio",
  search: "searchbox",
  number: "spinbutton",
};

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export class ReactComponentDriver {
  constructor({ inputCorpus = ["", " ", "a", "ab", "invalid", "😀"] } = {}) {
    this.inputCorpus = inputCorpus;
    this.consoleEntries = [];
    this.latestState = null;
    this.disposed = false;
  }

  installGlobals() {
    const { window } = this.dom;
    this.previousGlobals = {};
    for (const key of [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "HTMLInputElement",
      "HTMLSelectElement",
      "Event",
      "MouseEvent",
      "Node",
    ]) {
      this.previousGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: window[key],
      });
    }
    this.previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }

  restoreGlobals() {
    for (const [key, descriptor] of Object.entries(this.previousGlobals ?? {})) {
      if (descriptor === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
    if (this.previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = this.previousActEnvironment;
    }
  }

  async reset(seed = 1, fixture = "react-fault-form") {
    if (this.root) {
      await act(async () => this.root.unmount());
      this.restoreGlobals();
    }
    this.seed = seed;
    this.fixture = fixture;
    this.disposed = false;
    this.latestState = null;
    this.consoleEntries = [];
    this.dom = new JSDOM(
      "<!doctype html><html><body><div id=\"root\"></div></body></html>",
      { url: "http://localhost/react-form?request=req-1" },
    );
    this.installGlobals();
    this.ref = createRef();
    const { createRoot } = await import("react-dom/client");
    this.root = createRoot(this.dom.window.document.getElementById("root"));
    await act(async () => {
      this.root.render(
        React.createElement(FaultyReactForm, {
          ref: this.ref,
          onState: (state) => {
            this.latestState = state;
          },
        }),
      );
      await Promise.resolve();
    });
    return this.snapshot();
  }

  roleOf(element) {
    if (element.hasAttribute("role")) return element.getAttribute("role");
    const tag = element.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "form") return "form";
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "select") return "combobox";
    if (tag === "dialog") return "dialog";
    if (tag === "input") {
      return ROLE_BY_INPUT_TYPE[element.type] ?? "textbox";
    }
    if (tag === "output") return "status";
    if (tag === "main") return "main";
    if (tag === "section") return "region";
    return tag;
  }

  accessibleName(element) {
    const aria = element.getAttribute("aria-label");
    if (aria) return normalizeText(aria);
    if (element.id) {
      const label = [...this.dom.window.document.querySelectorAll("label")].find(
        (candidate) => candidate.htmlFor === element.id,
      );
      if (label) return normalizeText(label.textContent);
    }
    if (["BUTTON", "A"].includes(element.tagName)) {
      return normalizeText(element.textContent);
    }
    return normalizeText(element.getAttribute("name") ?? "");
  }

  scopeOf(element) {
    const scopes = [];
    const dialog = element.closest("dialog");
    if (dialog && dialog !== element) {
      scopes.push(`dialog:${this.accessibleName(dialog)}`);
    }
    const form = element.closest("form");
    if (form && form !== element) {
      scopes.push(`form:${this.accessibleName(form)}`);
    }
    return scopes;
  }

  elementDescriptor(element) {
    const role = this.roleOf(element);
    const name = this.accessibleName(element);
    const descriptor = {
      role,
      name,
      within: this.scopeOf(element),
      hidden: element.hidden || element.getAttribute("aria-hidden") === "true",
      disabled: Boolean(element.disabled),
    };
    if (role === "checkbox" || role === "radio") {
      descriptor.checked = Boolean(element.checked);
    }
    if (role === "combobox" || role === "listbox") {
      descriptor.options = [...element.options].map((option) => option.textContent);
    }
    const testIdentity = element.getAttribute("data-testid");
    if (testIdentity) descriptor.testIdentity = testIdentity;
    return descriptor;
  }

  discoverDomElements() {
    return [...this.dom.window.document.querySelectorAll(
      "button,a[href],input,select,form,dialog",
    )].map((element) => this.elementDescriptor(element));
  }

  async actions() {
    const discovered = discoverAccessibleActions(this.discoverDomElements(), {
      inputCorpus: this.inputCorpus,
    });
    const synthetic = [];
    for (const request of this.latestState.pendingSearch) {
      synthetic.push({
        id: `inject|network|Search response|generation=${request.generation}|query=${JSON.stringify(request.query)}`,
        kind: "inject",
        target: { role: "status", name: "Search response" },
        input: { ...request },
        label: `Deliver search response ${request.generation}`,
        ambiguity: "none",
      });
    }
    for (const request of this.latestState.pendingSubmit) {
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
      actions: [...discovered.actions, ...synthetic].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      diagnostics: discovered.diagnostics,
    };
  }

  matchesTarget(element, target) {
    const descriptor = this.elementDescriptor(element);
    return descriptor.role === target.role &&
      descriptor.name === target.name &&
      JSON.stringify(descriptor.within ?? []) === JSON.stringify(target.within ?? []) &&
      (!target.testIdentity || descriptor.testIdentity === target.testIdentity);
  }

  findElement(target) {
    const matches = [...this.dom.window.document.querySelectorAll(
      "button,a[href],input,select,form,dialog",
    )].filter((element) => this.matchesTarget(element, target));
    if (matches.length !== 1) {
      throw new Error(`target resolution expected 1 element, found ${matches.length}: ${JSON.stringify(target)}`);
    }
    return matches[0];
  }

  setInputValue(element, value) {
    const prototype = element.tagName === "SELECT"
      ? this.dom.window.HTMLSelectElement.prototype
      : this.dom.window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("native value setter unavailable");
    setter.call(element, String(value));
    element.dispatchEvent(new this.dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new this.dom.window.Event("change", { bubbles: true }));
  }

  async execute(action) {
    if (this.disposed) throw new Error("React component session is disposed");
    const before = this.snapshot();
    await act(async () => {
      if (action.kind === "inject") {
        if (action.target.name === "Search response") {
          this.ref.current.deliverSearch(action.input.id);
        } else if (action.target.name === "Submit response") {
          this.ref.current.completeSubmit(action.input.id);
        }
      } else {
        const element = this.findElement(action.target);
        if (action.kind === "type") this.setInputValue(element, action.input);
        else if (action.kind === "clear") this.setInputValue(element, "");
        else if (action.kind === "click") element.click();
        else if (action.kind === "submit") {
          element.dispatchEvent(new this.dom.window.Event("submit", {
            bubbles: true,
            cancelable: true,
          }));
        } else if (action.kind === "check" || action.kind === "uncheck") {
          element.checked = action.kind === "check";
          element.dispatchEvent(new this.dom.window.Event("change", { bubbles: true }));
        } else if (action.kind === "select") this.setInputValue(element, action.input);
        else throw new Error(`unsupported React component action: ${action.kind}`);
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    const after = this.snapshot();
    const violations = evaluateWebProperties({ before, action, after });
    return {
      snapshot: after,
      violations,
      settle: {
        status: "settled",
        microtasks: 2,
        timers: 0,
        renders: 1,
        elapsedMs: 0,
      },
      emittedEffects: after.effects,
    };
  }

  semanticNode(element) {
    if (element.nodeType === this.dom.window.Node.TEXT_NODE) {
      const text = normalizeText(element.textContent);
      return text ? { role: "text", text, children: [] } : null;
    }
    if (element.nodeType !== this.dom.window.Node.ELEMENT_NODE) return null;
    const attributes = {};
    for (const attribute of [...element.attributes]) {
      attributes[attribute.name] = attribute.value;
    }
    const children = [...element.childNodes]
      .map((child) => this.semanticNode(child))
      .filter(Boolean);
    return {
      role: this.roleOf(element),
      name: this.accessibleName(element),
      text: children.length === 0 ? normalizeText(element.textContent) : "",
      attributes,
      children,
    };
  }

  snapshot() {
    const document = this.dom.window.document;
    const controls = [...document.querySelectorAll("input,select")];
    const forms = controls.map((element) => ({
      identity: {
        role: this.roleOf(element),
        name: this.accessibleName(element),
        within: this.scopeOf(element),
      },
      value: element.value,
      checked: Boolean(element.checked),
      selected: element.tagName === "SELECT"
        ? [...element.selectedOptions].map((option) => option.textContent)
        : [],
    }));
    const pending = [
      ...this.latestState.pendingSearch.map((request) => ({
        kind: "network",
        key: `search:${request.query}`,
        generation: request.generation,
      })),
      ...this.latestState.pendingSubmit.map((request) => ({
        kind: "submit",
        key: `submit:${request.title}`,
        generation: request.id,
      })),
    ];
    const active = document.activeElement;
    const focus = active && active !== document.body
      ? {
          role: this.roleOf(active),
          name: this.accessibleName(active),
          within: this.scopeOf(active),
        }
      : undefined;
    return createSemanticSnapshot({
      url: this.dom.window.location.href,
      semanticDom: this.semanticNode(document.querySelector("main")),
      forms,
      focus,
      storage: { local: {}, session: {} },
      pending,
      effects: pending,
      console: this.consoleEntries,
      applicationState: {
        generation: this.latestState.generation,
        searchQuery: this.latestState.searchQuery,
        searchResults: this.latestState.searchResults,
        title: this.latestState.title,
        numberText: this.latestState.numberText,
        numberResult: this.latestState.numberResult,
      },
    });
  }

  async dispose() {
    if (this.root) await act(async () => this.root.unmount());
    this.disposed = true;
    this.root = null;
    this.restoreGlobals();
    this.dom?.window.close();
    return { disposed: true };
  }
}
