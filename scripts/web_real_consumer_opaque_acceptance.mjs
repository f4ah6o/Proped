#!/usr/bin/env node
import { buildOpaqueWebRealConsumerAcceptanceV1 } from "../protocol/opaque-web-real-consumer-acceptance-v1.mjs";

const MAX_INPUT_BYTES = 256 * 1024;

function fail(code = 2) {
  console.error(JSON.stringify({ ok: false, diagnostic: "opaque_real_consumer_acceptance_invalid" }));
  process.exit(code);
}

try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail();
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const acceptance = buildOpaqueWebRealConsumerAcceptanceV1(value);
  process.stdout.write(`${JSON.stringify(acceptance)}\n`);
} catch {
  fail();
}
