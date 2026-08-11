#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  emptyWebStateNoveltyHistory,
  observeWebStateNovelty,
  rankWebStateNoveltyFrontier,
  scoreWebStateNovelty,
  webRouteFamily,
  webStateNoveltyFeatures,
} from "../protocol/web-state-novelty.mjs";

function candidate({ fingerprint, url = "http://app.local/", local = {}, session = {}, indexedDB = null, actions = [], depth = 0, id }) {
  const snapshot = {
    fingerprint,
    url,
    storage: { local, session },
    applicationState: indexedDB ? { indexedDB } : null,
  };
  const inventory = { actions: actions.map(([role, name]) => ({ target: { role, name, within: [] } })) };
  return { id, depth, snapshot, inventory, features: webStateNoveltyFeatures({ snapshot, inventory }) };
}

assert.equal(webRouteFamily("https://x.test/items/123?request=abc#panel"), "/items/:id?request=:value#<fragment>");

const baseline = candidate({
  id: "baseline",
  fingerprint: "state-a",
  url: "http://app.local/items/1",
  local: { theme: "dark" },
  actions: [["button", "Save"]],
});
let history = emptyWebStateNoveltyHistory();
const first = scoreWebStateNovelty(history, baseline);
assert.ok(first.score > 0);
history = observeWebStateNovelty(history, baseline);
assert.equal(scoreWebStateNovelty(history, baseline).score, 0);

const sameShapeNewState = candidate({
  id: "same-shape-new-state",
  fingerprint: "state-b",
  url: "http://app.local/items/2",
  local: { theme: "light" },
  actions: [["button", "Save"]],
});
const newRouteAndSchema = candidate({
  id: "new-route-schema",
  fingerprint: "state-c",
  url: "http://app.local/settings?tab=storage",
  local: { theme: "dark", draft: "1" },
  indexedDB: { databases: [{ name: "app", nativeVersion: 10, stores: [{ name: "drafts", keyPath: "id", autoIncrement: false, indexes: [] }] }] },
  actions: [["button", "Save"], ["button", "Export"]],
});
const repeat = candidate({
  id: "repeat",
  fingerprint: "state-a",
  url: "http://app.local/items/999",
  local: { theme: "other" },
  actions: [["button", "Save"]],
  depth: 1,
});

const sameScore = scoreWebStateNovelty(history, sameShapeNewState);
assert.equal(sameScore.contributions.fingerprint, 10);
assert.equal(sameScore.contributions.routeFamily, 0);
assert.equal(sameScore.contributions.storageShape, 0);

const richScore = scoreWebStateNovelty(history, newRouteAndSchema);
assert.ok(richScore.score > sameScore.score);
assert.equal(richScore.contributions.routeFamily, 5);
assert.equal(richScore.contributions.storageShape, 3);
assert.equal(richScore.contributions.indexedDBShape, 4);
assert.equal(richScore.unseenActionTargetCount, 1);

const ranked = rankWebStateNoveltyFrontier(history, [repeat, sameShapeNewState, newRouteAndSchema]);
assert.deepEqual(ranked.map((entry) => entry.id), ["new-route-schema", "same-shape-new-state", "repeat"]);

const afterRich = observeWebStateNovelty(history, newRouteAndSchema);
assert.equal(scoreWebStateNovelty(afterRich, newRouteAndSchema).score, 0);
assert.ok(afterRich.actionTargets.length > history.actionTargets.length);

console.log(JSON.stringify({
  ok: true,
  runtime: "web-state-novelty-test",
  baselineScore: first.score,
  repeatedScore: scoreWebStateNovelty(history, baseline).score,
  newStateScore: sameScore.score,
  richNoveltyScore: richScore.score,
  ranked: ranked.map((entry) => entry.id),
}));
