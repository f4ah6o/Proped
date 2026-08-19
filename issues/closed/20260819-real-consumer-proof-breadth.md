# Expand real-consumer proof breadth without adapters

Status: closed
Created: 2026-08-19
Priority: P1

## Context

The first real-consumer acceptance establishes that content-blind portable replay can reduce and verify a difficult stateful Web defect without consumer-specific code in Proped. The next maturity axis is breadth, not capability count.

## Goal

Repeat the same versioned real-consumer acceptance contract against at least one independent consumer/runtime boundary with a different application topology or mutable-state shape while keeping consumer-specific adapter LOC at 0.

## Requirements

- reuse `OpaqueWebRealConsumerEvidenceV1` / `OpaqueWebRealConsumerAcceptanceV1` unchanged unless a genuinely generic contract gap is found;
- already-running loopback URL mode, no project onboarding requirement;
- checkpoint-aware isolation for external mutable state when present;
- non-default progressing branch discovered generically;
- bounded one-minimal source replay and deterministic fresh replay;
- same `kind + ordinal` vector observed under another managed browser engine;
- cross-engine minimality remains `not-one-minimal`;
- consumer returns only the minimal fixed evidence contract;
- no consumer/application names or content-bearing fields in committed evidence fixtures;
- hosted CI validates the contract fixture, while consumer execution may remain an external acceptance producer.

## Exit criteria

- [x] second independent real-consumer evidence vector accepted with adapter LOC 0;
- [x] no new selector/framework/application-specific code in Proped;
- [x] any generic fix has a synthetic regression and does not weaken privacy/determinism/minimality claims;
- [x] proof-breadth evidence is documented with exact revision and hosted CI/Production contracts status.

This issue must not be used as justification for speculative feature work. If no second independent consumer is available, leave the contract unchanged and keep this as evidence work only.

## Evidence checkpoint — 2026-08-19

Re-evaluated from `main` revision `17e23b656ae038f0b8f0b262af212f27059b23c7` after the first real-consumer acceptance was closed. The first consumer/runtime boundary is the Madobe Web/WKWebView integration, so additional titles inside that same consumer are not counted as independent breadth for this issue.

Two pinned real OSS candidates from the existing Production contracts evidence were checked without adding adapters or changing the acceptance contract:

- `drawdb-io/drawdb` at `f15453be0b9a0a8ca99d040256c2d2edf7155510` is a genuinely different stateful topology (`react-vite`, IndexedDB + localStorage), has `adapterLoc = 0`, and the hosted production shard is deterministic. It does **not** qualify as the second opaque proof vector because its production evidence reports `oneMinimalFindingGroups = 0`.
- `yarnpkg/berry` Docusaurus at `57081c05a398f25c92df1dc78752f2053576cec0` has `adapterLoc = 0`, deterministic fresh campaigns, and one real one-minimal actionable finding. That existing evidence is semantic replay evidence rather than `OpaqueWebReplayV1`: it does not prove a content-blind portable `kind + ordinal` vector or a fresh WebKit observation with `not-one-minimal`. It therefore cannot be promoted into `OpaqueWebRealConsumerEvidenceV1` without overstating the contract.

Hosted source evidence came from Production contracts run `32247826465` on revision `17e23b656ae038f0b8f0b262af212f27059b23c7`; the run completed successfully after the documented hosted-runner retry, and the corresponding CI run `32247826477` was fully green.

A local attempt to produce a fresh opaque vector against an already-running loopback real OSS app was blocked by the execution safety gate before the browser exploration ran. The block was not bypassed through another execution path. No application content was used to manufacture a replay vector.

That checkpoint was intentionally left open because no second vector then satisfied all of `one-minimal` + content-blind `kind + ordinal` portability + fresh cross-engine observation.

## Completion evidence — 2026-08-19

Completed on implementation revision `4572d195bfd5f18ba61f23cace9ff97839c229d5` without changing `OpaqueWebRealConsumerEvidenceV1`, `OpaqueWebRealConsumerAcceptanceV1`, candidate ordering, browser-driver logic, selector policy, or any framework/application-specific runtime code.

A second independent consumer/runtime boundary was exercised from an existing separate Web application/runtime rather than another title inside the first Madobe consumer. The application was served from an already-built static artifact over loopback, and its consumer runtime used an existing isolated system-Chrome/CDP browser path with a fresh browser context per observation. Because the producer source worktree contained unrelated uncommitted work, the acceptance does not attribute the served build to that repository HEAD; the exact served static artifact tree is instead pinned by SHA-256 `5e6a6b4c2ae9eab99dba34ac6aed8dce17ff6c7813078b382c431c98bfce4078`. The independent consumer browser reported Chrome `151.0.7922.138`.

The content-blind source exploration discovered one progressing portable action and reduced it to the one-step vector `dom_activate:2`:

- source Chromium: `changed`, 2 fresh attempts, deterministic, `one-minimal`;
- peer Playwright WebKit: exact same `dom_activate:2`, `changed`, 2 fresh attempts, deterministic, explicitly `not-one-minimal`;
- independent consumer initial observation: exact same vector, `changed`, one fresh isolated context, intentionally non-qualified because a single observation does not establish determinism;
- independent consumer qualified observation: exact same vector, `changed`, 2 fresh isolated contexts, deterministic.

The resulting breadth acceptance classifies both observations as `portable_replay_agrees`; the initial observation is not production-qualified, while the two-attempt fresh isolated observation is `productionQualified = true`. Consumer-specific adapter LOC remains fixed at `0`.

The committed proof remains consumer-neutral:

- `protocol/fixtures/opaque-web-real-consumer-evidence-v1-breadth.json` contains only the fixed evidence schema, action kind/ordinal, transition enums, attempts, booleans, minimality, and isolation class;
- `protocol/fixtures/opaque-web-real-consumer-acceptance-v1-breadth.json` contains only the derived fixed acceptance contract;
- `scripts/test_web_real_consumer_opaque_acceptance.mjs` validates both the original incident fixture and the independent breadth fixture through the same unchanged protocol implementation.

No generic production fix was required for the second proof, so the generic-fix exit criterion is satisfied vacuously: no behavior was changed that could weaken privacy, determinism, minimality, or candidate-order semantics. Local regressions passed for the real-consumer acceptance test, content-blind opaque replay, Generic Browser, public-disclosure check, and `git diff --check`.

Hosted evidence on the exact implementation revision `4572d195bfd5f18ba61f23cace9ff97839c229d5`:

- CI run `32260479711`: attempt 2 completed successfully with all jobs green. Attempt 1 had a hosted managed-browser setup stall in Core contracts; only the affected job was rerun on the same SHA.
- Production contracts run `32260480685`: attempt 2 completed successfully with all jobs green. The Production plan's `Verify opaque real-consumer acceptance contract` step passed on the implementation revision. Attempt 1 had hosted `Prepare managed browser runtime` stalls in the Yarn Berry and DrawDB shards; successful jobs were retained, the stalled run was cancelled, and only the cancelled/failed remainder was rerun on the same SHA. The rerun completed both shards and the dependent aggregate gate successfully.

This closes proof breadth: there are now two independent real-consumer/runtime-boundary proofs using the same content-blind portable acceptance contract, with no consumer-specific code in Proped.
