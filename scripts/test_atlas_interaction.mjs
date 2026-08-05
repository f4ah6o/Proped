#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path = process.argv[2];
if (!path) throw new Error('usage: test_atlas_interaction.mjs <atlas.html>');
const html = fs.readFileSync(path, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'Atlas interaction script is missing');
assert.match(html, /<iframe class="preview" sandbox[^>]+srcdoc="/, 'preview must remain sandboxed');

class ClassList {
  constructor() { this.values = new Set(); }
  toggle(name, active) { active ? this.values.add(name) : this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}
class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.hidden = false;
    this.attrs = new Map();
    this.classList = new ClassList();
    this.listeners = new Map();
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  dispatch(name, event = {}) {
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }
}
const attrs = (name) => [...html.matchAll(new RegExp(`${name}="([^"]+)"`, 'g'))].map((m) => m[1]);
const nodeIds = attrs('data-flow-node');
const edgeIds = attrs('data-flow-edge');
assert.ok(nodeIds.length > 0, 'expected at least one state node');
assert.ok(edgeIds.length > 0, 'expected at least one transition edge');
const graphItems = [
  ...nodeIds.map((id) => new Element({ flowNode: id })),
  ...edgeIds.map((id) => new Element({ flowEdge: id })),
];
const cards = [
  ...attrs('data-detail-id').map((id) => new Element({
    detailKind: id.startsWith('transition-') ? 'edge' : 'node', detailId: id,
  })),
];
for (const card of cards) card.hidden = true;
const empty = new Element();
const localeButtons = [new Element({ locale: 'en' }), new Element({ locale: 'ja' })];
const languageItems = [new Element({ lang: 'en' }), new Element({ lang: 'ja' })];
languageItems[1].hidden = true;
const selectNodeButtons = [new Element({ selectNode: nodeIds.at(-1) })];
const selectEdgeButtons = [new Element({ selectEdge: edgeIds[0] })];
const selectorMap = new Map([
  ['[data-flow-node],[data-flow-edge]', graphItems],
  ['[data-detail-kind][data-detail-id]', cards],
  ['[data-select-node]', selectNodeButtons],
  ['[data-select-edge]', selectEdgeButtons],
  ['[data-locale]', localeButtons],
  ['[data-lang]', languageItems],
]);
const document = {
  documentElement: { lang: 'en' },
  querySelectorAll(selector) { return selectorMap.get(selector) ?? []; },
  getElementById(id) { return id === 'inspector-empty' ? empty : null; },
};
vm.runInNewContext(scriptMatch[1], { document, Array, console });

const firstNode = graphItems.find((item) => item.dataset.flowNode);
assert.equal(firstNode.getAttribute('aria-pressed'), 'true', 'first state should be selected initially');
assert.ok(firstNode.classList.contains('is-selected'));
assert.equal(empty.hidden, true);

const edge = graphItems.find((item) => item.dataset.flowEdge);
edge.dispatch('click');
assert.equal(edge.getAttribute('aria-pressed'), 'true', 'click should select transition');
assert.ok(edge.classList.contains('is-selected'));
assert.equal(firstNode.getAttribute('aria-pressed'), 'false');
assert.ok(cards.some((card) => card.dataset.detailKind === 'edge' && !card.hidden));

let prevented = false;
firstNode.dispatch('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
assert.ok(prevented, 'keyboard activation should prevent default');
assert.equal(firstNode.getAttribute('aria-pressed'), 'true');

localeButtons[1].dispatch('click');
assert.equal(document.documentElement.lang, 'ja');
assert.equal(localeButtons[1].getAttribute('aria-pressed'), 'true');
assert.equal(localeButtons[0].getAttribute('aria-pressed'), 'false');
assert.equal(languageItems[0].hidden, true);
assert.equal(languageItems[1].hidden, false);

selectEdgeButtons[0].dispatch('click');
assert.equal(edge.getAttribute('aria-pressed'), 'true', 'failure trace link should select transition');
selectNodeButtons[0].dispatch('click');
assert.ok(graphItems.some((item) => item.dataset.flowNode === nodeIds.at(-1) && item.getAttribute('aria-pressed') === 'true'));
console.log(JSON.stringify({ ok: true, nodes: nodeIds.length, edges: edgeIds.length, locale: document.documentElement.lang }));
