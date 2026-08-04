# Upstream provenance

- Repository: `justjavac/proton-demo`
- Revision: `5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d`
- Source: `frontend/main/main.mbt`
- Retrieved: 2026-08-04
- License: MIT; full text is stored in `LICENSE`.
- Source SHA-256: `69787a7a175b323ba0c6e01ea2acfc8692379ed938217bcf00c7d3a8c1f79c8b`

## Adaptation

The native adapter preserves the upstream `Model`, `Msg`, and update behavior
relevant to Todo snapshots. Proton bridge calls and subscriptions are represented
as deterministic `EffectDescriptor` values. `SnapshotReceived` remains
uncorrelated, matching the upstream message shape, so bounded response ordering
can exercise stale snapshot delivery.

## Failure rationale

The upstream `SnapshotReceived(snapshot)` branch replaces the current snapshot
without comparing `snapshot.version` or correlating it with the request that
produced it. The adapter therefore checks the manifest-declared property that an
accepted snapshot version never decreases. This is an asynchronous test model:
it proves the update function accepts an older snapshot after a newer one, not
that every Proton transport necessarily delivers responses in that order.
