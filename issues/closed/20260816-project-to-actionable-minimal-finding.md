# Make project-to-actionable-minimal-finding the end-to-end quality milestone

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-16
Updated: 2026-08-16
Priority: P0
Depends on: `issues/open/20260816-web-finding-groups-and-one-minimal-replay.md`

## Purpose

Make the primary quality outcome of Proped:

`project -> actionable minimal finding`

A successful Proped campaign should not be judged only by whether an unknown project can be onboarded, explored, and replayed generically. When Proped discovers a deterministic defect, the end product should be a stable, privacy-safe, human-sized finding that contains enough evidence and a minimal replay to be acted on without reconstructing the exploration campaign manually.

This issue defines the end-to-end acceptance contract and KPI for that product outcome. It does not replace the lower-level finding identity and 1-minimal replay work; it consumes those contracts and makes them measurable at the project/campaign boundary.

## Background

Proped has already demonstrated the difficult generic-capability hypothesis:

- unknown Web projects can be inspected and onboarded without project-specific executable adapters;
- the promoted frontier is gated on 100% auto-onboarding, deterministic replay, zero human intervention, and zero project-specific adapter LOC;
- external-production and promoted-production provide pinned real-OSS regression evidence;
- Generic Browser exploration already emits deterministic failure classes and replay evidence.

The remaining product-quality gap is between "a deterministic failure was detected" and "a developer received a finding they can act on".

The existing finding-group P0 establishes the required primitives:

- stable `findingGroupId` separate from `canonicalFailureClassId`;
- conservative strong/singleton grouping;
- privacy-safe browser diagnostic provenance;
- same-finding replay semantics;
- deterministic representative selection;
- bounded deletion shrinking and `one-minimal` proof.

Those primitives are necessary but not sufficient. Proped also needs an end-to-end contract proving that a real campaign carries them through to its user-facing and machine-readable outputs without loss, ambiguity, or project-specific glue.

## Definition: actionable minimal finding

A finding is `actionable` only when all applicable requirements below hold.

### Stable identity

- has a versioned `findingGroupId`;
- identity is reproduced from a fresh campaign/replay when the underlying defect is deterministic;
- existing canonical failure-class identity remains available for regression compatibility;
- grouping fails closed rather than merging weakly evidenced incidents.

### Reproduction

- has one deterministic representative replay;
- replay is evaluated against the same finding identity, not merely the same failure code;
- replay starts from the same documented fresh/reset boundary used by the production campaign;
- replay does not depend on hidden manual setup or project-specific executable adapter code.

### Minimality

- representative replay reports original and minimized action counts;
- `minimality=one-minimal` is reported only after all one-action deletions have been checked;
- budget exhaustion or instability is explicit and never presented as minimal;
- minimized replay remains deterministic under the configured fresh replay gate.

### Diagnostic evidence

- includes privacy-safe provenance sufficient to distinguish the incident when strong provenance is available;
- does not expose raw stack text, credentials, absolute local paths, volatile ports, query values, or other rejected diagnostic material;
- preserves the failure/property code and relevant canonical failure classes;
- makes singleton/weak-evidence status explicit.

### Consumability

The normal campaign result must expose the finding without requiring a developer to correlate unrelated artifacts manually.

At minimum, machine-readable output should contain:

- `findingGroupId` and grouping version;
- strong/singleton status;
- member failure-class IDs and failure codes;
- occurrence count;
- privacy-safe provenance summary;
- representative replay;
- original/minimized action count;
- minimality status and shrink evaluation count;
- replay/determinism status.

Human-facing output should present the same finding as one incident rather than as an unexplained list of raw failure occurrences.

## End-to-end acceptance path

Validate the complete path through the same product entry point used for unknown projects:

1. materialize or prepare a pinned project under the normal corpus rules;
2. run the ordinary `proped web campaign <project>` path;
3. detect a known deterministic defect through generic exploration;
4. classify occurrences into the expected finding identity;
5. choose and shrink the deterministic representative replay;
6. emit the finding in campaign JSON/artifacts;
7. replay the emitted representative from a fresh/reset boundary;
8. verify that the same `findingGroupId` is reproduced;
9. verify one-minimality when the evaluation budget is sufficient;
10. restore the project checkout and prove project-specific executable adapter LOC remains zero.

Do not create a special test-only execution path that bypasses production campaign behavior.

## Acceptance corpus

A project with no deterministic defect cannot be required to emit a finding. Therefore the end-to-end gate must use targets with a known deterministic finding rather than interpreting "zero findings" as failure.

Use two complementary sources.

### Controlled defect fixtures

Keep a small deterministic set that pins exact expected behavior for:

- same defect reached through multiple traces;
- two distinct defects sharing one failure code;
- removable prefix/middle actions;
- a truly one-action replay;
- weak provenance requiring singleton fallback;
- shrink budget exhaustion;
- flaky/non-replayable occurrences that must not become actionable findings.

These fixtures provide exact identity/minimality assertions.

### Pinned real-project evidence

Select deterministic findings already observed in pinned real OSS production/dogfood projects, or add narrowly controlled deterministic defect variants derived from the existing real-project harnesses.

Real-project evidence must prove that the full unknown-project pipeline, browser runtime, sandbox, exploration, finding analysis, and artifacts compose correctly. It must not add project-specific executable adapters solely to satisfy the milestone.

## KPI

Add an observation-first `actionable finding` quality section to benchmark/scheduled evidence.

For projects/campaigns with deterministic candidate findings, report at least:

- deterministic finding groups discovered;
- replayable finding groups;
- actionable finding groups;
- actionable finding rate;
- one-minimal finding groups;
- one-minimal rate among replayable findings;
- representative actions before/after shrinking;
- singleton vs strong finding groups;
- privacy/provenance rejection counts by stable reason;
- project-specific adapter LOC;
- end-to-end finding regressions versus the previous comparable campaign.

Define:

`actionableFindingRate = actionable deterministic finding groups / deterministic finding groups eligible for finding analysis`

Do not count intentionally flaky/nondeterministic observations in the denominator as if they were actionable deterministic findings.

Initially keep these KPIs observation-only on broad OSS campaigns. Gate only the controlled acceptance corpus until the metric has enough history to avoid incentivizing false merges or hiding legitimate failures.

## Quality invariants

Improving this milestone must not be achieved by weakening discovery or collapsing evidence.

The following remain invariant:

- no reduction in exploration bounds merely to obtain shorter replays;
- no reduction in property packs or failure sensitivity;
- no grouping based only on shared failure code;
- no LLM-decided stable identity or minimality;
- no project-specific executable adapter introduced for an acceptance target;
- no rewriting of existing canonical failure-class IDs merely to improve consolidation metrics;
- no raw diagnostic payload added to stable artifacts;
- no claim of root cause unless independently proven.

A lower finding count is not itself success. False merges are worse than conservative singleton findings.

## Implementation order

1. Finish the dependent finding-group / same-finding replay / 1-minimal P0 contract.
2. Expose complete finding analysis through Generic Browser campaign output.
3. Add a stable machine-readable `actionable` qualification derived only from explicit deterministic criteria.
4. Add controlled end-to-end fixtures through the ordinary campaign entry point.
5. Add pinned real-project end-to-end evidence with zero project-specific adapter LOC.
6. Surface actionable-finding KPI in benchmark and scheduled OSS evidence.
7. Add regression comparison against previous campaign evidence.
8. Promote only the controlled end-to-end corpus to a required gate after deterministic behavior is demonstrated.

## Acceptance criteria

- `proped web campaign` can carry a deterministic discovered defect through to a single machine-readable finding with stable `findingGroupId`;
- the emitted representative replay reproduces that same finding from the documented fresh/reset boundary;
- eligible controlled findings reach deterministic `one-minimal` status when within budget;
- weak provenance remains explicit singleton output rather than being falsely consolidated;
- flaky or mismatched same-code failures do not qualify as actionable findings;
- human-facing output presents one incident with its minimal reproduction and safe evidence rather than requiring manual correlation of raw occurrences;
- controlled end-to-end fixtures cover identity, replay, minimality, privacy, and budget-exhaustion behavior;
- at least one pinned real-project path demonstrates the complete pipeline without project-specific executable adapter code;
- benchmark/scheduled evidence reports actionable-finding and one-minimal KPIs;
- existing external-production, promoted-production, deterministic replay, canonical failure-class baseline, sandbox, and adapter-LOC gates remain green.

## Exit condition

This issue is complete when Proped can make a defensible end-to-end claim of the following form:

> Give Proped an unknown supported Web project. If generic exploration discovers a deterministic defect, Proped can return a stable, privacy-safe finding with a deterministic minimal reproduction, without project-specific executable adapter code.

That claim must be backed by required controlled acceptance evidence plus recurring pinned real-project observation, not by documentation alone.

## Completion evidence

Completed on `main`. The project-to-actionable-minimal-finding product milestone is now covered end to end; further work should optimize production runtime rather than expand this finding contract.

- `c5fd814` added machine-readable actionable qualification, campaign projection, controlled end-to-end fixtures, finding KPI, and deterministic one-minimal replay through the ordinary `proped web campaign` path.
- `5e0b93b` added the pinned real-OSS acceptance target, privacy-safe human incident output, production/scheduled integration, checkout cleanup checks, and two-fresh-campaign stability checks.
- `ca9ab09` fixed the CI browser-path wiring for that real-OSS acceptance.
- Current production validation passes the Yarn Berry / Docusaurus real-OSS path with two fresh campaigns producing the same `findingGroupId`, the same one-minimal replay, successful checkout cleanup, privacy-safe machine/human output, and project-specific adapter LOC = 0.

The exit claim in this issue is therefore backed by both controlled acceptance and pinned real-OSS production validation.
