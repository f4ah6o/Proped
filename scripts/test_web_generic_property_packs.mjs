#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { GenericPlaywrightBrowserDriver } from "../web/playwright-browser/generic-browser-driver.mjs";
import { runGenericPropertyPacks } from "../protocol/web-generic-property-packs.mjs";

const healthyHtml = `<!doctype html><main>
<h1>Healthy</h1>
<button id="persist">Persist settings</button>
<a href="/about">About</a>
</main><script>
document.querySelector('#persist').addEventListener('click',()=>{localStorage.setItem('theme','dark');sessionStorage.setItem('tab','one')})
</script>`;

const faultyHtml = `<!doctype html><main>
<h1>Faulty</h1>
<button id="drift">Write drifting storage</button>
<button id="crash">Crash</button>
<form aria-label="Todo"><input aria-label="New todo"><button type="submit">Add</button></form>
<ul id="todos"></ul>
</main><script>
if(localStorage.getItem('ephemeral')) localStorage.removeItem('ephemeral');
document.querySelector('#drift').addEventListener('click',()=>localStorage.setItem('ephemeral','yes'));
document.querySelector('#crash').addEventListener('click',()=>{throw new Error('proped crash')});
document.querySelector('form').addEventListener('submit',(event)=>{event.preventDefault();const v=document.querySelector('input').value.trim();if(v){const li=document.createElement('li');li.textContent=v;document.querySelector('#todos').append(li)}});
</script>`;

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  if (request.url === "/healthy") response.end(healthyHtml);
  else if (request.url === "/faulty") response.end(faultyHtml);
  else if (request.url === "/about") response.end(`<!doctype html><main><h1>About</h1><a href="/healthy">Home</a></main>`);
  else response.end(healthyHtml);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function campaign(pathname) {
  const driver = new GenericPlaywrightBrowserDriver({
    url: `${origin}${pathname}`,
    timeoutMs: 3_000,
    inputCorpus: ["proped"],
  });
  try {
    return await runGenericPropertyPacks(driver, {
      packs: ["browser-safety", "navigation", "reload-persistence"],
      allowBoundedMutations: true,
      maxProbes: 10,
    });
  } finally {
    await driver.dispose();
  }
}

try {
  const healthy = await campaign("/healthy");
  assert.equal(healthy.ok, true);
  assert.equal(healthy.failures.length, 0);
  assert.equal(healthy.results.find((result) => result.id === "reload-persistence").failures.length, 0);

  const faulty = await campaign("/faulty");
  const failureCodes = new Set(faulty.failures.map((failure) => failure.code));
  const advisoryCodes = new Set(faulty.advisories.map((finding) => finding.code));
  assert.equal(faulty.ok, false);
  assert.ok(failureCodes.has("browser_uncaught_exception"));
  assert.ok(failureCodes.has("reload_persistence_storage_drift"));
  assert.ok(advisoryCodes.has("reload_state_loss_without_persistence_evidence"));

  console.log(JSON.stringify({
    ok: true,
    runtime: "web-generic-property-packs-test",
    healthyFailureCount: healthy.failures.length,
    faultyFailureCodes: [...failureCodes].sort(),
    faultyAdvisoryCodes: [...advisoryCodes].sort(),
    probeCount: faulty.metrics.probeCount,
  }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
