# Changes

## 0.6.0 - 2026-08-05

### Added

- Added `ensenzu-app` as the second manifest-driven external target, covering all 19 numeric `FieldKey` variants, finite string corpora, input-source switching, reset confirmation, advanced settings, SVG calculation, and deterministic download effects.
- Vendored the Apache-2.0 Ensenzu application source and calculation core at revision `f1fbec776a393e7023c8fa8324ea26c0774752e5` because the workspace dependency is not published in the MoonBit registry.
- Extended `external list`, `external inspect`, `external inspect-source`, and `external run all` to cover both subscription-model and effect-model applications.

### Fixed

- Found that the pinned Ensenzu application accepts the non-finite literal `Infinity` for the active frequency field without a validation error; minimized to `Change(Frequency, "Infinity")`.

### Changed

- Expanded the external campaign to two deterministic targets and bumped the package and CLI version to `0.6.0`.

## 0.5.0 - 2026-08-04

### Added

- Added a manifest-driven external Rabbita exploration foundation with reviewed metadata, adapter classification, source boundary inspection, deterministic effect descriptors, bounded response-order permutations, and reusable generic properties.
- Added `external list`, `external inspect`, `external inspect-source`, and `external run` CLI commands. External repositories are explicitly treated as read-only inputs.
- Vendored the pinned MIT-licensed `justjavac/proton-demo` Todo frontend source and added a native adapter that records Proton bridge effects without executing them.
- Added the `proton-demo-todo` expected-failure target and deterministic HTML, SVG, JSON, DOT, and summary artifacts.

### Fixed

- Found that the pinned Proton Todo update accepts an older uncorrelated snapshot after a newer snapshot; minimized to `SnapshotReceived(version=1) -> SnapshotReceived(version=0)`.

### Changed

- Bumped the package and CLI version to `0.5.0`.

## 0.4.0 - 2026-08-04

### Added

- Vendored Rabbita's official Sokoban (259 lines), subscriptions (420 lines), and WebSocket (956 lines) examples with pinned source, stylesheets, SHA-256 hashes, Apache-2.0 licenses, and deterministic native adapters.
- Added `rabbita-sokoban`, `rabbita-subscriptions`, and `rabbita-websocket` expected-failure CLI demos.
- Added exact property-and-trace signatures for malformed timeline input, a queued timer callback after pause, and repeated disconnect while closing.

### Fixed

- Found Sokoban malformed timeline text rewinding history to cursor `0`; minimized to `Move(Up) -> JumpTo("not-a-number")`.
- Found a queued subscription tick incrementing a paused counter; minimized to `ToggleTicker -> Tick`.
- Found the WebSocket disconnect control remaining active in `closing` and accepting another close request; minimized to `ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested`.

### Changed

- Expanded `demo run all` from three to six demos and bumped the package and CLI version to `0.4.0`.

## 0.3.0 - 2026-08-04

### Added

- Vendored Rabbita's official 281-line TODO example at revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`, including preserved source, stylesheet, SHA-256 hashes, Apache-2.0 license, adaptation notes, and deterministic native exploration.
- Added a practical `rabbita-todo` CLI demo covering title changes, add, delete, toggle, tab selection, filtered lists, statistics, 169 states, and 2,251 transitions.
- Added expected-outcome metadata and exact expected failure signatures so passing examples and expected-failure regression fixtures can run together without accepting an unrelated failure.
- Added `firstFailure` to CLI summaries with the property, message, state ID, trace length, human trace, and stable action IDs.

### Changed

- The runner now retains the shortest counterexample per property instead of recording repeated or longer failures from many generated cases.
- CLI exit code `0` now means every selected demo matched its declared expected outcome; exit code `3` means an expectation mismatch.
- Bumped the package and CLI version to `0.3.0`.

### Fixed

- Detected and documented that the pinned Rabbita TODO update guard rejects only an empty string and therefore stores a whitespace-only title.
- Shrinking reduces the TODO failure to `TitleChanged(" ")` followed by `Add`.

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
