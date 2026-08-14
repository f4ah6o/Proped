#!/usr/bin/env node
import { evaluateReleaseGate } from "../protocol/release-gate.mjs";

try {
  const result = evaluateReleaseGate();
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.code ?? "release_gate_failed", message: error.message }));
  process.exitCode = 2;
}
