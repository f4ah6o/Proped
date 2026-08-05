# Third-party notices

## Rabbita counter example

Proped Rabbita includes and adapts source from the Rabbita project:

- Project: `moonbit-community/rabbita`
- Source path: `examples/counter`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_counter/upstream/main.mbt.txt`
- Adapted source: `src/vendor/rabbita_counter/counter.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/rabbita_counter/LICENSE`. Modified files identify the changes made for reusable, finite, deterministic state exploration.

## Rabbita todo example

Proped Rabbita includes and adapts source from the Rabbita project:

- Project: `moonbit-community/rabbita`
- Source path: `examples/todo`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_todo/upstream/main.mbt.txt`
- Preserved stylesheet: `src/vendor/rabbita_todo/upstream/styles.css`
- Adapted source: `src/vendor/rabbita_todo/todo.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/rabbita_todo/LICENSE`. The adapter file identifies the changes made to expose a pure reusable model, bound generated state, render without browser mounting, and detect whitespace-only stored titles.

## Rabbita Sokoban example

- Project: `moonbit-community/rabbita`
- Source path: `examples/sokoban`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_sokoban/upstream/main.mbt.txt`
- Preserved stylesheet: `src/vendor/rabbita_sokoban/upstream/styles.css`
- Adapted source: `src/vendor/rabbita_sokoban/sokoban.mbt`

The upstream license is included at `src/vendor/rabbita_sokoban/LICENSE`.

## Rabbita subscriptions example

- Project: `moonbit-community/rabbita`
- Source path: `examples/subscriptions`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_subscriptions/upstream/client.mbt.txt`
- Preserved stylesheet: `src/vendor/rabbita_subscriptions/upstream/styles.css`
- Adapted source: `src/vendor/rabbita_subscriptions/subscriptions.mbt`

The upstream license is included at `src/vendor/rabbita_subscriptions/LICENSE`.

## Rabbita WebSocket example

- Project: `moonbit-community/rabbita`
- Source path: `examples/websocket`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_websocket/upstream/client.mbt.txt`
- Preserved stylesheet: `src/vendor/rabbita_websocket/upstream/styles.css`
- Adapted source: `src/vendor/rabbita_websocket/websocket.mbt`

The upstream license is included at `src/vendor/rabbita_websocket/LICENSE`.

## Proton Todo frontend

- Project: `justjavac/proton-demo`
- Source path: `frontend/main/main.mbt` and `frontend/public/styles.css`
- Revision: `5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d`
- License: MIT
- Preserved source: `src/vendor/proton_todo/upstream/main.mbt.txt`
- Preserved stylesheet: `src/vendor/proton_todo/upstream/styles.css`
- Adapted source: `src/vendor/proton_todo/proton_todo.mbt`

The full MIT license is included at `src/vendor/proton_todo/LICENSE`. The adapter replaces Proton bridge execution with deterministic effect descriptors and preserves the uncorrelated snapshot update behavior for bounded response-order exploration.


## Ensenzu application and calculation core

- Project: `shiguri-01/ensenzu`
- Source paths: `app/src`, `app/styles.css`, and `ensenzu/`
- Revision: `f1fbec776a393e7023c8fa8324ea26c0774752e5`
- License: Apache License 2.0
- Preserved application source: `src/vendor/ensenzu_app/upstream/`
- Adapted application source: `src/vendor/ensenzu_app/ensenzu_app.mbt`
- Preserved calculation source: `src/vendor/ensenzu_core/`

The Apache License 2.0 text is included in both vendor directories. The calculation source is vendored because the upstream workspace references `shiguri-01/ensenzu@0.1.0`, but that module is not available from the public MoonBit registry. The application adapter replaces only the browser download command and exploration boundary; source revision, hashes, and changes are documented in each `UPSTREAM.md`.


## Signal Reader behavioral reference

- Project: `CAIMEOX/signal_reader`
- Revision: `e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a`
- Module-declared license: MIT
- Relevant paths: `frontend/model.mbt`, `frontend/update.mbt`, `frontend/commands.mbt`
- Adapter: `src/vendor/signal_reader/signal_reader.mbt`

The pinned revision does not include a standalone LICENSE file. No upstream source is included in Proped Rabbita. The adapter is a clean-room finite behavioral model; exact source hashes and the modeled boundary are recorded in `src/vendor/signal_reader/UPSTREAM.md`.


## MoonBit Editor file tree

- Project: `moonbitlang/editor`
- Source paths: `internal/shell/widgets/file_tree/file_tree.mbt`, `tree_state.mbt`, `file_tree.css`, and `internal/shell/workbench/tree_provider.mbt`
- Revision: `001c9db52bcdc543c2bec8689b70e97941cecc18`
- License: Apache License 2.0
- Preserved source: `src/vendor/moonbit_editor_file_tree/upstream/`
- Adapted source: `src/vendor/moonbit_editor_file_tree/editor_file_tree.mbt`

The Apache License 2.0 text is included at `src/vendor/moonbit_editor_file_tree/LICENSE`. The native adapter replaces private URI and provider boundaries with two finite workspace snapshots and deterministic resolve descriptors while preserving the upstream tree-update and auto-reveal semantics. Exact source hashes and adaptation notes are recorded in `src/vendor/moonbit_editor_file_tree/UPSTREAM.md`.

## Canopy Rabbita components

- Project: `dowdiness/canopy`
- Source paths: `modules/rabbita-resizable/resizable`, `modules/rabbita-menu/menu`, and `modules/rabbita-tabs/tabs`
- Revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- License: Apache License 2.0
- Preserved source: `src/vendor/canopy_components/upstream/`
- Adapted source: `src/vendor/canopy_components/canopy_components.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/canopy_components/LICENSE`. The adapter combines the three private-state component models into a finite native/JavaScript exploration target and replaces browser event, focus, and subscription boundaries with typed messages. Exact source hashes and scope qualifications are recorded in `src/vendor/canopy_components/UPSTREAM.md`.

## Canopy CodeMirror and Ideal integration

- Project: `dowdiness/canopy`
- Source paths: `modules/rabbita_codemirror/codemirror.mbt`, `examples/codemirror/main/client.mbt`, and `apps/ideal/main/update_codemirror.mbt`
- Revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- License: Apache License 2.0
- Preserved source: `src/vendor/canopy_editor_integration/upstream/`
- Adapted source: `src/vendor/canopy_editor_integration/canopy_editor_integration.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/canopy_editor_integration/LICENSE`. The browser-replay adapter preserves command and callback boundaries while modeling callback generation and delivery separately. Exact source hashes and the pure-versus-browser classification are recorded in `src/vendor/canopy_editor_integration/UPSTREAM.md`.

## Rabbita utility batch sources

The supported utility batch preserves only sources whose pinned repositories include an explicit license:

- `CAIMEOX/symweb`, revision `a37f96d283b4bdbb2d1654ca88a9c26033db6c46`, Apache License 2.0, `playground/app.mbt`.
- `bobzhang/issues`, revision `a348501b2ca848d6564557b58446269c90ba4e3a`, Apache License 2.0, `dashboard/dashboard.mbt`.
- `beso1225/fullstack_trial_moonbit`, revision `5ed67d454600210861eb4ba8178aa91e1e34406f`, Apache License 2.0, `frontend/main.mbt`.
- `moonbit-community/proton`, revision `7e819f385af0c7cc7b78397281b1ab5c3306bc5f`, Apache License 2.0, `rabbita/adapter.mbt` and `rabbita/adapter_wbtest.mbt`.

Preserved files and their license texts are under `src/vendor/rabbita_utility_batch/upstream/`. The remaining utility repositories are represented by metadata and source hashes in `external/utility-apps.json`; repositories without an explicit license are not vendored. The clean-room adapter is `src/vendor/rabbita_utility_batch/rabbita_utility_batch.mbt`.

## incr typed spreadsheet

- Project: `dowdiness/incr`
- Source paths: `examples/typed_spreadsheet`, `examples/typed_spreadsheet_demo`, `examples/typed_spreadsheet_rabbita_demo`, and `incr/cells`
- Revision: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`
- Published package: `dowdiness/incr@0.15.0`
- License: Apache License 2.0
- Preserved source: `src/vendor/incr_typed_spreadsheet_core/`, `src/vendor/incr_typed_spreadsheet_demo/`, and `src/vendor/incr_typed_spreadsheet/upstream/`
- Adapted source: `src/vendor/incr_typed_spreadsheet/incr_typed_spreadsheet.mbt`

The Apache License 2.0 text is included in each vendor package. The adapter limits the UI to three cells, reconstructs isolated runtimes for deterministic branch exploration, and preserves the published incr equality/backdating behavior. Exact source hashes and adaptation boundaries are recorded in each `UPSTREAM.md`.

## Circular behavioral reference

- Project: `CAIMEOX/circular`
- Revision: `bf8549a9c13505f3dc5632347acfffbba864c406`
- Module-declared license: Apache-2.0
- Relevant paths: `web/state/`, `web/updater/`, and `web/task/`
- Adapter: `src/vendor/circular_state/circular_state.mbt`

The pinned revision has no standalone LICENSE file. No upstream source is included in Proped Rabbita. The adapter is a clean-room finite behavioral model; exact source hashes, the temporary pinned-source verification, and the modeled boundary are recorded in `src/vendor/circular_state/UPSTREAM.md`.

## Isomorphic suite behavioral reference

- Project: `moonbit-community/isomorphic`
- Revision: `590ac1c4de71050419cc6643942e0d1f181301aa`
- Covered paths: `kanban/frontend/app`, `todoapp/frontend/app`, and `noteapp/frontend/app`
- Module-declared license: Apache-2.0 in each application's `moon.mod.json`
- Adapter: `src/vendor/isomorphic_suite/isomorphic_suite.mbt`

The pinned repository has no standalone LICENSE file. No upstream source is included in Proped Rabbita. The adapter is a clean-room finite behavioral model; exact source and module-metadata hashes, modeled response boundaries, and the remaining application checklist are recorded in `src/vendor/isomorphic_suite/UPSTREAM.md` and the closed exploration issue.

## Rabbita xterm managed state

- Project: `moonbit-community/rabbita_xterm`
- Source path: `xterm.mbt`
- Revision: `9734f6a39ce3899dbf6738fa3a100c2cebaefc23`
- License: Apache License 2.0
- Preserved source: `src/vendor/rabbita_xterm_lifecycle/upstream/xterm.mbt.txt`
- Adapted source: `src/vendor/rabbita_xterm_lifecycle/rabbita_xterm_lifecycle.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/rabbita_xterm_lifecycle/LICENSE`. The native adapter replaces browser objects, DOM mounting, dynamic imports, and listener handles with deterministic generation-tagged lifecycle messages while preserving managed resize semantics.


## Moonclaw Rabbita job UI

- Project: `vectie/moonclaw`
- Source path: `ui/rabbita-job/main/update.mbt` and `model_types.mbt`
- Revision: `5fdc845f2a926cdd17260fb9720135a2c50eff38`
- License: Apache License 2.0
- Preserved source: `src/vendor/moonclaw_job/upstream/`
- Adapted source: `src/vendor/moonclaw_job/moonclaw_job.mbt`

The upstream Apache License 2.0 text is included at `src/vendor/moonclaw_job/LICENSE`. The adapter replaces HTTP and browser stream effects with deterministic descriptors and retains the selected-run-only snapshot acceptance behavior for response-order exploration.


## Mooncakes and official MoonBit Rabbita UI fixtures

- Projects: `moonbitlang/mooncakes.io`, `moonbitlang/website`, and `moonbitlang/moonbit-docs`
- Revisions: `f7877338598f6a13387b889dd912b15029a0ce5f`, `a6222f7292ce50f2a08847ef0852b1a8d456a393`, and `24f6b9a0b9ac997119ecd3069825edf65d3473fe`
- License: Apache License 2.0
- Preserved sources:
  - `src/vendor/mooncakes_official_ui/upstream/build_queue_state.mbt.txt` — `5d29edd1b217e531267cb7204c298a6b00bc7c8a1484f022fa99cc856d0fc9e3`
  - `src/vendor/mooncakes_official_ui/upstream/build_queue_view.mbt.txt` — `36ee6aa27c98d528ae80e91c7e67965e64d6981d76e67b7c725bec50b34ad4f0`
  - `src/vendor/mooncakes_official_ui/upstream/website_home_main.mbt.txt` — `d6aabd76c9054b3f47a2d84688a576d88f07a04c1fc64d1ae68587665a973891`
  - `src/vendor/mooncakes_official_ui/upstream/tutorial_frontend_main.mbt.txt` — `b1d0d909359d9fcfff399799723e468b1cdf19561f057763c4dd03865cbfa809`
- Adapted source: `src/vendor/mooncakes_official_ui/mooncakes_official_ui.mbt`

The Apache License 2.0 text is included at `src/vendor/mooncakes_official_ui/LICENSE`. The MoonBit documentation repository license statement is preserved at `src/vendor/mooncakes_official_ui/LICENSE.moonbit-docs.md`; it identifies code examples and website code as Apache-2.0. The adapter replaces HTTP and browser boundaries with deterministic descriptors while preserving the pinned Build Queue result replacement, website index state, and tutorial reply lifecycle.


## Selene Editor frontend

- Project: `moonbit-community/selene`
- Source paths: `selene-editor-frontend/frontend/app` and selected frontend views
- Revision: `ca68f3a2898a80db9fc45ff96713d1531814371d`
- License: Apache License 2.0
- Preserved source: `src/vendor/selene_editor_assets/upstream/`
- Adapted source: `src/vendor/selene_editor_assets/selene_editor_assets.mbt`
- Combined preserved-source SHA-256: `00a4443e3c035b2b089771584d7efe0ecbf42ff469eb2153f82880091804fbd2`

The upstream Apache License 2.0 text is included at `src/vendor/selene_editor_assets/LICENSE`. The adapter replaces browser DOM, WebGPU, filesystem, SSE, and preview-engine execution with deterministic effect descriptors and typed event replay while preserving initialization, asset-list replacement, entity-selection normalization, and asset-panel rendering behavior.


## OpenSeek desktop frontend

- Project: `moonbitlang/openseek`
- Source paths: `desktop/frontend/model.mbt`, `update.mbt`, `self_update.mbt`, `terminal/state.mbt`, `terminal/update.mbt`, `fileeditor/state.mbt`, and `fileeditor/update.mbt`
- Revision: `b21e078a4f3cdd11129b4d33348dcc09abf22026`
- License: Apache License 2.0
- Preserved source: `src/vendor/openseek_desktop_lifecycle/upstream/`
- Adapted source: `src/vendor/openseek_desktop_lifecycle/openseek_desktop_lifecycle.mbt`
- Combined preserved-source SHA-256: `f649bdad2293cacc60f752eb422d4c744e54fad58027d4e903dc6b0316bc214b`

The upstream Apache License 2.0 text is included at `src/vendor/openseek_desktop_lifecycle/LICENSE`. The clean-room adapter replaces desktop bridge, PTY, filesystem, DOM, and network operations with deterministic effect descriptors while preserving selected self-update, terminal-open, and file-load acceptance rules. Exact source hashes, toolchain limitations, and scope qualifications are recorded in `src/vendor/openseek_desktop_lifecycle/UPSTREAM.md`.

## React Component Mode test runtime

- React 19.2.8 and React DOM 19.2.8, Meta Platforms, Inc. and affiliates, MIT License.
- jsdom 29.1.1, jsdom contributors, MIT License.

These dependencies are pinned by `web/react-component/package-lock.json` and are used only by the isolated React Component Mode fixture and CI benchmark. Their transitive dependency versions are recorded in that lockfile.
