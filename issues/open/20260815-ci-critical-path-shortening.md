# CI critical-path shortening

## Context

Production-contract sharding reduced the dedicated `Production contracts` workflow from roughly 37 minutes to roughly 14 minutes. The remaining fast-feedback bottleneck is now the ordinary `CI / test` job, which was still a large serial pipeline.

Pre-change measured `CI / test` runtime was about 9m46s. The two largest serial sections were:

- `Web project quality manifest`: ~3m34s
- `Generic browser adapter tests`: ~2m17s

The quality manifest already described stage dependencies through `dependsOn`, but `runWebProject` executed every stage serially. The generic browser adapter step also launched dozens of independent Node test scripts serially.

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
   - CLI smoke / release acceptance checks
2. `web-generic`
   - Node protocol/unit/generic browser adapter test suite
   - managed browser runtime and Playwright fixture dependencies
3. `web-quality`
   - web fixture dependency install
   - `proped-web-quality` manifest validation/execution
4. `production-baseline`
   - Linux strict sandbox
   - self-contained `production` corpus baseline gate
5. final lightweight `test` aggregate job with `needs:` on the above jobs so the stable required-check name remains `test`.

The aggregate must fail when any required constituent job fails or is cancelled.

### P0 — deterministic DAG execution in web-project-runner

Replace serial manifest-stage execution with a dependency-aware scheduler:

- A stage becomes runnable only when all `dependsOn` stages have completed successfully.
- Failed dependencies produce the same `blocked` result contract as today.
- Independent ready stages may execute concurrently only when they declare non-conflicting writable workspace/build-output resources.
- Stages without an explicit resource declaration retain conservative serial behavior.
- Collect results by stage id and emit the final `stages` array in manifest order.
- Preserve stage status, payload summaries, failure clustering, duration fields, semantic hash inputs, and artifact contract.
- Add regression tests proving deterministic result ordering/hash, dependency blocking, actual concurrency for safe independent stages, and serialization for shared/undeclared resources.

For the current `proped-web-quality` graph this allows React, Vue, Playwright, Next, and Nuxt branches to overlap while keeping `cross-mode-replay` behind React/Vue/Playwright.

### P0 — reduce runner-slot contention

The original 15-way `external-matrix` consumed enough hosted-runner slots to queue the new critical CI partitions. Keep all 15 target contracts but group them into three five-target shards so `core`, `web-generic`, `web-quality`, and `production-baseline` can start together.

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

Current P0 measurements show Vitest is not on the critical path: `web-generic` is ~3m22s including ~43s dependency setup and ~2m21s of integration-heavy scripts, while `core` is ~3m15s. A Vitest dependency should therefore be introduced only with a committed deterministic package/lock context and only if the pure-test subset remains material after integration grouping; do not add dynamic `npx vitest` network bootstrap to CI.

### P1 — split generic integration groups if still critical

After P0 measurements, split remaining heavy generic browser tests by lifecycle boundary (`browser-runtime`, `campaign-corpus`, etc.) into independent Actions jobs rather than backgrounding them inside one mutable workspace. This is now a follow-up optimization rather than a blocker because the 3-5 minute fast-feedback target is already met.

### P2 — cache/setup reductions

Only after structural parallelism:

- npm caches for fixture lockfiles (initial npm cache wiring is in P0)
- Playwright browser cache keyed by Playwright revision
- Next/Nuxt build caches where deterministic and safe
- avoid redundant apt/update work when runner image already satisfies system dependencies

### P2 — production slow-shard profiling

Profile `agent-friendly-code`, currently the slowest promoted-production shard, and optimize its campaign internals separately from CI topology.

## Implemented P0

Branch validation head: `45bf7e6fca006e00e2da3eafd0f8ec49d360d21b`.

Implemented:

- split the old monolithic `test` into `core`, `web-generic`, `web-quality`, and `production-baseline`
- retained a lightweight stable `test` aggregate check
- extracted the large CLI smoke contract into `scripts/ci_cli_smoke.sh` without dropping its assertions
- added dependency-aware concurrent Web project execution with explicit `exclusiveResources`
- added async isolated-process execution and process-tree cleanup
- kept undeclared stage resources conservative/serial for backward safety
- added concurrency, deterministic-order/hash, blocked-dependency, shared-resource, and legacy-serialization regressions
- grouped the 15 external target matrix into 3 shards while retaining all 15 target checks
- restored the managed-browser precondition explicitly for native CLI integration after job splitting exposed the previous implicit dependency
- added npm cache keys for the fixture lockfiles used by the split jobs

## P0 measurements

Pre-change normal `CI / test`:

- ~9m46s
- `Web project quality manifest`: ~3m34s
- `Generic browser adapter tests`: ~2m17s

Validated push run on the P0 branch:

- stable aggregate `test`: success at about **3m53s from workflow start**
- `core`: **3m15s**
- `web-generic`: **3m22s**
  - dependency setup: ~43s
  - generic browser adapter tests: ~2m21s
- `web-quality`: **2m22s** total
  - dependency setup: ~31s
  - quality manifest execution: **1m40s**, down from ~3m34s (~53% reduction)
- `production-baseline`: **1m33s**
  - baseline gate itself: ~49s
- all three grouped external shards: success
- managed runtime matrix: success
- sandbox policy matrix: success
- legacy production-external delegation job: success

Fast-feedback reduction is approximately **60%** (9m46s -> 3m53s) while keeping the stable required-check name and existing contracts.

## Acceptance criteria

- [x] Stable aggregate `CI / test` check remains available and green.
- [x] No existing quality/release/production contract is removed.
- [x] `proped-web-quality` preserves pass/fail semantics and deterministic ordered evidence under the concurrent scheduler.
- [x] Safe independent manifest stages demonstrably overlap in CI.
- [x] Normal CI critical path is materially below the pre-change ~9m46s baseline and is within the 3-5 minute target.
- [ ] Dedicated `Production contracts` pull-request workflow passes on the final PR head.
- [x] New concurrency/sharding behavior has regression tests preventing accidental serialization or unsafe shared-workspace parallelism.

## Remaining follow-up

The P0 target is met. Keep this issue open for measured follow-up rather than adding dependencies merely for style consistency:

1. validate the dedicated `Production contracts` workflow on the PR head
2. split the remaining integration-heavy `web-generic` suite only if further fast-feedback reduction is needed
3. introduce Vitest only for a demonstrably material pure-test subset with a committed package lock
4. add Playwright/build caches where cache correctness is deterministic
5. profile the `agent-friendly-code` production shard independently
