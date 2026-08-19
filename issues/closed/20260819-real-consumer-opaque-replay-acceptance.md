# Real-consumer opaque replay acceptance

Status: closed
Created: 2026-08-19
Priority: P0

## Context

Proped already proves unknown-project onboarding, checkpoint-aware stateful exploration, content-blind opaque Web exploration, bounded one-minimal replay, optional WebKit observation, and production corpus stability.

The missing maturity proof is not another feature. It is a versioned, consumer-neutral acceptance boundary showing that a difficult stateful Web defect can be reduced by Proped and then compared against a real consumer using only privacy-safe portable evidence.

A real consumer has already produced a content-blind before/after differential on an already-running loopback projection. The useful evidence is intentionally generic: one `kind + ordinal` vector, fixed transition classes, fresh-attempt counts, mutable-state isolation state, and source/peer minimization semantics. No consumer identifier or application content is required.

## P0 goal

Turn that evidence shape into a production contract and close the portability gap discovered by the real consumer.

Required properties:

1. consumer-specific adapter LOC in Proped remains 0;
2. source-engine replay carries the one-minimal claim;
3. cross-engine observation uses the exact same `kind + ordinal` vector but is explicitly `not-one-minimal`;
4. consumer before/after observations contain only fixed enums, bounded ordinals, attempt counts, booleans, and mutable-state isolation class;
5. classification is generic (`consumer_boundary_divergence`, `engine_family_divergence`, `peer_engine_divergence`, `portable_replay_agrees`, or `inconclusive`);
6. first divergence contains only step index, action kind/ordinal, and fixed transition classes;
7. arbitrary consumer names, URLs, selectors, text, accessibility data, screenshots/pixels, console/source data, or storage values fail validation;
8. production-qualified after evidence requires deterministic fresh contexts, at least two attempts, isolated/checkpointed mutable state, source one-minimality, and peer non-inherited minimality.

## Generic fixes allowed

The real-consumer proof exposed two generic portability defects in the opaque Playwright boundary:

- DOM `element.click()` can progress a structurally present element that a real pointer cannot hit. Portable `dom_activate` must therefore execute through a physically hittable pointer point while preserving ordinal identity.
- focus ownership is useful opaque telemetry but a focus-only change must not create a new exploration progress state or inflate a minimal replay.

Both fixes are generic and require synthetic regressions. No application-specific selector, branch, framework, or content logic may be introduced.

## Acceptance artifacts

- `OpaqueWebRealConsumerEvidenceV1`: strict input evidence contract.
- `OpaqueWebRealConsumerAcceptanceV1`: privacy-safe derived acceptance artifact.
- a consumer-neutral fixture derived from the completed real-consumer run.
- CLI/stdin ingestion with fixed privacy-safe failure diagnostics.

## Acceptance criteria

- [x] stale CI critical-path issue is closed without further optimization work.
- [x] consumer-specific adapter LOC remains 0.
- [x] physically unhittable structural candidates cannot be progressed by synthetic DOM activation.
- [x] focus-only changes do not create opaque progress fingerprints.
- [x] source/peer/consumer action vectors must match exactly by `kind + ordinal`.
- [x] peer observation cannot inherit source one-minimality.
- [x] real-consumer before evidence classifies as a consumer-boundary divergence without being overstated as production-qualified when freshness/isolation was not yet proven.
- [x] real-consumer after evidence classifies as portable replay agreement and is production-qualified under fresh isolated contexts.
- [x] privacy regression rejects arbitrary semantic fields and fixed CLI diagnostics do not echo rejected content.
- [x] existing opaque replay, checkpoint-aware exploration, generic browser, public disclosure, and production contracts remain green.
- [x] hosted CI and Production contracts pass on the final revision.

## Non-goals

- consumer-specific executable code;
- framework adapters;
- selectors as replay identity;
- screenshot/OCR/text/accessibility/pixel/source/storage-value inspection;
- changing existing one-minimal semantics;
- more CI/runtime optimization;
- claiming a specific application root cause from Proped evidence alone.


## Completion evidence — 2026-08-19

Completed on implementation revision `537347c067afefaae09bf41dd4f5a34aa3792324`. No consumer-specific executable code was added; `consumerSpecificAdapterLoc` is fixed to `0` by the acceptance validator.

The real-consumer evidence fixture preserves only the portable one-step vector `dom_activate:9` and fixed transition/attempt/isolation metadata. Chromium is deterministic across 2 fresh attempts and carries the source `one-minimal` claim. Playwright WebKit observes the exact same vector deterministically across 2 fresh attempts and is explicitly `not-one-minimal`. Consumer-before evidence is conservatively non-qualified (`attempts=1`, non-fresh, mutable-state isolation unverified) and classifies as `consumer_boundary_divergence`; consumer-after evidence is deterministic across 3 fresh isolated contexts and classifies as production-qualified `portable_replay_agrees`.

The consumer proof exposed two generic portability defects and both now have regressions: focus-only ownership changes are excluded from opaque progress fingerprint identity, and `dom_activate` executes through a physically hittable Playwright pointer point rather than DOM `element.click()`, so a covered structural candidate cannot be falsely progressed.

Local validation passed for the new real-consumer acceptance contract, content-blind opaque replay, Generic Browser, checkpoint-aware coverage exploration/replay, Web project onboarding/baseline, release gate, Production-contract delegation/sharding contracts, native workspace tests, Playwright Browser fixture, public-disclosure check, and `git diff --check`. Existing production baseline semantic hash remained `e1c22176372f104081a04ba12c343bba6422a64d6cfe1d00c2bdc22afbf738e8`.

Hosted evidence for the same implementation revision:

- GitHub Actions CI run `32244404624`: attempt 1 had a one-off Windows managed-runtime fingerprint mutation; the failed Windows job was rerun without code changes and attempt 2 completed successfully, with all CI jobs green. The new `Web generic contracts` acceptance test was green.
- GitHub Actions Production contracts run `32244404677`: the first attempt encountered a hosted-runner/setup stall in two promoted shards rather than a contract failure. After cancelling the stalled run, only the cancelled `frontier-astroship` shard and dependent aggregate required rerun; attempt 2 completed successfully with no failed jobs. The production plan's `Verify opaque real-consumer acceptance contract`, promoted/external shards, both fresh actionable-acceptance campaigns, comparison, and aggregate gate were green.

The stale CI critical-path issue was closed without further optimization work. Remaining proof breadth is intentionally tracked separately in `issues/open/20260819-real-consumer-proof-breadth.md`; this P0 is complete.
