# Consolidate deterministic Web findings and produce 1-minimal replays

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-16
Updated: 2026-08-16
Priority: P0

## Purpose

Turn deterministically reproducible Web failures into human-sized diagnostic incidents without weakening Proped's existing regression identity.

Keep `canonicalFailureClassId` backward compatible, add a separate trace-independent `findingGroupId`, then shrink one representative replay per strong/replayable finding while preserving that finding identity.

## Background

The current Web failure classifier already normalizes volatile IDs, route parameters, evidence shape, exception kind, and action patterns. This is appropriate for deterministic regression identity, but action patterns are part of the canonical class hash, so one underlying incident can split into multiple classes when reached through different traces.

The promoted Yarn Berry / Docusaurus baseline currently records many deterministic exception classes. Reducing the count is not itself a quality objective: false merges are worse than false splits.

There is also a mismatch in replay semantics:

- campaign replay compares canonical semantic failure classes;
- coverage-guided trace replay currently succeeds when the same failure code appears anywhere in the replayed trace.

Before adding shrinking, the trace replay predicate must be strengthened so a shorter trace cannot accidentally reproduce a different failure with the same code.

## Non-goals

- changing the meaning of existing `canonicalFailureClassId` values;
- rewriting the production baseline merely to reduce finding count;
- using an LLM to decide stable identity;
- claiming automatic root-cause proof;
- severity recalibration;
- CODEOWNERS/source ownership inference;
- project-specific grouping rules;
- gating on finding-group count or consolidation ratio.

## Identity model

Maintain three distinct identities.

1. occurrence signature
   - exact run / trace / snapshot provenance;
2. canonical failure class
   - existing deterministic regression identity;
   - action pattern remains part of the identity;
3. finding group
   - new human-facing diagnostic incident identity;
   - trace-independent only when strong provenance exists;
   - fail closed to a singleton when evidence is insufficient.

Do not change `WEB_FAILURE_CLASSIFIER_VERSION=1`. Introduce a separate `WEB_FINDING_GROUP_VERSION=1` contract.

## Conservative finding grouping v1

Start with browser-exception incidents only.

A strong group requires stable provenance such as:

- exception name/kind;
- normalized message template;
- stable project-owned source frame;
- normalized route family.

Observation channel differences such as `browser_uncaught_exception` vs `unhandled_exception` may be consolidated only when strong provenance agrees.

If strong provenance is absent, use the canonical failure class as a singleton fallback. Never merge merely because two failures share the same code.

## Diagnostic provenance

Add browser exception provenance through a channel that does not participate in the existing semantic snapshot fingerprint.

Candidate fields:

- exception name;
- normalized message template;
- top project-owned stack frame;
- normalized route family.

Before stable persistence/hash input:

- remove localhost origin and ephemeral ports;
- remove URL query/fragment values;
- normalize UUID/timestamp/runtime IDs;
- reject absolute filesystem paths;
- convert project source to project-relative paths;
- collapse non-project sources to an external marker;
- never hash raw stack text directly.

## Replay predicate

Strengthen coverage exploration replay from:

`same failure code occurred`

to:

`same findingGroupId occurred`.

The observed finding identity must be recomputed from the actually reproduced violation and the replayed trace prefix. A different failure with the same code must not satisfy replay.

## 1-minimal replay

For each strong/replayable finding group, choose a deterministic representative:

1. shortest original trace;
2. canonical trace lexical order;
3. canonical failure class ID.

Apply bounded deletion shrinking. A deletion is accepted only when the candidate trace reproduces the same `findingGroupId`.

After reaching a fixed point, verify that deleting any single remaining action no longer reproduces the same finding. Only then report `minimality=one-minimal`.

Use an evaluation-count budget rather than wall-clock time for identity/minimality decisions. Budget exhaustion must be explicit and must not be reported as one-minimal.

## Output contract

Add a versioned finding analysis containing at least:

- `findingGroupId`;
- grouping version;
- strong/singleton status;
- member canonical failure class IDs;
- member failure codes;
- occurrence count;
- privacy-safe provenance summary;
- deterministic representative replay;
- original/minimized trace length;
- minimality status;
- shrink evaluation count.

Keep existing `candidateFailures`, `failures`, and canonical failure class outputs intact.

## Benchmark KPI

Add observation-only finding quality metrics to scheduled OSS evidence:

- failure class count;
- finding group count;
- strong group count;
- singleton group count;
- replayable group count;
- one-minimal group count/rate;
- representative trace actions before/after.

Do not threshold finding-group count or consolidation ratio.

## Tests

Pin at least these cases:

- same exception provenance + different volatile input/trace => same finding group;
- same failure code + different project source frame => different finding groups;
- same frame + materially different normalized message => different finding groups;
- insufficient provenance => singleton;
- same code but different finding appears during trace replay => replay must fail;
- removable prefix/middle action => shrink removes it;
- every one-action deletion breaks the same finding => `one-minimal`;
- budget exhaustion => explicit non-minimal status;
- repeated execution => same group ID, representative trace, and semantic hash.

## Backward compatibility

- do not change existing canonical failure class identity;
- do not rewrite promoted-production baseline v1 without an explicit compatibility decision;
- do not weaken production/promoted gates;
- keep project-specific executable adapter LOC at zero.

## Implementation order

1. Introduce conservative `findingGroupId` v1 as a separate contract.
2. Strengthen coverage exploration replay to same-finding identity.
3. Add privacy-safe browser diagnostic provenance outside semantic snapshot fingerprinting.
4. Add bounded 1-minimal deletion shrink for representative traces.
5. Expose finding analysis in Generic Browser output.
6. Add observation-only benchmark KPI and scheduled evidence.
7. Validate on promoted-production without canonical failure-class churn.

## Acceptance criteria

- `findingGroupId` is a versioned contract separate from canonical failure classes;
- insufficient exception provenance fails closed to singleton grouping;
- exploration replay uses same-finding rather than same-code matching;
- replayable strong findings can produce deterministic 1-minimal representatives;
- false-merge guard fixtures are green;
- existing production failure-class baseline has no unintended churn;
- scheduled OSS evidence exposes finding-quality KPI;
- external-production, promoted-production, deterministic replay, adapter LOC, and current CI gates remain green.

## Follow-up

After the identity/replay/minimality contract is stable, add likely-cause explanation, severity calibration, source ownership projection, and optional LLM summaries as annotations on `findingGroupId`. These annotations must never decide stable identity or quality-gate outcomes.
