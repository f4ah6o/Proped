# Prove actionable minimal findings on real OSS and human-facing output

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-16
Updated: 2026-08-16
Priority: P0
Depends on:
- `issues/open/20260816-project-to-actionable-minimal-finding.md`
- `issues/open/20260816-web-finding-groups-and-one-minimal-replay.md`

## Purpose

Close the remaining gap between the implemented actionable-finding pipeline and a defensible product-level claim.

The implementation at `c5fd81473d0c0c5c654fbdee145529d1d52613ae` already carries Generic Browser failures through finding identity, same-finding replay, privacy-safe provenance, deterministic representative selection, 1-minimal shrinking, campaign output, artifacts, and benchmark KPI.

The remaining proof should focus on two things that controlled fixtures alone cannot establish:

1. the complete `project -> actionable minimal finding` path works on pinned real OSS without project-specific executable adapters;
2. a developer can consume the result as one incident without manually correlating raw failure occurrences or internal artifacts.

This issue is intentionally narrower than the parent actionable-minimal-finding milestone. It is the real-world acceptance and consumability slice needed to close that milestone.

## Current evidence

Controlled end-to-end coverage already proves the generic mechanics:

- an unknown static project is onboarded through the ordinary campaign entry point;
- a deterministic browser exception is grouped into a stable finding;
- the finding reproduces across a fresh campaign with the same `findingGroupId`;
- the representative replay is deterministically reduced to `one-minimal`;
- privacy-sensitive message material and volatile localhost ports are excluded from emitted finding evidence;
- the finding survives into campaign artifacts;
- benchmark aggregation exposes actionable-finding and one-minimal metrics.

Do not replace or weaken these controlled assertions. The next evidence must complement them with real OSS behavior.

## Scope

### P0 — pinned real OSS actionable-finding acceptance

Select at least one existing pinned production/dogfood project with a deterministic browser-safety finding that has sufficiently strong project-owned provenance.

Prefer an already observed deterministic defect from the existing corpus. If none is suitable, add a narrowly controlled defect variant derived from an existing pinned real-project harness rather than introducing a new framework-specific adapter.

The acceptance run must use the ordinary production path:

`proped web campaign <project>`

and must prove all of the following in one end-to-end execution:

- normal unknown-project inspection/inference is used;
- normal dependency/build/server/browser lifecycle is used;
- no project-specific executable adapter is added;
- Generic Browser discovers the deterministic defect;
- the emitted finding has a stable `findingGroupId`;
- strong provenance is project-owned and privacy-safe;
- the emitted representative replay reproduces the same finding from a fresh/reset boundary;
- eligible replay reaches `minimality=one-minimal` within the configured deterministic evaluation budget;
- the same finding identity and representative replay are stable across a second fresh campaign;
- campaign JSON/artifacts expose the finding directly;
- checkout restoration remains clean;
- project-specific adapter LOC remains zero.

Do not create a test-only shortcut around `runUnknownWebProjectCampaign`, Generic Browser, the normal replay gate, or artifact generation.

### P0 — human-facing incident projection

Add a stable human-facing projection for actionable findings.

The projection should present one finding group as one incident and include, at minimum:

- stable finding ID;
- failure/property code;
- strong vs singleton status;
- concise privacy-safe provenance;
- occurrence count;
- minimal replay actions in deterministic order;
- original -> minimized action count;
- minimality status;
- replay/determinism status;
- explicit reason when a deterministic finding is not actionable.

The human-facing representation must be a projection of the same versioned machine-readable finding contract. It must not invent a second identity, perform probabilistic grouping, or require an LLM to decide incident membership/minimality.

Keep raw stack text, absolute filesystem paths, credentials, query values, volatile ports, and rejected diagnostic material out of human-facing output as well as stable JSON.

### P0 — controlled acceptance gate

Promote the controlled actionable-finding fixtures into an explicit required gate once the end-to-end behavior is stable.

The gate must pin at least:

- same defect reached through multiple traces -> one strong finding;
- distinct defects sharing one failure code -> distinct findings;
- removable prefix/middle action -> shrink removes it;
- one-action replay -> `one-minimal`;
- weak provenance -> explicit singleton/non-actionable result;
- same-code different-finding replay -> must not satisfy reproduction;
- budget exhaustion -> explicit non-minimal status;
- flaky occurrence -> not actionable;
- privacy redaction -> rejected material absent from JSON and human output;
- repeated fresh execution -> same finding ID and representative replay.

This gate must not reduce exploration bounds, replay attempts, property sensitivity, or existing production coverage to make the actionable-finding rate look better.

### P1 — recurring real OSS observation

Surface real OSS actionable-finding evidence in the existing benchmark/scheduled campaign history.

Record at least:

- deterministic finding groups;
- replayable finding groups;
- actionable finding groups;
- actionable finding rate;
- one-minimal finding groups/rate;
- representative actions before/after shrinking;
- strong vs singleton counts;
- provenance rejection reasons;
- actionable finding IDs gained/lost versus the previous comparable campaign;
- project-specific adapter LOC.

Keep these broad-corpus metrics observation-first until enough history exists to distinguish genuine regression from corpus drift. The controlled acceptance corpus may be gated strictly.

## Quality invariants

The following remain non-negotiable:

- `canonicalFailureClassId` compatibility is preserved;
- `findingGroupId` remains a separate deterministic contract;
- false merges are worse than conservative singleton findings;
- stable identity/minimality is never LLM-decided;
- project-specific executable adapter LOC remains zero for the real OSS acceptance target;
- no framework-specific grouping rule is added to make the target pass;
- no raw diagnostic payload enters stable artifacts or human output;
- no reduction in exploration/property/replay coverage is accepted as a KPI improvement;
- checkout restoration and sandbox contracts remain green.

## Implementation order

1. Identify a suitable pinned real OSS deterministic browser-safety finding from existing evidence.
2. Add exact real-project acceptance assertions through the ordinary campaign entry point.
3. Add/finish the human-facing incident projection from the machine-readable finding contract.
4. Pin privacy and repeatability assertions for both JSON and human output.
5. Promote controlled actionable-finding fixtures to a required gate.
6. Add recurring real OSS finding-quality observation and previous-run comparison.
7. Validate external-production and promoted-production with no unintended canonical failure-class churn.
8. Close this issue only after the real-project evidence and human-facing consumability are both demonstrated.

## Acceptance criteria

- at least one pinned real OSS project demonstrates `project -> actionable minimal finding` end to end;
- the real OSS path uses normal unknown-project onboarding and Generic Browser execution;
- no project-specific executable adapter is introduced for that target;
- the same real finding reproduces with the same `findingGroupId` across fresh campaign execution;
- its representative replay is deterministic and `one-minimal` when within budget;
- machine-readable artifacts expose the complete actionable finding without manual artifact correlation;
- human-facing output presents that finding as one incident with safe provenance and minimal replay;
- privacy-sensitive/volatile diagnostic material is absent from both output forms;
- controlled actionable-finding acceptance is a required deterministic gate;
- scheduled/benchmark evidence records actionable-finding quality and previous-run deltas;
- external-production, promoted-production, deterministic replay, canonical failure-class baseline, sandbox, checkout restoration, and adapter-LOC gates remain green.

## Exit condition

This issue is complete when the product claim below is backed by both controlled required evidence and pinned real OSS evidence:

> Give Proped an unknown supported Web project. If generic exploration discovers a deterministic browser-safety defect, Proped can return one stable, privacy-safe incident with a deterministic minimal reproduction, without project-specific executable adapter code.

At that point the parent `project -> actionable minimal finding` milestone can be evaluated for closure rather than remaining an aspirational acceptance definition.
