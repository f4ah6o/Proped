#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { PROTOCOL_VERSION, ProtocolError, ERROR_CODES, errorResponse, okResponse, validateRequest } from '../protocol/ui-driver-v1.mjs';

const timeoutMs = Number(process.env.PROPED_NATIVE_HOST_TIMEOUT_MS ?? 15000);
let negotiated = false;
let disposed = false;
const seen = new Set();

function runMoon(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('moon', ['run', 'src/web_native_host', '--', ...args], { cwd: process.cwd(), stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new ProtocolError(ERROR_CODES.TIMEOUT, `native core exceeded ${timeoutMs}ms`)); }, timeoutMs);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new ProtocolError(ERROR_CODES.INTERNAL_ERROR, `native core exited ${code}`, { stderr: err.trim() }));
      try { resolve(JSON.parse(out.trim())); } catch (e) { reject(new ProtocolError(ERROR_CODES.INTERNAL_ERROR, `invalid native core JSON: ${e.message}`, { stdout: out })); }
    });
  });
}

async function handle(raw) {
  let req;
  try {
    req = validateRequest(raw);
    if (seen.has(req.id)) throw new ProtocolError(ERROR_CODES.DUPLICATE_REQUEST_ID, `duplicate request id: ${req.id}`);
    seen.add(req.id);
    if (!negotiated && req.method !== 'hello') throw new ProtocolError(ERROR_CODES.NEGOTIATION_REQUIRED, 'hello must be first');
    if (disposed && !['hello','shutdown'].includes(req.method)) throw new ProtocolError(ERROR_CODES.DISPOSED, 'host disposed');
    if (req.method === 'hello') { negotiated = true; return okResponse(req.id, { protocolVersion: PROTOCOL_VERSION, capabilities: ['explore','replay','dispose'], core: 'moonbit-native', unsupportedEffects: ['network','filesystem-write','mail','payment','cloud-mutation','native-bridge'] }); }
    if (req.method === 'reset') { disposed = false; return okResponse(req.id, { fixture: req.params.fixture, seed: req.params.seed, isolated: true }); }
    if (req.method === 'actions') return okResponse(req.id, { diagnostic: 'native host owns exploration; action enumeration belongs to external driver' });
    if (req.method === 'execute') throw new ProtocolError(ERROR_CODES.UNSUPPORTED_EFFECT, 'execute is driver-owned; use replay for native core verification');
    if (req.method === 'replay') {
      const ids = (req.params.trace ?? []).map(a => typeof a === 'string' ? a : a.id);
      const result = await runMoon(['replay', ...ids]);
      const signature = { protocolVersion: PROTOCOL_VERSION, fixture: result.fixture, property: result.property, failureClass: result.failureClass, trace: result.trace, fingerprint: result.fingerprint, semanticHash: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex') };
      return okResponse(req.id, { ...result, failureSignature: signature });
    }
    if (req.method === 'dispose') { disposed = true; return okResponse(req.id, { disposed: true }); }
    if (req.method === 'shutdown') { disposed = true; return okResponse(req.id, { shutdown: true }); }
    throw new ProtocolError(ERROR_CODES.UNKNOWN_METHOD, `unknown method ${req.method}`);
  } catch (e) { return errorResponse(req?.id ?? raw?.id, e); }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let raw;
  try { raw = JSON.parse(line); } catch (e) { console.log(JSON.stringify(errorResponse(0, new ProtocolError(ERROR_CODES.INVALID_REQUEST, `invalid JSON: ${e.message}`)))); continue; }
  const res = await handle(raw);
  console.log(JSON.stringify(res));
  if (raw.method === 'shutdown' && res.result) break;
}
