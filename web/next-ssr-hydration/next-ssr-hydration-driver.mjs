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
      throw new Error(`Next server exited before readiness with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/app-fixture?case=stable`);
      if (response.ok) return;
      lastError = new Error(`readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next server readiness timed out: ${lastError?.message ?? "unknown"}`);
}

function extractServerObservation(html) {
  const label = html.match(/<p[^>]*id="hydration-label"[^>]*>([^<]*)<\/p>/)?.[1] ?? null;
  const metadataText = html.match(/<script[^>]*id="fixture-metadata"[^>]*>(.*?)<\/script>/)?.[1] ?? "{}";
  const metadata = JSON.parse(metadataText.replaceAll("\\u003c", "<"));
  return {
    label,
    metadata,
    semanticHash: semanticHash({ label, metadata }),
  };
}

function hydrationMessages(entries) {
  return entries.filter((entry) =>
    /hydration|server rendered html|didn't match|did not match|react error #418/i.test(entry.message),
  );
}

export class NextSsrHydrationDriver {
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
        [path.join(HERE, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(this.port)],
        {
          cwd: HERE,
          env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      this.serverProcess.stdout.on("data", (chunk) => { this.serverStdout += chunk; });
      this.serverProcess.stderr.on("data", (chunk) => { this.serverStderr += chunk; });
      await waitForServer(this.origin, this.serverProcess);
    }
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
  }

  async reset({ router, caseName }) {
    await this.start();
    if (this.context) await this.context.close();
    this.contextSequence += 1;
    this.consoleEntries = [];
    this.routeEntries = [];
    this.pageErrors = [];
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

    const pathname = router === "app" ? "/app-fixture" : "/pages-fixture";
    this.url = `${this.origin}${pathname}?case=${caseName}`;
    const serverResponse = await fetch(this.url);
    if (!serverResponse.ok) throw new Error(`SSR request failed: ${serverResponse.status}`);
    this.server = extractServerObservation(await serverResponse.text());
    await this.page.goto(this.url, { waitUntil: "domcontentloaded" });
    await this.page.locator("main[data-ready=true]").waitFor({ state: "visible" });
    await this.page.waitForTimeout(100);
    this.router = router;
    this.caseName = caseName;
    return this.snapshot();
  }

  async snapshot() {
    const browserState = await this.page.evaluate(() => {
      const main = document.querySelector("main[data-ready=true]");
      const metadata = JSON.parse(document.getElementById("fixture-metadata")?.textContent ?? "{}");
      const local = Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
      const session = Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)]));
      return {
        router: main?.dataset.router ?? null,
        caseName: main?.dataset.case ?? null,
        label: document.getElementById("hydration-label")?.textContent ?? null,
        metadata,
        serverActionResult: document.querySelector('[data-testid="server-action-result"]')?.textContent ?? null,
        serverActionDiagnostic: document.querySelector('[data-testid="server-action-diagnostic"]')?.textContent ?? null,
        local,
        session,
        activeElement: document.activeElement?.textContent ?? document.activeElement?.getAttribute("aria-label") ?? null,
      };
    });
    const hydration = hydrationMessages([...this.consoleEntries, ...this.pageErrors]);
    const semantic = {
      router: this.router,
      caseName: this.caseName,
      serverLabel: this.server.label,
      hydratedLabel: browserState.label,
      metadata: browserState.metadata,
      serverActionResult: browserState.serverActionResult,
      serverActionDiagnostic: browserState.serverActionDiagnostic,
      storage: { local: browserState.local, session: browserState.session },
      hydrationMessages: hydration.map((entry) => entry.message),
    };
    return {
      ...semantic,
      fingerprint: semanticHash(semantic),
      serverSemanticHash: this.server.semanticHash,
      console: this.consoleEntries.map((entry) => ({ ...entry })),
      pageErrors: this.pageErrors.map((entry) => ({ ...entry })),
      routes: this.routeEntries.map((entry) => ({ ...entry })),
      hydrationMismatch: this.server.label !== browserState.label,
      hydrationWarningCount: hydration.length,
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

  async submitAppServerAction(title = "Updated") {
    if (this.router !== "app") throw new Error("Server Action is only supported by the App Router fixture");
    await this.page.getByLabel("Title").fill(title);
    await Promise.all([
      this.page.getByRole("button", { name: "Describe action" }).click(),
      this.page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="server-action-result"]')?.textContent ?? "";
        return text.includes('"status":"described"');
      }),
    ]);
    return this.snapshot();
  }

  async attemptPagesServerAction() {
    if (this.router !== "pages") throw new Error("Pages boundary is only available in the Pages Router fixture");
    await this.page.getByRole("button", { name: "Attempt server action" }).click();
    await this.page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="server-action-diagnostic"]')?.textContent ?? "";
      return text.includes('"attempts":1');
    });
    return this.snapshot();
  }


  async attemptExternalNetwork() {
    await this.page.evaluate(async () => {
      try {
        await fetch("https://blocked.invalid/next-fixture");
      } catch {
        // The route policy must reject before external network access.
      }
    });
    await this.page.waitForTimeout(25);
    return this.snapshot();
  }

  buildHydrationFailure(snapshot, seed = 31) {
    const property = "hydration_warning";
    return {
      property,
      failureClass: property,
      router: snapshot.router,
      caseName: snapshot.caseName,
      evidence: {
        serverLabel: snapshot.serverLabel,
        hydratedLabel: snapshot.hydratedLabel,
        warningCount: snapshot.hydrationWarningCount,
        messages: snapshot.hydrationMessages,
      },
      signature: failureSignature({
        fixture: `next-${snapshot.router}-router-${snapshot.caseName}`,
        property,
        failureClass: property,
        trace: [`navigate|next|${snapshot.router}|case=${snapshot.caseName}`],
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
      if (this.serverProcess.exitCode == null) this.serverProcess.kill("SIGKILL");
    }
    this.context = null;
    this.browser = null;
    this.serverProcess = null;
  }
}
