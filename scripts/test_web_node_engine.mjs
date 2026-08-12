#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateNodeEngine } from "../protocol/web-node-engine.mjs";

assert.equal(evaluateNodeEngine("^24.0.0 || ^22.15.0", "v25.7.0").status, "incompatible");
assert.equal(evaluateNodeEngine("^24.0.0 || ^22.15.0", "v24.4.1").status, "compatible");
assert.equal(evaluateNodeEngine("^24.0.0 || ^22.15.0", "v22.14.9").status, "incompatible");
assert.equal(evaluateNodeEngine(">=18 <23", "v22.20.0").status, "compatible");
assert.equal(evaluateNodeEngine(">=18 <23", "v23.0.0").status, "incompatible");
assert.equal(evaluateNodeEngine("20.x", "v20.11.1").status, "compatible");
assert.equal(evaluateNodeEngine("workspace:*", "v22.0.0").status, "unknown");
assert.equal(evaluateNodeEngine(null, "v22.0.0").status, "not-declared");
console.log(JSON.stringify({ ok: true, runtime: "web-node-engine-test" }));
