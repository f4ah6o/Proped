# Production runtime: real-OSS actionable acceptance critical path

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-16
Updated: 2026-08-16
Priority: P0

## Current critical path

The current `Production contracts` workflow is approximately 26m48s.

For the Yarn Berry / Docusaurus shard:

- normal promoted-production shard: approximately 8m29s;
- subsequent pinned real-OSS actionable-finding acceptance: approximately 16m41s.

The previous assumption that the agent-friendly production target is the dominant critical path is therefore obsolete. The real-OSS actionable acceptance is now the primary production runtime bottleneck.

## Acceptance invariants

Do not shorten the gate by weakening the acceptance contract. Keep all of the following:

- two fresh campaigns;
- the same expected `findingGroupId` across both campaigns;
- the same deterministic representative replay;
- `minimality=one-minimal`;
- same-finding replay rather than same failure code;
- checkout restore/verification between campaigns and after the gate;
- privacy-safe machine-readable and human-facing finding output;
- project-specific executable adapter LOC = 0;
- ordinary `proped web campaign` production behavior rather than a special test-only campaign path.

## First step: measure phase timing

Before changing execution semantics, expose observation-only timing for the acceptance path.

The acceptance output should distinguish:

1. initial checkout verification;
2. first baseline capture;
3. first fresh campaign total;
4. first checkout cleanup;
5. fresh-boundary checkout verification;
6. second baseline capture;
7. second fresh campaign total;
8. second checkout cleanup;
9. final checkout verification.

Each fresh campaign should additionally expose the already-measured production stage durations (`project-build`, `generic-browser`, and any future stages) plus campaign-internal timings for inspect/infer, runtime/readiness, dependency preparation, workspace preparation, manifest compile, sandbox preparation, and project run. The acceptance wrapper should retain the residual time outside measured stages as a cross-check. Timing must not participate in semantic hashes or deterministic finding identity.

## Reuse analysis

### Already shared safely at job scope

The production job already shares runner-level setup across the normal shard and the acceptance step:

- checked-out Proped source;
- Node runtime setup and registered Node 20 path;
- pnpm/Bun/MoonBit toolchains;
- Playwright browser installation;
- strict sandbox backend;
- materialized pinned Yarn Berry checkout directory.

These should remain shared and should not be reinstalled by the acceptance gate.

### Current shard evidence is insufficient to replace a fresh campaign

The normal shard artifact currently retains aggregate/stable fields such as:

- pinned repository/revision and checkout identity;
- checkout cleanup result;
- auto-onboarding and deterministic replay status;
- finding group IDs;
- actionable and one-minimal finding group IDs;
- finding-quality KPI;
- adapter LOC = 0.

It does not retain enough evidence to satisfy the real-OSS acceptance by itself. In particular, it does not preserve the full privacy-safe actionable finding, minimal replay payload, human incident projection, or a contract binding that evidence to the exact acceptance runtime/sandbox options. Therefore the existing shard summary must not simply be counted as one of the two fresh acceptance campaigns.

### Candidate optimization after timing

The most promising non-weakening optimization is to make the normal Yarn Berry production campaign eligible to count as fresh campaign #1, but only after the shard persists a dedicated acceptance-grade evidence record.

Such evidence must be bound to at least:

- corpus ID and semantic hash;
- target ID, repository, pinned revision, and project path;
- sandbox mode and relevant runtime/toolchain contract;
- campaign schema/runner versions;
- expected strong `findingGroupId`;
- privacy-safe actionable finding payload;
- deterministic representative replay and one-minimal proof;
- human incident projection or an equivalent deterministic rendering input;
- adapter LOC = 0;
- successful checkout cleanup after that campaign.

The acceptance step could then run exactly one additional fresh campaign after the shard cleanup and compare it against the persisted first-campaign evidence. This would preserve two fresh campaigns while removing one duplicate full campaign from the critical path.

Do not implement this reuse until phase timing confirms that the duplicate full campaign is the dominant cost and regression tests prove the evidence binding cannot accept stale, mismatched, privacy-unsafe, or wrong-runtime shard output.

## Tests required for any evidence reuse

- reject evidence for a different repository/revision/project;
- reject evidence from a different corpus semantic hash;
- reject evidence from a different sandbox/runtime contract;
- reject a different `findingGroupId` or representative replay;
- reject non-`one-minimal` or non-deterministic evidence;
- reject missing/unsafe provenance or human incident evidence;
- reject missing/failed shard checkout cleanup;
- retain a test proving two genuinely fresh campaigns are represented by shard campaign #1 plus acceptance campaign #2;
- retain adapter LOC = 0.

## Implemented P0: parallel independent fresh campaigns

The safe first optimization is parallelism rather than treating the existing shard summary as acceptance evidence. The current shard summary remains intentionally insufficient to replace a fresh campaign.

`Production contracts` now runs the two required real-OSS campaigns as two independent jobs (`fresh-a` and `fresh-b`) after the plan job and in parallel with the ordinary production shards. Each acceptance campaign has its own fresh runner and pinned Yarn Berry checkout, and independently performs:

1. exact pinned checkout materialization;
2. initial checkout verification;
3. baseline capture;
4. the ordinary `proped web campaign` CLI under strict sandbox;
5. machine-readable finding and artifact finding agreement;
6. human incident rendering validation;
7. privacy checks;
8. checkout restore;
9. final checkout verification.

Each job uploads acceptance-grade evidence. A separate comparison job rejects evidence unless both campaigns are bound to the current corpus semantic hash, exact repository/revision/project, adapter LOC 0, strict sandbox, campaign schema version, runner version, deterministic same-finding replay, one-minimal replay, privacy-safe incident output, and successful cleanup. It then requires distinct campaign IDs, the same `findingGroupId`, the same representative replay, and the same incident replay actions.

This preserves the two-fresh-campaign contract while removing the previous serial dependency:

`production shard -> fresh campaign #1 -> fresh campaign #2`

and replacing it with:

`production shards || fresh-a || fresh-b -> compare -> aggregate`

The production shard matrix is capped at 10 concurrent shard runners so the two acceptance runners and ordinary CI partitions are less likely to be starved by hosted-runner slot contention.

The expected critical path is therefore approximately one full Yarn acceptance campaign plus setup/materialization and the lightweight comparison/aggregate tail, rather than two full campaigns after the ~8m29s production shard. The target remains approximately 15 minutes or less and must be confirmed by the first hosted Production contracts run.

### Regression coverage

The new acceptance contract test rejects:

- wrong repository/revision/project identity;
- stale or mismatched corpus semantic hash;
- wrong sandbox/runtime contract;
- duplicate campaign identity;
- cleanup failure;
- wrong finding identity;
- non-one-minimal evidence;
- privacy leakage in human incident evidence.

The previous sequential CLI mode remains available locally as a reference path; CI uses two single-campaign evidence runs plus deterministic comparison.

## Acceptance

- production timing output identifies where the 16m41s acceptance time is spent without changing semantic hashes;
- no acceptance invariant is removed or relaxed;
- optimization decisions are based on measured phase cost;
- if shard campaign evidence is reused, two-fresh-campaign semantics remain provable and checkout cleanup/privacy/minimality contracts remain explicit;
- `Production contracts` wall time is materially reduced from the approximately 26m48s baseline.


## Completion evidence

Completed on `main` at `f44403fdc00a95f1dc208b6ad7f26aa011cfa398`.

Hosted `Production contracts` run `31930375853` completed successfully from 2026-08-16 15:00:54 JST to 15:15:08 JST: **14m14s total**, down from the approximately **26m48s** baseline (~47% wall-time reduction).

Acceptance semantics remained intact and the uploaded `production-actionable-acceptance` summary proves:

- `ok=true`;
- two distinct fresh campaigns: `fresh-a`, `fresh-b`;
- exact pinned `yarnpkg/berry` revision `57081c05a398f25c92df1dc78752f2053576cec0`;
- project `packages/docusaurus`;
- adapter LOC = 0;
- stable `findingGroupId=finding@250bb43b5436`;
- failure code `unhandled_exception`;
- same deterministic representative replay;
- `minimality=one-minimal`;
- `repeatStable=true`;
- `privacySafe=true`;
- `checkoutCleanup=true`.

Measured full campaign time was **489.8s (8m10s)** for fresh-a and **508.8s (8m29s)** for fresh-b. The two campaigns overlapped on independent runners and the compare job completed successfully. The acceptance branch therefore ceased to be the production critical path.

The final critical path was the ordinary promoted-production `shadcn-svelte` shard: its job completed in approximately **13m00s**, including a production shard stage of **11m59s**. The aggregate gate then completed in 13 seconds.

No exploration bounds, property packs, replay checks, finding identity, one-minimal proof, privacy checks, checkout cleanup, or adapter-LOC constraints were relaxed.
