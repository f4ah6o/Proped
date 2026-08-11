#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { benchmarkSelectorSurvival, selectorContractFromInventory } from "../protocol/web-selector-survival.mjs";

const pages = {
  "/v1": `<!doctype html><main>
    <form aria-label="Search form"><label for="query-v1">Query</label><input id="query-v1"><button data-testid="submit-search" aria-label="Search">🔎</button></form>
    <label><input type="checkbox"> Include archived</label><a href="/details">Details</a>
  </main>`,
  "/v2": `<!doctype html><main class="new-layout"><section><div class="wrapper">
    <form aria-label="Search form"><div><label for="query-renamed">Query</label><input class="field-v2" id="query-renamed"></div><button class="new-button-class" data-testid="submit-search" aria-label="Search"><span aria-hidden="true">icon</span></button></form>
    <nav><a class="link-v2" href="/details">Details</a></nav><div><label><span>Include archived</span><input class="checkbox-v2" type="checkbox"></label></div>
  </div></section></main>`,
  "/v3": `<!doctype html><main><section><form aria-label="Search form"><label for="query-v3">Query</label><input id="query-v3"><button data-testid="submit-search" aria-label="Search">Search</button></form><label><input type="checkbox"> Include archived</label><a href="/details"><span>Details</span></a></section></main>`,
  "/breaking": `<!doctype html><main><form aria-label="Lookup form"><label for="q">Search term</label><input id="q"><button aria-label="Go">Go</button></form><label><input type="checkbox"> Show deleted</label><a href="/details">Open record</a></main>`,
  "/details": `<!doctype html><main><a href="/v1">Back</a></main>`,
};
const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end(pages[request.url] ?? pages["/v1"]);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function contract(pathname) {
  const driver = new GenericPlaywrightBrowserDriver({ url: `${origin}${pathname}`, timeoutMs: 2_000, inputCorpus: ["x"] });
  try {
    await driver.reset();
    return selectorContractFromInventory(await driver.actions());
  } finally {
    await driver.dispose();
  }
}

try {
  const baseline = await contract("/v1");
  const v2 = await contract("/v2");
  const v3 = await contract("/v3");
  const breaking = await contract("/breaking");
  assert.equal(baseline.targetCount, 5);
  const stable = benchmarkSelectorSurvival(baseline, [
    { id: "wrapper-class-id-changes", contract: v2 },
    { id: "nested-text-order-changes", contract: v3 },
  ]);
  assert.equal(stable.minimumSurvivalRate, 1);
  assert.equal(stable.meanSurvivalRate, 1);
  assert.ok(stable.results.every((result) => result.survivalRate >= 0.95));

  const broken = benchmarkSelectorSurvival(baseline, [{ id: "semantic-contract-break", contract: breaking }]);
  assert.ok(broken.minimumSurvivalRate < 0.95);
  assert.ok(broken.results[0].missingTargetCount > 0);

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-selector-survival-test",
    baselineTargetCount: baseline.targetCount,
    minorRevisionMinimumSurvival: stable.minimumSurvivalRate,
    breakingRevisionSurvival: broken.minimumSurvivalRate,
    targetThreshold: 0.95,
  }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
