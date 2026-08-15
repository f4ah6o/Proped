# Production agent-friendly critical-path shortening

## Baseline

Main merge `e008e144165f60eb39b6a7b39b2df5d0cf550b67` completed `Production contracts` in about 13m16s.

The critical shard is `promoted-production / frontier-agent-friendly-code`:

- runner/setup through materialization: ~53s
- `Run production shard`: ~10m40s
- target result: 32 states / 31 transitions / 106 actions, deterministic replay, adapter LOC 0

The critical path is therefore inside the generic browser campaign, not Actions setup.

## Observed structural cost

The inferred production manifest has two serial stages only:

1. `project-build`
2. `generic-browser`

Coverage-guided exploration reconstructs a selected frontier source by resetting the browser and replaying the complete source trace before every frontier action. During reconstruction, replay actions currently run the full property evaluation path even though replay-trace violations are discarded.

## P0 implementation

- preserve the exact frontier selection/order and semantic hashes
- reuse the currently-live driver state only when its exact executed trace equals the selected source trace
- when a source trace really must be reconstructed, execute replay-only actions without the unused pre-action property snapshot/evaluation
- retain normal property evaluation for the frontier action itself and for explicit failure replay gates
- add regression tests proving deterministic exploration output, fewer resets, and replay-only execution mode
- validate against the full promoted-production baseline and measure the final `agent-friendly-code` shard runtime

## Acceptance

- existing exploration semantic hash/result graph unchanged in regression fixtures
- production aggregate gate and promoted baseline remain green
- no reduction in exploration bounds, replay attempts, property packs, states, transitions, or target coverage
- measurable reduction in `agent-friendly-code` wall time
