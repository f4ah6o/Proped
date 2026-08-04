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

## incr typed spreadsheet

- Project: `dowdiness/incr`
- Source paths: `examples/typed_spreadsheet`, `examples/typed_spreadsheet_demo`, `examples/typed_spreadsheet_rabbita_demo`, and `incr/cells`
- Revision: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`
- Published package: `dowdiness/incr@0.15.0`
- License: Apache License 2.0
- Preserved source: `src/vendor/incr_typed_spreadsheet_core/`, `src/vendor/incr_typed_spreadsheet_demo/`, and `src/vendor/incr_typed_spreadsheet/upstream/`
- Adapted source: `src/vendor/incr_typed_spreadsheet/incr_typed_spreadsheet.mbt`

The Apache License 2.0 text is included in each vendor package. The adapter limits the UI to three cells, reconstructs isolated runtimes for deterministic branch exploration, and preserves the published incr equality/backdating behavior. Exact source hashes and adaptation boundaries are recorded in each `UPSTREAM.md`.
