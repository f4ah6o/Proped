# Checkpoint-aware stateful exploration

Status: closed
Updated: 2026-08-16

## Context

Proped can deterministically explore UI state by observing actions, executing one action, fingerprinting the resulting state, and replaying paths from a reset environment. That model is insufficient when an action result depends on persistent or otherwise external mutable state that is not represented by the visible/runtime fingerprint.

A representative generic failure shape is:

```text
(runtime=A, external=P1) -- action X --> runtime=B
(runtime=A, external=P2) -- action X --> runtime=C
```

If the explorer deduplicates the two `runtime=A` observations as one node, replay and transition identity become unsound even though the UI is visually/semantically identical.

The public Proped abstraction must support this class of stateful system without embedding product-specific concepts such as game saves, Wine prefixes, application-specific storage layouts, or private fixture identifiers.

## Goal

Add a generic, optional checkpoint-aware exploration contract so a driver can make external mutable state part of deterministic exploration and replay while preserving the existing stateless/Web behavior.

The conceptual explored state becomes:

```text
ExtendedState = RuntimeState x EnvironmentState
```

where `EnvironmentState` may be represented by an opaque checkpoint/version identity when semantic equality cannot be proven safely.

## Constraints

- Keep Proped public and domain-neutral. Do not add game-, save-, load-, Wine-, store-, or private-product-specific APIs or fixtures.
- Existing stateless drivers and current Browser/Web protocol behavior must remain compatible.
- Do not require a driver to expose external-state contents. Opaque checkpoint/version handles are sufficient.
- Never deduplicate two states solely because their runtime/UI fingerprints match when their environment-state equivalence is unknown.
- Deterministic replay must restore the required environment state before replaying runtime actions.
- Branch exploration must not allow an external-state mutation from one candidate action to contaminate sibling candidates.
- Prefer conservative non-merge over an unsound merge when environment-state equality cannot be established.
- Keep evidence deterministic and privacy-compatible: reports need identities/effects, not the underlying persisted bytes or values.

## Proposed contract

Introduce a driver capability equivalent to the following conceptual operations; final names should follow the existing driver/protocol structure rather than forcing this exact Rust shape:

```rust
trait StatefulEnvironment {
    type Checkpoint;

    fn checkpoint(&mut self) -> Result<Self::Checkpoint>;
    fn restore(&mut self, checkpoint: &Self::Checkpoint) -> Result<()>;
}
```

The explorer additionally needs an opaque environment-state identity associated with each explored node. This may be a checkpoint generation/version id supplied by the driver. A semantic fingerprint is optional and should only be used for merging when the driver can guarantee its stability and equivalence semantics.

The effective node identity is therefore conceptually:

```text
NodeIdentity = runtime_fingerprint + environment_state_identity
```

For drivers that do not advertise the capability, environment state is the single implicit stateless value and current behavior is unchanged.

## Exploration semantics

Treat one candidate action as a speculative transaction from its parent state:

```text
parent extended state
  -> restore parent environment checkpoint
  -> restore/reset/replay parent runtime state
  -> execute exactly one candidate action
  -> observe runtime result and environment-state effect
  -> record transition
  -> discard/leave the speculative branch before evaluating a sibling
```

A transition may therefore be classified with a generic effect such as `environment_changed` without interpreting the domain meaning of that mutation.

For replay, restoring only the runtime is insufficient. Replay of a checkpoint-aware trace must begin from the environment checkpoint/version required by that trace and prove the same extended-state transitions.

## Synthetic acceptance fixture

Add a deterministic synthetic stateful fixture with no product-specific terminology. It must demonstrate at least:

1. The same runtime observation and same action produce different successor runtime states under two different external-state versions.
2. The explorer keeps those parent states distinct even though the runtime fingerprint is identical.
3. One action mutates external state; a sibling action starts from the unmodified parent checkpoint rather than inheriting that mutation.
4. A later action reads previously persisted external state and transitions to a known earlier runtime state, proving that stateful recovery/jump behavior is replayable.
5. Fresh replay restores the required checkpoint and reproduces the same transition sequence deterministically.
6. A driver that does not support checkpointing continues to use the existing stateless exploration path unchanged.

## Implementation plan

### P0 — represent extended state without breaking stateless drivers

- Add an optional checkpoint/environment capability at the generic driver boundary.
- Associate each explored node with an opaque environment-state identity when the capability is enabled.
- Include that identity in node dedup/replay identity.
- Keep current node identity semantics for drivers without the capability.

### P0 — isolate sibling action execution

- Before evaluating a candidate, restore the parent environment checkpoint/version.
- Restore or replay the parent runtime state using the existing deterministic mechanism.
- Execute one candidate and capture whether the environment state remained equivalent or advanced to a new opaque version.
- Ensure mutations from one candidate cannot leak into sibling candidate evaluation.

### P0 — checkpoint-aware replay

- Persist enough opaque checkpoint provenance in an exploration trace to restore the correct external state for replay.
- Extend replay validation so both runtime and environment-state identities are reproduced.
- Report nondeterminism when the same restored extended state and action do not reproduce the expected successor.

### P0 — regression coverage

- Add the synthetic stateful fixture above.
- Cover identical-runtime/different-environment non-dedup.
- Cover sibling isolation after mutation.
- Cover stateful jump/recovery to an earlier runtime state.
- Cover deterministic replay from a restored checkpoint.
- Re-run existing Web/Browser exploration tests to prove compatibility.

### P1 — optional semantic environment equivalence

Only after the opaque-version model is correct, allow a driver to provide a stable semantic environment fingerprint/equivalence contract so equivalent checkpoints may be merged. This must be opt-in and must not make semantic equality a requirement for checkpoint-aware exploration.

## Acceptance criteria

- [x] Proped can explore a synthetic stateful system where identical runtime/UI states have different future behavior because external state differs.
- [x] Extended-state identity prevents unsound runtime-only deduplication.
- [x] Every candidate action can be evaluated from its parent checkpoint without sibling mutation leakage.
- [x] Checkpoint-aware replay restores external state and reproduces the same transition sequence deterministically.
- [x] The trace/evidence format exposes only generic opaque identities/effects, not external-state contents.
- [x] Existing stateless and Browser/Web exploration behavior remains green and requires no domain-specific checkpoint implementation.
- [x] Public code, docs, tests, and fixtures contain no private product identifiers or product-specific persistence implementation details.

## Completion evidence

Implemented the P0 checkpoint-aware state model as an optional, domain-neutral driver capability. Stateless drivers retain runtime-fingerprint identity and the existing exploration/replay behavior.

- `protocol/environment-checkpoints.mjs` defines capability detection, opaque checkpoint validation, restore verification, extended-state identity, and generic `environment_changed` / `unchanged` effects.
- `protocol/web-coverage-guided-exploration.mjs` deduplicates checkpoint-capable nodes by runtime plus environment identity, reconstructs the parent trace from the baseline checkpoint, restores the exact parent environment before each speculative action, and records checkpoint-aware replay provenance without hashing opaque checkpoint handles.
- `protocol/web-exploration-replay-gate.mjs` restores the required initial checkpoint and validates the expected extended-state transition sequence; replay projection determinism is wired through the existing replay gate.
- UI driver protocol v1 accepts optional `checkpoint` / `restoreCheckpoint` methods and advertises `environment-checkpoints` only for capable drivers; unsupported calls fail closed.
- The synthetic coverage-guided fixture proves identical-runtime/different-environment non-merge, same-action/different-successor behavior, sibling isolation after mutation, recovery to a known earlier runtime state, fresh deterministic checkpoint replay, opaque-handle-independent semantic hashing, and unchanged stateless behavior.
- Evidence privacy is asserted directly: exported checkpoint provenance, state traces, and transitions contain identities/effects but not the synthetic external-state contents.

Validation completed successfully:

- `node scripts/test_web_driver_protocol.mjs`
- `node scripts/test_web_coverage_guided_exploration.mjs`
- `node scripts/test_web_exploration_replay_gate.mjs`
- `node scripts/test_web_replay_gate.mjs`
- `node web/playwright-browser/test-generic-browser-driver.mjs`
- `node scripts/test_web_exploration_stage_quality.mjs`
- `node scripts/test_web_project_onboarding_v2.mjs`
- `node scripts/test_web_stateful_server_pack.mjs`
- `node scripts/test_web_project_campaign.mjs`
- `node scripts/test_web_generic_property_packs.mjs`
- `python3 -m json.tool protocol/ui-driver-v1.schema.json`
- `python3 scripts/check_public_disclosure.py`
- `git diff --check`

## Non-goals

- Discovering application-specific persistent storage locations.
- Interpreting the semantic meaning of an external-state mutation.
- Parsing save slots, database records, filesystem contents, or other domain-specific persistence formats.
- Implementing a game/native input or visual-action driver.
