# Changes

## Unreleased

### Added

- Added a browser-independent MoonBit flow-canvas core with typed nodes and edges, deterministic rank layout, orthogonal routing, viewport and selection state, standalone SVG rendering, and a `RunReport` adapter. See `docs/FLOW.md` and `docs/FLOW.ja.md`.
- Added deterministic xorshift64 exploration, validated `RunConfig` bounds, explicit action IDs, collision diagnostics, cyclic-shrinker budgets, and structured failure provenance in schema version 2 reports.

### Changed

- Improved the static Atlas viewer with a graph-first state-flow UI, separated application previews, bilingual labels, and collapsible exploration details. (issues/open/20260722-atlas-ui.md)

### Fixed

### Deprecated

### Removed

### Security

### Migration

- `Machine` now requires `action_id`; use a stable machine-readable ID separate from the human-facing `describe_msg` label. The legacy `rabbita_machine` adapter continues to derive the ID from `describe_msg`; use `rabbita_machine_with_action_id` to opt into distinct IDs.
- Add `shrink_budget` to explicit `RunConfig` literals, or use `RunConfig::default()`. Use `run_checked` when invalid configuration must be handled as a typed error.
