import readline from "node:readline";
import { ERROR_CODES, PROTOCOL_VERSION, ProtocolError, errorResponse, okResponse, validateRequest, withTimeout } from "./ui-driver-v1.mjs";

export class JsonlDriverServer {
  constructor(driver, { timeoutMs = 5000 } = {}) {
    this.driver = driver;
    this.timeoutMs = timeoutMs;
    this.seenRequestIds = new Set();
    this.negotiated = false;
    this.disposed = false;
  }
  async handle(raw) {
    let request;
    try {
      request = validateRequest(raw);
      if (this.seenRequestIds.has(request.id)) throw new ProtocolError(ERROR_CODES.DUPLICATE_REQUEST_ID, `duplicate request id: ${request.id}`);
      this.seenRequestIds.add(request.id);
      if (!this.negotiated && request.method !== "hello") throw new ProtocolError(ERROR_CODES.NEGOTIATION_REQUIRED, "hello must be the first successful request");
      if (this.disposed && !["hello", "shutdown"].includes(request.method)) throw new ProtocolError(ERROR_CODES.DISPOSED, "driver session is disposed");
      return okResponse(request.id, await withTimeout(this.dispatch(request), this.timeoutMs, request.method));
    } catch (error) { return errorResponse(request?.id ?? raw?.id, error); }
  }
  async dispatch({ method, params }) {
    if (method === "hello") {
      this.negotiated = true;
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: this.driver.capabilities ?? ["reset", "actions", "execute", "replay", "dispose"],
        unsupportedEffects: this.driver.unsupportedEffects ?? ["network", "filesystem-write", "mail", "payment", "cloud-mutation", "native-bridge"],
      };
    }
    if (method === "reset") { this.disposed = false; return this.driver.reset(params.seed, params.fixture); }
    if (method === "actions") return this.driver.actions(params.snapshot);
    if (method === "execute") return this.driver.execute(params.action);
    if (method === "replay") return this.driver.replay(params.trace, params.expectedSignature);
    if (method === "dispose") { const result = await this.driver.dispose(); this.disposed = true; return result ?? { disposed: true }; }
    if (method === "shutdown") { if (!this.disposed) await this.driver.dispose(); this.disposed = true; return { shutdown: true }; }
    throw new ProtocolError(ERROR_CODES.UNKNOWN_METHOD, `unknown method: ${method}`);
  }
}

export async function serveJsonl(driver, options = {}) {
  const server = new JsonlDriverServer(driver, options);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); }
    catch (error) { output.write(`${JSON.stringify(errorResponse(0, new ProtocolError(ERROR_CODES.INVALID_REQUEST, `invalid JSON: ${error.message}`)))}\n`); continue; }
    const response = await server.handle(raw);
    output.write(`${JSON.stringify(response)}\n`);
    if (raw.method === "shutdown" && response.result) break;
  }
}
