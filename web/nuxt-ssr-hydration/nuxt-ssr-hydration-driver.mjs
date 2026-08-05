import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { failureSignature, semanticHash } from "../../protocol/ui-driver-v1.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(origin, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Nuxt server exited before readiness with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/fixture?case=stable`);
      if (response.ok) return;
      lastError = new Error(`readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Nuxt server readiness timed out: ${lastError?.message ?? "unknown"}`);
}

function decodeHtml(value) {
  return String(value ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeHtml(match[1]) : null;
}

function extractServerObservation(html) {
  const mainTag = html.match(/<main\b[^>]*data-framework="nuxt"[^>]*>/)?.[0] ?? "";
  const label = decodeHtml(html.match(/<p[^>]*id="hydration-label"[^>]*>([^<]*)<\/p>/)?.[1] ?? "");
  const semantic = {
    framework: attribute(mainTag, "data-framework"),
    caseName: attribute(mainTag, "data-case"),
    serverLabel: attribute(mainTag, "data-server-label"),
    clientLabel: attribute(mainTag, "data-client-label"),
    asyncValue: attribute(mainTag, "data-async-value"),
    middlewareEntered: attribute(mainTag, "data-middleware-entered") === "true",
    serverRoute: attribute(mainTag, "data-server-route"),
    label,
  };
  return { ...semantic, semanticHash: semanticHash(semantic) };
}

function hydrationMessages(entries) {
  return entries.filter((entry) =>
    /hydration|mismatch|server-rendered|server rendered|hydration completed/i.test(entry.message),
  );
}

export class NuxtSsrHydrationDriver {
  constructor() {
    this.serverProcess = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.contextSequence = 0;
  }

  async start() {
    if (!this.serverProcess) {
      this.port = await reservePort();
      this.origin = `http://127.0.0.1:${this.port}`;
      this.serverStdout = "";
      this.serverStderr = "";
      this.serverProcess = spawn(
        process.execPath,
        [path.join(HERE, ".output/server/index.mjs")],
        {
          cwd: HERE,
          env: {
            ...process.env,
            NODE_ENV: "production",
            NITRO_HOST: "127.0.0.1",
            NITRO_PORT: String(this.port),
            NUXT_TELEMETRY_DISABLED: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      this.serverProcess.stdout.on("data", (chunk) => { this.serverStdout += chunk; });
      this.serverProcess.stderr.on("data", (chunk) => { this.serverStderr += chunk; });
      await waitForServer(this.origin, this.serverProcess);
    }
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
  }

  async reset({ caseName }) {
    await this.start();
    if (this.context) await this.context.close();
    this.contextSequence += 1;
    this.consoleEntries = [];
    this.pageErrors = [];
    this.routeEntries = [];
    this.context = await this.browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await this.context.clearPermissions();
    await this.context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const allowed = url.origin === this.origin;
      this.routeEntries.push({
        url: `${url.origin}${url.pathname}`,
        method: route.request().method(),
        resourceType: route.request().resourceType(),
        decision: allowed ? "allow-loopback-fixture" : "abort",
      });
      if (allowed) await route.continue();
      else await route.abort("blockedbyclient");
    });
    await this.context.routeWebSocket(/.*/, async (webSocketRoute) => {
      this.routeEntries.push({
        url: webSocketRoute.url(),
        resourceType: "websocket",
        decision: "close",
      });
      await webSocketRoute.close({ code: 1008, reason: "unsupported effect" });
    });
    this.page = await this.context.newPage();
    this.page.on("console", (message) => {
      this.consoleEntries.push({ kind: message.type(), message: message.text() });
    });
    this.page.on("pageerror", (error) => {
      this.pageErrors.push({ kind: "pageerror", message: error.message });
    });

    this.caseName = caseName === "mismatch" ? "mismatch" : "stable";
    this.url = `${this.origin}/fixture?case=${this.caseName}`;
    const serverResponse = await fetch(this.url);
    if (!serverResponse.ok) throw new Error(`Nuxt SSR request failed: ${serverResponse.status}`);
    this.server = extractServerObservation(await serverResponse.text());
    await this.page.goto(this.url, { waitUntil: "domcontentloaded" });
    await this.page.locator('main[data-ready="true"]').waitFor({ state: "visible" });
    await this.page.waitForFunction(() => {
      const main = document.querySelector('main[data-ready="true"]');
      const asyncText = document.querySelector('[data-testid="async-data"]')?.textContent ?? "";
      return Boolean(main && asyncText.includes("nitro-server-route"));
    });
    await this.page.waitForTimeout(100);
    return this.snapshot();
  }

  async snapshot() {
    const browserState = await this.page.evaluate(() => {
      const main = document.querySelector('main[data-framework="nuxt"]');
      const parse = (selector) => {
        const text = document.querySelector(selector)?.textContent ?? "null";
        try { return JSON.parse(text); } catch { return null; }
      };
      return {
        caseName: main?.dataset.case ?? null,
        serverLabel: main?.dataset.serverLabel ?? null,
        clientLabel: main?.dataset.clientLabel ?? null,
        label: document.getElementById("hydration-label")?.textContent ?? null,
        asyncData: parse('[data-testid="async-data"]'),
        middleware: parse('[data-testid="middleware"]'),
        serverRouteResult: parse('[data-testid="server-route-result"]'),
        local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
        session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
      };
    });
    const hydration = hydrationMessages([...this.consoleEntries, ...this.pageErrors]);
    const semantic = {
      framework: "nuxt",
      caseName: this.caseName,
      serverLabel: this.server.label,
      hydratedLabel: browserState.label,
      asyncData: browserState.asyncData,
      middleware: browserState.middleware,
      serverRouteResult: browserState.serverRouteResult,
      storage: { local: browserState.local, session: browserState.session },
      hydrationMessages: hydration.map((entry) => entry.message),
    };
    return {
      ...semantic,
      fingerprint: semanticHash(semantic),
      serverSemanticHash: this.server.semanticHash,
      serverObservation: { ...this.server },
      hydrationMismatch: this.server.label !== browserState.label,
      hydrationWarningCount: hydration.length,
      console: this.consoleEntries.map((entry) => ({ ...entry })),
      pageErrors: this.pageErrors.map((entry) => ({ ...entry })),
      routes: this.routeEntries.map((entry) => ({ ...entry })),
      browser: {
        name: "chromium",
        version: this.browser.version(),
        contextSequence: this.contextSequence,
        ephemeralProfile: true,
        serviceWorkers: "block",
        networkPolicy: "loopback-fixture-only",
      },
    };
  }

  async submitServerRoute(title = "Updated") {
    await this.page.getByLabel("Title").fill(title);
    await this.page.getByRole("button", { name: "Describe route" }).click();
    await this.page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="server-route-result"]')?.textContent ?? "";
      return text.includes('"status":"described"');
    });
    return this.snapshot();
  }

  async attemptExternalNetwork() {
    await this.page.evaluate(async () => {
      try {
        await fetch("https://blocked.invalid/nuxt-fixture");
      } catch {
        // The route policy must reject before external network access.
      }
    });
    await this.page.waitForTimeout(25);
    return this.snapshot();
  }

  buildHydrationFailure(snapshot, seed = 37) {
    const property = "hydration_warning";
    return {
      property,
      failureClass: property,
      caseName: snapshot.caseName,
      evidence: {
        serverLabel: snapshot.serverLabel,
        hydratedLabel: snapshot.hydratedLabel,
        warningCount: snapshot.hydrationWarningCount,
        messages: snapshot.hydrationMessages,
      },
      signature: failureSignature({
        fixture: `nuxt-${snapshot.caseName}`,
        property,
        failureClass: property,
        trace: [`navigate|nuxt|case=${snapshot.caseName}`],
        snapshotHash: snapshot.fingerprint,
        seed,
        normalizerVersion: "1",
      }),
    };
  }

  async dispose() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    if (this.serverProcess && this.serverProcess.exitCode == null) {
      this.serverProcess.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        this.serverProcess.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.context = null;
    this.page = null;
    this.browser = null;
    this.serverProcess = null;
    return { disposed: true };
  }
}
