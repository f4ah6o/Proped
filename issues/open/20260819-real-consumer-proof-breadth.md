# Expand real-consumer proof breadth without adapters

Status: open
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

- [ ] second independent real-consumer evidence vector accepted with adapter LOC 0;
- [ ] no new selector/framework/application-specific code in Proped;
- [ ] any generic fix has a synthetic regression and does not weaken privacy/determinism/minimality claims;
- [ ] proof-breadth evidence is documented with exact revision and hosted CI/Production contracts status.

This issue must not be used as justification for speculative feature work. If no second independent consumer is available, leave the contract unchanged and keep this as evidence work only.

## Evidence checkpoint — 2026-08-19

Re-evaluated from `main` revision `17e23b656ae038f0b8f0b262af212f27059b23c7` after the first real-consumer acceptance was closed. The first consumer/runtime boundary is the Madobe Web/WKWebView integration, so additional titles inside that same consumer are not counted as independent breadth for this issue.

Two pinned real OSS candidates from the existing Production contracts evidence were checked without adding adapters or changing the acceptance contract:

- `drawdb-io/drawdb` at `f15453be0b9a0a8ca99d040256c2d2edf7155510` is a genuinely different stateful topology (`react-vite`, IndexedDB + localStorage), has `adapterLoc = 0`, and the hosted production shard is deterministic. It does **not** qualify as the second opaque proof vector because its production evidence reports `oneMinimalFindingGroups = 0`.
- `yarnpkg/berry` Docusaurus at `57081c05a398f25c92df1dc78752f2053576cec0` has `adapterLoc = 0`, deterministic fresh campaigns, and one real one-minimal actionable finding. That existing evidence is semantic replay evidence rather than `OpaqueWebReplayV1`: it does not prove a content-blind portable `kind + ordinal` vector or a fresh WebKit observation with `not-one-minimal`. It therefore cannot be promoted into `OpaqueWebRealConsumerEvidenceV1` without overstating the contract.

Hosted source evidence came from Production contracts run `32247826465` on revision `17e23b656ae038f0b8f0b262af212f27059b23c7`; the run completed successfully after the documented hosted-runner retry, and the corresponding CI run `32247826477` was fully green.

A local attempt to produce a fresh opaque vector against an already-running loopback real OSS app was blocked by the execution safety gate before the browser exploration ran. The block is not being bypassed through another execution path. No application content was used to manufacture a replay vector.

Current conclusion: there is no second independent evidence vector that satisfies all of `one-minimal` + content-blind `kind + ordinal` portability + fresh cross-engine observation. Per this issue's non-speculative rule, `OpaqueWebRealConsumerEvidenceV1` / `OpaqueWebRealConsumerAcceptanceV1` remain unchanged, consumer-specific adapter LOC remains 0, and this issue stays open as evidence work rather than adding a new mechanism solely to force completion.
