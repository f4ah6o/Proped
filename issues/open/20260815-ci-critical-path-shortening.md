# CI critical-path shortening

## Context

Production-contract sharding reduced the dedicated `Production contracts` workflow from roughly 37 minutes to roughly 14 minutes. The remaining fast-feedback bottleneck is now the ordinary `CI / test` job, which is still a large serial pipeline.

Latest measured `CI / test` runtime is about 9m46s. The two largest serial sections are:

- `Web project quality manifest`: ~3m34s
- `Generic browser adapter tests`: ~2m17s

The quality manifest already describes stage dependencies through `dependsOn`, but `runWebProject` executes every stage serially. The generic browser adapter step also launches dozens of independent Node test scripts serially.

## Goal

Reduce normal CI feedback toward the 3-5 minute range without deleting coverage, weakening quality gates, changing deterministic evidence semantics, or making production checks implicit.

## Constraints

- Keep all existing checks and release/production quality contracts.
- Preserve deterministic report ordering and semantic hashes.
- Do not concurrently execute stages that can conflict through the same writable workspace/build output.
- Keep browser/process/corpus/benchmark tests isolated from lightweight unit tests.
- Keep production corpus evidence in the dedicated production workflow; self-contained production baseline remains explicit in normal CI until separately delegated with an equivalent required check.
- Prefer runner-level parallelism for integration tests with mutable process/workspace state.

## Implementation plan

### P0 — split the monolithic CI test job

Refactor `.github/workflows/ci.yml` into responsibility-oriented jobs that can run concurrently:

1. `core`
   - Rust formatting/clippy/tests/build/package checks
   - public disclosure and external harness/unit validation
   - MoonBit format/check/native/js tests
   - CLI smoke / release acceptance checks that do not require browser fixtures
2. `web-generic`
   - Node protocol/unit/generic browser adapter test suite
   - managed browser runtime and Playwright fixture dependencies
3. `web-quality`
   - web fixture dependency install
   - `proped-web-quality` manifest validation/execution
4. `production-baseline`
   - Linux strict sandbox
   - self-contained `production` corpus baseline gate
5. final lightweight `test` aggregate job with `needs:` on the above jobs so the stable required-check name can remain `test`.

The aggregate must fail when any required constituent job fails or is cancelled.

### P0 — deterministic DAG execution in web-project-runner

Replace serial manifest-stage execution with a dependency-aware scheduler:

- A stage becomes runnable only when all `dependsOn` stages have completed successfully.
- Failed dependencies produce the same `blocked` result contract as today.
- Independent ready stages may execute concurrently only when they do not share conflicting writable workspace/build-output resources.
- Collect results by stage id and emit the final `stages` array in manifest order.
- Preserve stage status, payload summaries, failure clustering, duration fields, semantic hash inputs, and artifact contract.
- Add regression tests proving deterministic result ordering/hash, dependency blocking, and actual concurrency for safe independent stages.

For the current `proped-web-quality` graph this should allow React, Vue, Playwright, Next, and Nuxt branches to overlap while keeping `cross-mode-replay` behind React/Vue/Playwright.

### P1 — adopt Vitest selectively for pure Node tests

Use Vitest only for lightweight tests with no browser/server/corpus/workspace mutation lifecycle:

- protocol/model/parser/semantic candidate tests
- normalizer/failure classifier/replay/selector/state novelty-style pure tests

Keep standalone Node scripts for:

- browser process integration
- server/process lifecycle
- onboarding/campaign/corpus
- workspace build/preparation
- production benchmark gates

Vitest is an execution/parallelization harness, not a blanket rewrite. Existing executable scripts may remain as importable test bodies where practical so CLI diagnostics stay available.

### P1 — split generic integration groups if still critical

After P0 measurements, split remaining heavy generic browser tests by lifecycle boundary (`browser-runtime`, `campaign-corpus`, etc.) into independent Actions jobs rather than backgrounding them inside one mutable workspace.

### P2 — cache/setup reductions

Only after structural parallelism:

- npm caches for fixture lockfiles
- Playwright browser cache keyed by Playwright revision
- Next/Nuxt build caches where deterministic and safe
- avoid redundant apt/update work when runner image already satisfies system dependencies

### P2 — production slow-shard profiling

Profile `agent-friendly-code`, currently the slowest promoted-production shard, and optimize its campaign internals separately from CI topology.

## Acceptance criteria

- Stable aggregate `CI / test` check remains available and green.
- No existing quality/release/production contract is removed.
- `proped-web-quality` produces equivalent pass/fail semantics and deterministic ordered evidence.
- Safe independent manifest stages demonstrably overlap in CI.
- Normal CI critical path is materially below the pre-change ~9m46s baseline; target is 3-5 minutes when hosted-runner scheduling permits.
- Production-contract workflow continues to pass unchanged.
- New concurrency/sharding behavior has regression tests preventing accidental serialization or unsafe shared-workspace parallelism.

## Measurements to record after implementation

- total `CI` wall time
- aggregate `test` completion time
- per-job duration (`core`, `web-generic`, `web-quality`, `production-baseline`)
- `proped-web-quality` wall time and per-stage durations
- any hosted-runner queue delay separately from execution time
