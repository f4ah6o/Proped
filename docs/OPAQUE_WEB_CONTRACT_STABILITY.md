# Opaque Web contract stability

This document fixes the compatibility boundary for Proped's completed opaque-Web and actionable-finding contracts. It exists to prevent a later implementation change from silently changing the meaning of already-recorded consumer evidence.

## Versioned contract inventory

| Contract | Current version | Depends on | Existing evidence becomes invalid when |
| --- | --- | --- | --- |
| UI driver protocol | `1.0` | request/response and driver capability shape | driver-visible protocol semantics change incompatibly |
| Environment checkpoint contract | `1` | UI driver capability, opaque checkpoint/environment identities | checkpoint restore/identity/effect semantics change |
| Coverage-guided exploration | `1` | runtime fingerprint + optional environment-state identity | node identity, sibling isolation, or checkpoint replay semantics change |
| Exploration replay gate | `2` | finding identity, deterministic replay, checkpoint-aware reconstruction | replay qualification/minimality predicate changes |
| Finding group | `1` | privacy-safe strong provenance or singleton fallback | grouping identity/false-merge policy changes |
| Actionable finding | `1` | finding group + representative replay + one-minimal status | actionable/minimality projection changes |
| Real OSS actionable evidence | `1` | actionable finding, deterministic fresh campaigns | evidence schema or qualification semantics change |
| `OpaqueWebReplayV1` | `OpaqueWebReplayV1` | content-blind candidate enumeration, transition classes, fresh replay/minimization | exported field shape, action identity, transition meaning, or source minimality semantics change |
| Candidate ordering | `1` | structural DOM activation order + fixed pointer geometry | any ordinal can refer to a different structural candidate under the same state |
| `OpaqueWebRealConsumerEvidenceV1` | `OpaqueWebRealConsumerEvidenceV1` | candidate order, exact `kind + ordinal`, transition classes, source/peer minimality | accepted producer fields, fixed enums, qualification inputs, or action-vector semantics change |
| `OpaqueWebRealConsumerAcceptanceV1` | `OpaqueWebRealConsumerAcceptanceV1` | validated evidence + classification/qualification rules | classification, divergence, or production-qualification meaning changes |

## Dependency chain

The portable real-consumer proof is intentionally narrow:

`candidate ordering` -> `OpaqueWebReplayV1 action identity` -> `OpaqueWebRealConsumerEvidenceV1` -> `OpaqueWebRealConsumerAcceptanceV1`.

Checkpoint-aware exploration is orthogonal but constrains replay correctness whenever mutable environment state exists:

`UI driver protocol` -> `environment checkpoint v1` -> `coverage exploration v1` -> `exploration replay gate v2`.

The semantic finding path remains separate from opaque transition-path identity:

`finding group v1` -> `exploration replay gate v2` -> `actionable finding v1` -> `real OSS actionable evidence v1`.

A change to one path must not silently reinterpret the other. In particular, opaque path minimality is not `findingGroupId` minimality, and a peer-engine observation never inherits the source engine's `one-minimal` claim.

## Consumer producer boundary

A real-consumer producer may return only the fixed `OpaqueWebRealConsumerEvidenceV1` data shape:

- version information;
- fixed browser-engine enum for source/peer references;
- action `kind + ordinal`;
- fixed transition enum;
- bounded attempt counts;
- deterministic/fresh-context booleans;
- fixed mutable-state-isolation enum;
- fixed minimality enum;
- `consumerSpecificAdapterLoc = 0`.

The producer must not return or persist consumer/application names, URLs, selectors, text, accessibility names, screenshots or pixels, console messages, source/stack content, storage values, or application-specific metadata. The validator is exact-key/fail-closed; adding any such field is a schema failure rather than an accepted extension.

Proped CI validates fixed evidence and derived acceptance. It does not embed or launch consumer-specific runtimes.

## Longitudinal invalidation rules

Committed consumer evidence is stale and must be regenerated or explicitly migrated when any of these occurs:

- `candidateOrderVersion` changes;
- a `kind + ordinal` can address a different candidate without a version change;
- action kinds, ordinal bounds, or transition classes change;
- source replay no longer has deterministic fresh `one-minimal` semantics;
- peer observations can inherit source minimality;
- checkpoint/environment identity or sibling-isolation semantics change;
- acceptance classification or `productionQualified` semantics change;
- accepted consumer evidence fields expand;
- adapter LOC becomes non-zero;
- a pinned longitudinal semantic hash changes while its owning contract version remains unchanged.

A compatibility-breaking change requires an owning contract version bump and an explicit migration update to the longitudinal baseline. Updating only the pinned hash is not considered completion evidence.

## Hosted infrastructure versus product failure

Hosted dependency/browser setup is outside the product acceptance semantics. A runner/setup timeout or stall must be recorded as infrastructure/setup failure and must not be relabeled as a Proped contract regression. Conversely, a validator, replay, privacy, minimality, checkpoint, or aggregate-gate failure remains a product/contract failure and must not be hidden by retrying.

Retries are evidence-preserving only when the failing step is demonstrably hosted infrastructure/setup and the rerun uses the exact same revision. A product-contract failure requires investigation or a code/evidence change.
