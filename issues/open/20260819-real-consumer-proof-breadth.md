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
