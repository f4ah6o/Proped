import crypto from "node:crypto";

export const PROTOCOL_VERSION = "1.0";
export const METHODS = Object.freeze(["hello", "reset", "actions", "execute", "replay", "checkpoint", "restoreCheckpoint", "dispose", "shutdown"]);
export const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "invalid_request",
  VERSION_MISMATCH: "version_mismatch",
  DUPLICATE_REQUEST_ID: "duplicate_request_id",
  NEGOTIATION_REQUIRED: "negotiation_required",
  UNKNOWN_METHOD: "unknown_method",
  TIMEOUT: "timeout",
  DISPOSED: "disposed",
  UNSUPPORTED_EFFECT: "unsupported_effect",
  UNSUPPORTED_CAPABILITY: "unsupported_capability",
  INTERNAL_ERROR: "internal_error",
});
const REQUEST_KEYS = new Set(["protocolVersion", "id", "method", "params"]);

export class ProtocolError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.data = data;
  }
}

export function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProtocolError(ERROR_CODES.INVALID_REQUEST, "request must be an object");
  for (const key of Object.keys(value)) if (!REQUEST_KEYS.has(key)) throw new ProtocolError(ERROR_CODES.INVALID_REQUEST, `unknown request field: ${key}`);
  for (const key of REQUEST_KEYS) if (!(key in value)) throw new ProtocolError(ERROR_CODES.INVALID_REQUEST, `missing request field: ${key}`);
  if (value.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolError(ERROR_CODES.VERSION_MISMATCH, `unsupported protocol version: ${value.protocolVersion}`, { supported: [PROTOCOL_VERSION] });
  if (!Number.isSafeInteger(value.id) || value.id < 1) throw new ProtocolError(ERROR_CODES.INVALID_REQUEST, "id must be a positive safe integer");
  if (!METHODS.includes(value.method)) throw new ProtocolError(ERROR_CODES.UNKNOWN_METHOD, `unknown method: ${value.method}`);
  if (!value.params || typeof value.params !== "object" || Array.isArray(value.params)) throw new ProtocolError(ERROR_CODES.INVALID_REQUEST, "params must be an object");
  return value;
}

export function okResponse(id, result) { return { protocolVersion: PROTOCOL_VERSION, id, result }; }
export function errorResponse(id, error) {
  const protocolError = error instanceof ProtocolError ? error : new ProtocolError(ERROR_CODES.INTERNAL_ERROR, error?.message ?? String(error));
  const payload = { code: protocolError.code, message: protocolError.message };
  if (protocolError.data !== undefined) payload.data = protocolError.data;
  return { protocolVersion: PROTOCOL_VERSION, id: Number.isSafeInteger(id) && id > 0 ? id : 0, error: payload };
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function semanticHash(value) { return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function failureSignature({ fixture, property, failureClass, trace, snapshotHash, seed, normalizerVersion = "1" }) {
  const semantic = { protocolVersion: PROTOCOL_VERSION, fixture, property, failureClass, trace: trace.map((action) => action.id ?? action), snapshotHash, seed, normalizerVersion };
  return { ...semantic, semanticHash: semanticHash(semantic) };
}
export async function withTimeout(promise, timeoutMs, operation) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new ProtocolError(ERROR_CODES.TIMEOUT, `${operation} exceeded ${timeoutMs}ms`, { operation, timeoutMs })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}
