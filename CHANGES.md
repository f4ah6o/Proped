# Changes

## Unreleased

### Added

- Added a reusable Web mutation quality-gate API with machine-readable failure codes for mutation score, healthy-control false positives, deterministic replay, minimized-trace drift, throughput, and elapsed time.
- Added fail-closed benchmark CLI options for iteration count, quality thresholds, custom artifact output, artifact suppression, and help.
- Added a manifest-driven Web project runner with ordered dependency stages, bounded execution, fail-closed exit classification, repository-root path confinement, and unified JSON/HTML/SVG/DOT artifacts.
- Integrated the React, Vue, Playwright, cross-mode replay, Next.js, Nuxt, external dogfood, network/timer, and mutation quality checks behind one CI Web quality manifest.
- Added a framework-neutral real-browser TodoMVC contract and dogfooded pinned `tastejs/todomvc` React/Vue production builds, producing deterministic machine-readable specification failures without upstream writes.

### Changed

- Generalized Web project runner quality summaries so non-mutation quality stages expose `failures[].code`, `property`, or `failureClass` as Atlas `qualityFailureCodes`.

## 0.35.0 - 2026-08-06

### Added

- Added a manifest-driven external React, Vue, Next.js, and Nuxt dogfood campaign with pinned permissive-license revisions, reviewed reduced source boundaries, SHA-256 verification, finite exploration, deterministic replay signatures, and generated Atlas artifacts.
- Added explicit descriptor-only diagnostics for unsupported framework effects and a committed zero-failure golden report covering four targets without upstream writes.

### Changed

- Bumped the package and CLI version to `0.35.0`.

## 0.34.0 - 2026-08-06

### Added

- Added a framework-neutral Web mutation benchmark covering all eight generic Web properties with synthetic faulty runtimes and paired healthy controls.
- Added deletion shrinking, fresh replay signatures, mutation score, false-positive rate, bounded throughput measurement, machine-readable fixtures, and generated Atlas artifacts.

### Changed

- Bumped the package and CLI version to `0.34.0`.

## 0.33.0 - 2026-08-06

### Added

- Added an actual Nuxt 4.4 production fixture covering SSR, Vue hydration comparison, `useAsyncData`, global route middleware, Nitro GET/POST routes, explicit hydration settling, and fresh Browser Context reset.
- Added a deterministic Nuxt hydration-warning failure, descriptor-only server-route diagnostics, loopback-only browser routing, generated Atlas artifacts, and an audited dependency lockfile.

### Changed

- Bumped the package and CLI version to `0.33.0`.

## 0.32.0 - 2026-08-06

### Added

- Added an actual Next.js 16.3 production fixture covering App Router and Pages Router SSR, hydration comparison, fresh Browser Context reset, and Playwright route isolation.
- Added deterministic hydration-warning failures for both routers, a descriptor-only App Router Server Action boundary, a fail-closed Pages Router Server Action diagnostic, and generated Atlas artifacts.

### Changed

- Bumped the package and CLI version to `0.32.0`.

## 0.31.0 - 2026-08-06

### Added

- Added Component Mode to Browser Mode replay with stable action ID parsing, exact-first mapping, unique scope relaxation, fresh Chromium fixture replay, and cross-runtime failure signatures.
- Added six bounded replays covering React and Vue stale-response, duplicate-submit, and invalid-number failures, plus fail-closed diagnostics for metadata mismatch, missing actions, and ambiguous mappings.

### Changed

- Bumped the package and CLI version to `0.31.0`.

## 0.30.0 - 2026-08-06

### Added

- Added Playwright Browser Mode with a real Chromium context, in-memory fixture routing, semantic action discovery, route/focus/storage/console snapshots, explicit readiness settling, and fresh-context replay.
- Added a 128-transition bounded browser fixture that retains stale-response, duplicate-submit, and invalid-number-input failures while proving that an external fetch is aborted before network access.

### Changed

- Pinned the CI Node.js runtime to version 22 and added Playwright-managed headless Chromium installation.
- Bumped the package and CLI version to `0.30.0`.

## 0.29.0 - 2026-08-06

### Added

- Added a deterministic virtual network and fake-timer schedule runtime with stable issue, abort, reject, deliver, clock-advance, and timer-fire actions.
- Added bounded schedule exploration, fresh-fixture replay, deletion shrinking, replay signatures, and generated Atlas artifacts.
- Added machine-readable detection for stale responses, commits after abort, retry-budget overflow, and duplicate callback invocation.

### Changed

- Real network and real timers are explicitly denied at the scheduling boundary; external effects must be deterministic descriptors.
- Bumped the package and CLI version to `0.29.0`.

## 0.28.0 - 2026-08-06

### Added

- Added Vue Component Mode with an actual Vue 3.5/Pinia 4/JSDOM fixture, `nextTick` settling, Suspense, Teleport, Pinia state, semantic snapshots, generic properties, replay, shrinking, and Atlas artifacts.
- Added a 10,000-transition bounded Vue benchmark that retains stale-response, duplicate-submit, and invalid-number-input failures.

### Changed

- Bumped the package and CLI version to `0.28.0`.

## 0.27.0 - 2026-08-06

### Added

- Added React Component Mode with an actual React 19/JSDOM fixture, semantic action discovery, normalized snapshots, generic property evaluation, deterministic replay, deletion shrinking, and HTML/JSON/SVG/DOT artifacts.
- Added a 10,000-transition bounded React benchmark that retains stale-response, duplicate-submit, and invalid-number-input failures.

### Changed

- Bumped the package and CLI version to `0.27.0`.

## 0.26.0 - 2026-08-06

### Added

- Added the framework-neutral generic Web property pack with severity policy, bounded fixtures, machine-readable diagnostics, and replayable failure signatures.

### Changed

- Bumped the package and CLI version to `0.26.0`.

## 0.25.0 - 2026-08-05

### Added

- Added framework-neutral accessible action discovery from role, accessible name, ancestor scope, stable test identity, and bounded input corpus.
- Added fail-closed `ambiguous_action` diagnostics for duplicate semantic identities.

### Changed

- Bumped the package and CLI version to `0.25.0`.

## 0.24.0 - 2026-08-05

### Added

- Added framework-neutral semantic DOM snapshot normalization with stable fingerprints for URL, forms, focus, storage, pending effects, and optional application state.
- Added machine-readable state identity collision evidence and a bounded normalization fixture covering unstable framework IDs, timestamps, request IDs, and random tokens.

### Changed

- Bumped the package and CLI version to `0.24.0`.

## 0.23.0 - 2026-08-05

### Added

- Added a MoonBit-native bounded stale-search machine and a Node JSONL host that delegates exploration and replay to the existing Proped core.
- Added timeout, process cleanup, disposed-session handling, unsupported-effect mapping, and deterministic replay signatures.

### Changed

- Bumped the package and CLI version to `0.23.0`.

## 0.22.0 - 2026-08-05

### Added

- Shipped the production Web UI driver protocol v1 modules with strict JSONL envelopes, capability negotiation, stable error codes, timeout handling, disposal, and shutdown.
- Added a bounded stale-search fixture that emits deterministic replay and failure signatures across in-process and child-process transports.

### Changed

- Closed the Web driver protocol v1 issue and bumped the package and CLI version to `0.22.0`.

## 0.21.0 - 2026-08-05

### Added

- Added Web UI driver protocol v1, snapshot/settle/replay contracts, a native JSONL hosting ADR, and a React spike manifest.
- Added a direct-versus-JSONL parity spike that retains the same stale-search failure, minimized trace, and semantic hash.
- Split the React, Vue, Playwright, Next.js, Nuxt, property, scheduling, replay, benchmark, and dogfood implementation into independent issues.

### Changed

- Closed the cross-framework proposal after Phase 0 and bumped the package and CLI version to `0.21.0`.

## 0.20.0 - 2026-08-05

### Added

- Added read-only upstream revision diff reporting for the utility batch, including commit counts, changed target paths, and recomputed source hashes.
- Added generated Atlas interaction E2E coverage for state/transition selection, keyboard activation, failure links, sandboxed previews, and English/Japanese switching.

### Fixed

- Expanded the utility batch to 3,400 states and 7,646 transitions and retained the Issues Dashboard reverse `GraphSaved` rollback as a four-action minimal failure.

### Changed

- Bumped the package and CLI version to `0.20.0`.

## 0.19.0 - 2026-08-05

### Added

- Restored an interactive Atlas Inspector on top of the existing Flow Canvas identities, with selectable states and transitions, rendered state previews, metadata, related transitions, minimized failure traces, and English/Japanese switching.
- Added `canopy-editor-integration` as a browser-replay external target for CodeMirror mount, document, selection, focus, unmount, and Ideal callback boundaries.
- Added `rabbita-utility-batch` plus `external/utility-apps.json` and `scripts/utility_batch.py` to classify ten public Rabbita repositories, validate pinned revisions and source hashes, and execute generic properties for four supported boundaries.

### Fixed

- Found that reverse-ordered Canopy document callbacks can replace a newer accepted revision, minimized to five actions; also retained the four-action queued-callback-after-unmount failure.
- Found that `beso1225/fullstack_trial_moonbit` can submit its initial empty title because the initial cached warning is `None`, minimized to `FullstackSubmit`.
- Preserved secondary utility-batch failures for reverse `GraphSaved` delivery and a late Fullstack reply after a newer edit.
- Fixed Atlas JSON escaping for non-BMP Unicode such as emoji; generated artifacts now remain valid JSON instead of emitting MoonBit-specific `\u{...}` escapes.

### Changed

- Expanded the external campaign and CI matrix from thirteen to fifteen runnable targets and completed classification of the remaining Tier 3 repositories plus Proton framework internals.
- Added stable `data-flow-node` and `data-flow-edge` identities to standalone Flow SVG output without changing Atlas JSON or DOT contracts.
- Bumped the package and CLI version to `0.19.0`.

## 0.18.0 - 2026-08-05

### Added

- Added `openseek-desktop-lifecycle` as the thirteenth external target with three bounded submodels for self-update, terminal, and file-editor behavior.
- Preserved seven Apache-2.0 OpenSeek frontend source files at revision `b21e078a4f3cdd11129b4d33348dcc09abf22026` with combined SHA-256 provenance.

### Fixed

- Found that a production update-check reply can be accepted after switching the provider to staging because `UpdateCheckFinished` carries no request generation or update channel.
- Found that repeated `EmulatorReady` messages can issue duplicate `terminal.open` requests while the tab remains `TabOpening` with no pending marker.
- Found that reverse-ordered duplicate file reads can replace newer content because `FileLoaded` correlates only by owner and path.

### Changed

- Expanded the external CI matrix to thirteen targets and bumped the package and CLI version to `0.18.0`.
- Recorded that the pinned upstream package currently fails under the active compiler in a resolved `moonbitlang/editor` dependency, while the exact source boundary remains independently reproducible.

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
