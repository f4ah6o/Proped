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
