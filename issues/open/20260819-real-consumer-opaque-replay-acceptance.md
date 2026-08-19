# Real-consumer opaque replay acceptance

Status: open
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

- [ ] stale CI critical-path issue is closed without further optimization work.
- [ ] consumer-specific adapter LOC remains 0.
- [ ] physically unhittable structural candidates cannot be progressed by synthetic DOM activation.
- [ ] focus-only changes do not create opaque progress fingerprints.
- [ ] source/peer/consumer action vectors must match exactly by `kind + ordinal`.
- [ ] peer observation cannot inherit source one-minimality.
- [ ] real-consumer before evidence classifies as a consumer-boundary divergence without being overstated as production-qualified when freshness/isolation was not yet proven.
- [ ] real-consumer after evidence classifies as portable replay agreement and is production-qualified under fresh isolated contexts.
- [ ] privacy regression rejects arbitrary semantic fields and fixed CLI diagnostics do not echo rejected content.
- [ ] existing opaque replay, checkpoint-aware exploration, generic browser, public disclosure, and production contracts remain green.
- [ ] hosted CI and Production contracts pass on the final revision.

## Non-goals

- consumer-specific executable code;
- framework adapters;
- selectors as replay identity;
- screenshot/OCR/text/accessibility/pixel/source/storage-value inspection;
- changing existing one-minimal semantics;
- more CI/runtime optimization;
- claiming a specific application root cause from Proped evidence alone.
