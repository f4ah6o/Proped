import { failureSignature, semanticHash } from "./ui-driver-v1.mjs";

export class SyntheticStaleSearchDriver {
  constructor() {
    this.capabilities = ["reset", "actions", "execute", "replay", "dispose", "deterministic-effects"];
    this.unsupportedEffects = ["real-network", "filesystem-write", "mail", "payment", "cloud-mutation", "native-bridge"];
    this.reset(1, "stale-search");
  }
  async reset(seed = 1, fixture = "stale-search") {
    if (!Number.isSafeInteger(seed)) throw new TypeError("seed must be an integer");
    if (fixture !== "stale-search") throw new TypeError(`unknown fixture: ${fixture}`);
    this.seed = seed;
    this.fixture = fixture;
    this.state = { query: "", results: "", next: 1, pending: [] };
    return this.snapshot();
  }
  async actions() {
    const actions = ["a", "ab"].map((input) => ({ id: `type:${input}`, kind: "type", target: { role: "searchbox", name: "Search" }, input, label: `Type ${input}` }));
    for (const pending of this.state.pending) actions.push({ id: `deliver:${pending.id}`, kind: "inject", target: { role: "status", name: "Search response" }, input: pending.id, label: `Deliver ${pending.id}` });
    return actions;
  }
  async execute(action) {
    if (action.id.startsWith("type:")) {
      const id = this.state.next++;
      this.state.query = String(action.input);
      this.state.pending.push({ id, query: this.state.query });
    } else if (action.id.startsWith("deliver:")) {
      const id = Number(action.input);
      const response = this.state.pending.find((item) => item.id === id);
      if (response) {
        this.state.pending = this.state.pending.filter((item) => item.id !== id);
        this.state.results = response.query;
      }
    } else throw new TypeError(`unsupported action: ${action.id}`);
    return { snapshot: this.snapshot(), settle: { status: "settled", microtasks: 1, timers: 0, renders: 1, elapsedMs: 0 }, emittedEffects: [] };
  }
  snapshot() {
    const semantic = { query: this.state.query, results: this.state.results, pending: this.state.pending.map((item) => item.id) };
    const hash = semanticHash(semantic);
    return { fingerprint: hash, semanticDomHash: hash, dom: `<input aria-label="Search" value=${JSON.stringify(this.state.query)}><output>${this.state.results}</output>`, forms: [{ name: "Search", value: this.state.query }], effects: [], console: [], pending: this.state.pending.map((item) => ({ kind: "network-descriptor", id: item.id })), applicationState: semantic };
  }
  async replay(trace, expectedSignature = undefined) {
    await this.reset(this.seed, this.fixture);
    for (const action of trace) await this.execute(action);
    const snapshot = this.snapshot();
    const failed = this.state.results !== "" && this.state.results !== this.state.query;
    const signature = failed ? failureSignature({ fixture: this.fixture, property: "search results match latest query", failureClass: "stale-response", trace, snapshotHash: snapshot.semanticDomHash, seed: this.seed }) : null;
    return { reproduced: Boolean(signature), property: signature?.property ?? null, failureClass: signature?.failureClass ?? null, snapshot, signature, signatureMatches: expectedSignature ? expectedSignature.semanticHash === signature?.semanticHash : null };
  }
  async dispose() { this.state = null; return { disposed: true }; }
}
