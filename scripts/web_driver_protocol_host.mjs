#!/usr/bin/env node
import { serveJsonl } from "../protocol/jsonl-server.mjs";
import { SyntheticStaleSearchDriver } from "../protocol/synthetic-driver.mjs";

await serveJsonl(new SyntheticStaleSearchDriver(), {
  timeoutMs: Number(process.env.PROPED_DRIVER_TIMEOUT_MS ?? 5000),
});
