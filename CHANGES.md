# Changes

## 0.17.0 - 2026-08-05

### Added

- Added `selene-editor-assets` as the twelfth external target with a finite asset-panel, preview-selection, initialization, and response-order adapter.
- Preserved the Apache-2.0 Selene Editor frontend source boundary at revision `ca68f3a2898a80db9fc45ff96713d1531814371d` with combined SHA-256 provenance.

### Fixed

- Found that dispatching Selene Editor `Initialize` twice installs duplicate service, preview, keyboard, and sidebar subscriptions plus a duplicate current-project request; minimized to `Initialize -> Initialize`.
- Found that an older `AssetsLoaded` callback can replace a newer accepted asset list because the pinned message carries no request generation.

### Changed

- Expanded the external CI matrix to twelve targets and bumped the package and CLI version to `0.17.0`.
- Kept browser DOM, WebGPU rendering, filesystem execution, service SSE, and preview execution outside the finite adapter while preserving typed effect boundaries.

## 0.16.0 - 2026-08-05

### Added

- Added `mooncakes-official-ui` as the eleventh external target, covering the production Mooncakes Build Queue, the official Rabbita website home state, and the official full-stack tutorial frontend.
- Preserved four Apache-2.0 source fixtures across `moonbitlang/mooncakes.io`, `moonbitlang/website`, and `moonbitlang/moonbit-docs` with pinned revisions and SHA-256 provenance.
- Added malformed Build Queue decoder corpora for missing collections, invalid queued items, and invalid recent items.

### Fixed

- Found that an older Build Queue response can replace a newer accepted result because `GotBuilds` carries no request generation; minimized to a reload, a newer malformed response, and an older successful response.
- Found that the official full-stack tutorial can display a reply for an older submitted title after the user edits the title again.

### Changed

- Expanded the external CI matrix to eleven targets and bumped the package and CLI version to `0.16.0`.
- Kept browser DOM, Shiki, real HTTP, clocks, and backend validation outside the finite adapter while retaining their typed state boundaries.

## 0.15.0 - 2026-08-05

### Added

- Added `moonclaw-job` as the tenth external target with a finite Jobs-surface adapter for snapshot requests, stream closure, run selection, timeline deduplication, and reverse-order response injection.
- Preserved Moonclaw's Apache-2.0 Rabbita job `update.mbt` and model types at revision `5fdc845f2a926cdd17260fb9720135a2c50eff38` with SHA-256 provenance.

### Fixed

- Found that an older same-run snapshot response can replace a newer terminal snapshot and revive the visible run; minimized to two stream-triggered requests followed by `Succeeded` then stale `Running` delivery.

### Changed

- Expanded the external CI matrix to ten targets and bumped the package and CLI version to `0.15.0`.
- Documented that the pinned Jobs surface has no direct cancel/retry message; ACP and Cowork controls remain separate exploration scopes.

## 0.14.0 - 2026-08-05

### Added

- Added `rabbita-xterm-lifecycle` as the ninth external target with a native lifecycle adapter for loading, mounting, subscriptions, UTF-8 writes, themes, resize events, disposal, and stale callbacks.
- Preserved the Apache-2.0 managed xterm source at revision `9734f6a39ce3899dbf6738fa3a100c2cebaefc23` with SHA-256 provenance.

### Fixed

- Found that managed `Resize` and `Resized` actions accept non-positive terminal dimensions; minimized to `Resize(cols=0, rows=24)`.

### Changed

- Expanded the external CI matrix to nine targets and bumped the package and CLI version to `0.14.0`.

## 0.13.0 - 2026-08-05

### Added

- Added `scripts/external_harness.py` for duplicate-safe manifest parsing, schema validation, deterministic source hashing, bounded `Msg` action scaffold generation, explicit prepare/update reports, and fail-closed network-denied inspection commands.
- Added finite action corpora for payloadless variants plus `Bool`, `Int`, `String`, `Option`, and small payloadless enum fields.
- Added Python unit tests, all-manifest validation, an eight-target external CI matrix, and a Linux network-denial policy check.

### Changed

- Added `$schema` as an allowed manifest metadata field and bumped the package and CLI version to `0.13.0`.
- Documented the preparation workflow and kept manifest updates preview-only unless an explicit output or `--write` is supplied.

## 0.12.0 - 2026-08-05

### Added

- Added `isomorphic-suite` as the eighth external target, running the Kanban, Todo, and Note frontends through one shared finite matrix harness.
- Added stable per-application request identities, common CRUD properties, and app-specific stale-load and referential-integrity properties.
- Added a clean-room behavioral adapter with SHA-256 provenance for the three Apache-2.0-declared applications at revision `590ac1c4de71050419cc6643942e0d1f181301aa`.

### Fixed

- Found that Kanban direct dispatch can move a card to a nonexistent column; minimized to `KanbanSelectCardToMove(1) -> KanbanMoveCardTo(column=99, index=0)`.
- Found that late Kanban and Todo list responses can overwrite newer mutations, and that Note list replacement can leave a missing selected note ID.

### Changed

- Expanded the external campaign to eight deterministic targets and bumped the package and CLI version to `0.12.0`.
- Recorded the remaining Isomorphic frontends as a follow-on checklist instead of approximating all twelve applications in the initial adapter.

## 0.11.0 - 2026-08-05

### Added

- Added `circular-state` as the seventh external target with a clean-room finite adapter for task selection, task modals, task menus, routes, workspace synchronization, and deterministic mutation descriptors.
- Added pinned-source behavioral verification for Circular's private `open_task_editor` and `sync_workspace` functions without copying upstream source or writing to the upstream repository.

### Fixed

- Found that workspace synchronization can clear `selection.task_id` while leaving `TaskModal` open; minimized to `SelectTask("TSK-1") -> WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)`.
- Removed duplicate incr CLI import/help/list entries left by the previous target integration.

### Changed

- Expanded the external campaign to seven deterministic targets and bumped the package and CLI version to `0.11.0`.
- Documented Circular as a clean-room adapter because the pinned module declares Apache-2.0 but has no standalone LICENSE file.

## 0.10.0 - 2026-08-05

### Added

- Added `incr-typed-spreadsheet` as the sixth external target using the pinned typed worksheet, formula parser, operation runner, and `dowdiness/incr@0.15.0` runtime.
- Added deterministic worksheet recomputation traces plus a real Eq-backed versus no-backdate probe.
- Preserved the Apache-2.0 typed-spreadsheet sources and Rabbita application evidence at revision `afc715b261d99f35245f1a14a2390ae8ad86d7d0`.

### Fixed

- Found that typed spreadsheet integer addition wraps at the Int32 boundary and is returned as a successful value; minimized to `UpdateDraft(A1, "2147483647") -> ApplySelected` for seeded formula `B1=A1+1`.
- Removed a stale Canopy manifest property that was not present in the final adapter.
- Removed a duplicate `expectedFailure` JSON key from external inspection output.

### Changed

- Expanded the external campaign to six deterministic targets and bumped the package and CLI version to `0.10.0`.
- Documented no-backdate's always-false comparator as intentional change-propagation semantics rather than an invalid equality implementation.

## 0.9.0 - 2026-08-05

### Added

- Added `canopy-components` as the fifth external target, combining the pinned Canopy resizable, menu, and tabs pure component semantics in one finite adapter.
- Preserved the Apache-2.0 component sources from `dowdiness/canopy` revision `cb41945b04801084e8abe1d8edc27eb0cdce4a1c` with SHA-256 provenance.
- Split the remaining CodeMirror/Ideal editor phase and incr typed-spreadsheet/backdating phase into dedicated open issues.

### Fixed

- Found that the public resizable `NudgeBy` message can overflow 32-bit addition before clamping, so a positive maximum delta moves width from 120 to the minimum 50; minimized to `ResizeNudge(dw=2147483647, dh=0)`.

### Changed

- Expanded the external campaign to five deterministic targets and bumped the package and CLI version to `0.9.0`.
- Documented that incr's always-false comparison callbacks belong to explicit no-backdate APIs rather than being invalid equality implementations.

## 0.8.0 - 2026-08-05

### Added

- Added `moonbit-editor-file-tree` as the fourth external target with two finite workspace snapshots, recorded directory-resolve effects, overlapping auto-reveal actions, and deterministic response injection.
- Preserved the Apache-2.0 MoonBit Editor file-tree, tree-state, provider, and stylesheet sources at revision `001c9db52bcdc543c2bec8689b70e97941cecc18` with SHA-256 provenance.
- Extended source inspection to recognize named model/message types and method-style `Type::update` / `Type::view` boundaries used by private component models.

### Fixed

- Found that a late failure from an older unrelated directory resolve clears the newer active file's `pending_reveal`; minimized to `ToggleDirectory("readonly-remote://workspace/tests") -> SetActive("readonly-remote://workspace/src/lib/util.mbt") -> DirectoryResolveFailed(request=1, uri="readonly-remote://workspace/tests")`.
- Found that a late successful resolve can re-expand a directory manually collapsed after auto-reveal started; minimized to `SetActive("readonly-remote://workspace/tests/spec.mbt") -> ToggleDirectory("readonly-remote://workspace/tests") -> DirectoryResolveSucceeded(request=1, uri="readonly-remote://workspace/tests", fixture=1)`.

### Changed

- Expanded the external campaign to four deterministic targets and bumped the package and CLI version to `0.8.0`.

## 0.7.0 - 2026-08-05

### Added

- Added `signal-reader` as the third external target using a clean-room finite adapter with recorded HTTP request descriptors and no copied upstream source.
- Added three response-order properties for feed selection, live search, and optimistic saved-state callbacks.
- Added `external handoff <id|all>` to generate local `issue.md`, `reproduction.md`, `fix-plan.md`, `pr-body.md`, and `machine.json` drafts without calling upstream APIs.
- Added `FindingVisibility`, private security disclosure bundles, redacted private run summaries, `.private/` isolation, and `scripts/check_public_disclosure.py`.
- Added English and Japanese disclosure policy documents.

### Fixed

- Found that the pinned Signal Reader frontend can apply a feed response after a different subscription is selected; minimized to `SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)`.
- Found that a stale saved-state success callback can reverse the latest unsave intent.
- Found that an older live-search response can replace results for a newer query.

### Changed

- Required `findingVisibility` in every external manifest.
- Expanded the external campaign to three deterministic targets and bumped the package and CLI version to `0.7.0`.

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
