#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { JsonlDriverServer } from "../protocol/jsonl-server.mjs";
import { ERROR_CODES, PROTOCOL_VERSION, semanticHash } from "../protocol/ui-driver-v1.mjs";
import { SyntheticStaleSearchDriver } from "../protocol/synthetic-driver.mjs";

const request = (id, method, params = {}) => ({ protocolVersion: PROTOCOL_VERSION, id, method, params });
const server = new JsonlDriverServer(new SyntheticStaleSearchDriver(), { timeoutMs: 100 });
assert.equal((await server.handle(request(1, "actions"))).error.code, ERROR_CODES.NEGOTIATION_REQUIRED);
const hello = await server.handle(request(2, "hello"));
assert.equal(hello.result.protocolVersion, PROTOCOL_VERSION);
assert.ok(hello.result.unsupportedEffects.includes("payment"));
assert.equal(hello.result.capabilities.includes("environment-checkpoints"), false, "stateless drivers must not advertise checkpoint support");
assert.equal((await server.handle(request(2, "hello"))).error.code, ERROR_CODES.DUPLICATE_REQUEST_ID);
assert.equal((await server.handle({ ...request(3, "hello"), extra: true })).error.code, ERROR_CODES.INVALID_REQUEST);
assert.equal((await server.handle({ ...request(4, "hello"), protocolVersion: "2.0" })).error.code, ERROR_CODES.VERSION_MISMATCH);
await server.handle(request(5, "reset", { seed: 7, fixture: "stale-search" }));
let actions = (await server.handle(request(6, "actions"))).result;
const typeA = actions.find((action) => action.id === "type:a");
await server.handle(request(7, "execute", { action: typeA }));
actions = (await server.handle(request(8, "actions"))).result;
const typeAb = actions.find((action) => action.id === "type:ab");
await server.handle(request(9, "execute", { action: typeAb }));
actions = (await server.handle(request(10, "actions"))).result;
const deliver1 = actions.find((action) => action.id === "deliver:1");
const trace = [typeA, typeAb, deliver1];
const replay = (await server.handle(request(11, "replay", { trace }))).result;
assert.equal(replay.reproduced, true);
assert.equal(replay.signature.failureClass, "stale-response");
assert.equal(replay.signature.semanticHash.length, 64);
const replayAgain = (await server.handle(request(12, "replay", { trace, expectedSignature: replay.signature }))).result;
assert.equal(replayAgain.signatureMatches, true);
assert.equal((await server.handle(request(13, "checkpoint"))).error.code, ERROR_CODES.UNSUPPORTED_CAPABILITY);
await server.handle(request(14, "dispose"));
assert.equal((await server.handle(request(15, "actions"))).error.code, ERROR_CODES.DISPOSED);

class CheckpointProtocolDriver extends SyntheticStaleSearchDriver {
  constructor() {
    super();
    this.environment = 0;
    this.serial = 0;
    this.checkpoints = new Map();
  }
  async checkpoint() {
    const checkpointId = `opaque:${++this.serial}`;
    this.checkpoints.set(checkpointId, this.environment);
    return { checkpointId, environmentStateId: `environment:${this.environment}` };
  }
  async restoreCheckpoint(checkpointId) {
    if (!this.checkpoints.has(checkpointId)) throw new Error(`unknown checkpoint ${checkpointId}`);
    this.environment = this.checkpoints.get(checkpointId);
    return { environmentStateId: `environment:${this.environment}` };
  }
}
const checkpointDriver = new CheckpointProtocolDriver();
const checkpointServer = new JsonlDriverServer(checkpointDriver, { timeoutMs: 100 });
const checkpointHello = (await checkpointServer.handle(request(1, "hello"))).result;
assert.ok(checkpointHello.capabilities.includes("environment-checkpoints"));
assert.ok(checkpointHello.capabilities.includes("checkpoint"));
assert.ok(checkpointHello.capabilities.includes("restoreCheckpoint"));
const checkpoint = (await checkpointServer.handle(request(2, "checkpoint"))).result;
checkpointDriver.environment = 7;
const restoredCheckpoint = (await checkpointServer.handle(request(3, "restoreCheckpoint", { checkpointId: checkpoint.checkpointId }))).result;
assert.equal(restoredCheckpoint.environmentStateId, "environment:0");
assert.equal(checkpointDriver.environment, 0);
assert.equal((await checkpointServer.handle(request(4, "restoreCheckpoint", { checkpointId: "" }))).error.code, ERROR_CODES.INVALID_REQUEST);
class SlowDriver extends SyntheticStaleSearchDriver { async actions() { await new Promise((resolve) => setTimeout(resolve, 30)); return []; } }
const slow = new JsonlDriverServer(new SlowDriver(), { timeoutMs: 5 });
await slow.handle(request(1, "hello"));
assert.equal((await slow.handle(request(2, "actions"))).error.code, ERROR_CODES.TIMEOUT);

const child = spawn(process.execPath, ["scripts/web_driver_protocol_host.mjs"], { stdio: ["pipe", "pipe", "inherit"] });
const lines = readline.createInterface({ input: child.stdout });
const pending = new Map();
lines.on("line", (line) => { const response = JSON.parse(line); pending.get(response.id)?.(response); pending.delete(response.id); });
let id = 0;
const call = (method, params = {}) => new Promise((resolve) => { const next = ++id; pending.set(next, resolve); child.stdin.write(`${JSON.stringify(request(next, method, params))}\n`); });
assert.equal((await call("hello")).result.protocolVersion, PROTOCOL_VERSION);
assert.ok((await call("reset", { seed: 7, fixture: "stale-search" })).result.fingerprint);
assert.equal((await call("shutdown")).result.shutdown, true);
child.stdin.end();
await new Promise((resolve) => child.on("exit", resolve));
console.log(JSON.stringify({
  ok: true,
  protocolVersion: PROTOCOL_VERSION,
  boundedFixture: "stale-search",
  trace: replay.signature.trace,
  failureSignature: replay.signature,
  transcriptSemanticHash: semanticHash({ hello: hello.result, signature: replay.signature }),
  checkpointCapability: checkpointHello.capabilities.includes("environment-checkpoints"),
  restoredEnvironmentStateId: restoredCheckpoint.environmentStateId,
}));
