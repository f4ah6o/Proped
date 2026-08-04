# Changes

## 0.2.0 - 2026-08-04

### Added

- Added a native CLI with human and JSON output, machine-readable command discovery through `schema`, stable exit codes, configurable artifact roots, and per-demo `summary.json` files.
- Added reusable `newsletter` and vendored `rabbita-counter` demo packages that can be run individually or together through the CLI.
- Vendored Rabbita's official counter example at revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`, including its Apache-2.0 license, preserved upstream source, modification notice, and adapter documentation.
- Added a browser-independent MoonBit flow-canvas core with typed nodes and edges, deterministic rank layout, orthogonal routing, viewport and selection state, standalone SVG rendering, and a `RunReport` adapter. See `docs/FLOW.md` and `docs/FLOW.ja.md`.
- Added deterministic xorshift64 exploration, validated `RunConfig` bounds, explicit action IDs, collision diagnostics, cyclic-shrinker budgets, and structured failure provenance in schema version 2 reports.

### Changed

- Reorganized demos as reusable packages under `src/examples/` and `src/vendor/` instead of keeping the newsletter as a standalone executable.
- Improved the static Atlas viewer with a graph-first state-flow UI, separated application previews, bilingual labels, and collapsible exploration details.
- Updated English and Japanese documentation around the CLI-first workflow, JSON contract, artifacts, exit codes, and vendored source provenance.

### Removed

- Removed the legacy `src/demo` executable. Use `moon run src/cli -- demo run newsletter` or `demo run all`.

### Migration

- `Machine` requires `action_id`; use a stable machine-readable ID separate from the human-facing `describe_msg` label. The legacy `rabbita_machine` adapter derives the ID from `describe_msg`; use `rabbita_machine_with_action_id` for distinct IDs.
- Add `shrink_budget` to explicit `RunConfig` literals, or use `RunConfig::default()`. Use `run_checked` when invalid configuration must be handled as a typed error.
- Replace `moon run src/demo` with `moon run src/cli -- demo run newsletter`.
