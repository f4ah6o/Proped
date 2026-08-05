# Vendored demo policy

Proped Rabbita vendors upstream applications when preserving their source materially improves adapter testing, reproducibility, and demonstration value. Every vendor directory records the pinned revision, upstream license, unmodified source, SHA-256 hashes, adaptation boundary, finite exploration constraints, and expected outcome.

All current Rabbita examples are pinned to revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`.

## Included examples

| CLI ID | Upstream path | Source size | Expected | Adapter boundary |
| --- | --- | ---: | --- | --- |
| `rabbita-counter` | `examples/counter` | 26 lines | pass | typed finite counter `[-3, 3]` |
| `rabbita-todo` | `examples/todo` | 281 lines | failure | array-backed items, finite title corpus and item count |
| `rabbita-sokoban` | `examples/sokoban` | 259 lines | failure | typed directions, array history, bounded branching |
| `rabbita-subscriptions` | `examples/subscriptions` | 420 lines | failure | typed deterministic browser events plus one queued timer callback |
| `rabbita-websocket` | `examples/websocket` | 956 lines | failure | deterministic command-client lifecycle and outcomes |
| `proton-demo-todo` | `justjavac/proton-demo frontend/main` | 176 lines | failure | Proton effects recorded and snapshot responses injected |
| `ensenzu-app` | `shiguri-01/ensenzu app/src` | 605 lines | failure | 19-field numeric corpus, native calculation core, deterministic download effect |
| `moonbit-editor-file-tree` | `moonbitlang/editor internal/shell` | 708 lines | failure | two finite workspaces and injected directory-resolve responses |
| `canopy-components` | `dowdiness/canopy` component modules | 471 lines | failure | resizable, menu, and tabs pure finite state |
| `incr-typed-spreadsheet` | `dowdiness/incr` typed spreadsheet | 2,349 preserved lines | failure | isolated runtime replay, worksheet traces, Eq/no-backdate probe |
| `circular-state` | `CAIMEOX/circular web/updater` | clean-room | failure | workspace replacement, modal and selection integrity |
| `isomorphic-suite` | `moonbit-community/isomorphic` Kanban/Todo/Note | clean-room | failure | shared request matrix, CRUD and reference integrity |
| `rabbita-xterm-lifecycle` | `moonbit-community/rabbita_xterm` managed state | native lifecycle adapter | failure | loading, subscriptions, UTF-8 writes, disposal, dimensions |
| `mooncakes-official-ui` | Mooncakes Build Queue + official website/tutorial | exact source fixtures | failure | HTTP response ordering, decoder corpus, website/tutorial state |
| `moonclaw-job` | `vectie/moonclaw ui/rabbita-job/main` | 2 preserved source files | failure | selected run, snapshot requests, stream events, response ordering |

## Counter

The adapter preserves `Inc` and `Dec`, renders the same visible controls, and bounds the model to seven integer states. It is a passing baseline.

## TODO

The upstream update guard rejects only `title == ""`. A whitespace-only title is stored. Property `stored todo titles are not blank` shrinks to:

1. `TitleChanged(" ")`
2. `Add`

The pinned run explores 169 states and 2,251 transitions.

## Sokoban

The upstream timeline parser catches malformed input as index `0`. After any move, invalid text unexpectedly rewinds the cursor rather than preserving the current history point. Property `invalid timeline input preserves cursor` shrinks to:

1. `Move(Up)`
2. `JumpTo("not-a-number")`

The pinned run explores 255 states and 1,163 transitions while checking board, crate, player, history, and rendering invariants.

## Subscriptions

The adapter models one timer callback already queued when pause removes the subscription. The upstream `Tick` update increments unconditionally, so the paused model changes when that stale callback arrives. Property `paused ticker ignores queued tick` shrinks to:

1. `ToggleTicker`
2. `Tick`

The pinned run reaches 640 states and 1,718 transitions across all seven subscription tabs.

## WebSocket

The upstream helper considers `closing` to be a `client_connecting` state. The disconnect button therefore remains enabled while closing, and a second click appends and dispatches another close request. Property `closing client rejects repeated disconnect` shrinks to:

1. `ClientConnectRequested`
2. `ClientDisconnectRequested`
3. `ClientDisconnectRequested`

The pinned run reaches 800 states and 4,428 transitions across connection, send, close, failure, and transcript paths.

## Remaining examples

`shiki_editor`, animation, SSR, and the full website remain browser/build-system candidates. Their useful properties depend on DOM selection, focus, scrolling, animation timing, asset generation, or server boundaries and should use explicit deterministic adapters rather than pretending those effects are pure state transitions.

## Proton Todo

The MIT-licensed Proton Todo frontend is pinned separately from the official Rabbita examples. Native invokes and subscription delivery are recorded as deterministic effect descriptors. The upstream `SnapshotReceived(snapshot)` update does not correlate a response or reject an older version, so property `snapshot version never decreases` shrinks to:

1. `SnapshotReceived(version=1)`
2. `SnapshotReceived(version=0)`

The pinned run explores 320 states and 618 transitions with zero runner diagnostics. This proves acceptance by the update function under the modeled response ordering; it does not claim every transport delivers responses in that order.

## Ensenzu

The Apache-2.0 Ensenzu application and its calculation core are pinned at revision `f1fbec776a393e7023c8fa8324ea26c0774752e5`. The adapter preserves the upstream parsing, pending-input classification, input-source switching, diagram calculation, previous-result retention, reset confirmation, and advanced-setting behavior. Browser download is represented as one deterministic `DomCommand`.

The active `Frequency` field accepts `Infinity`: parsing succeeds and the downstream guard checks only `frequency > 0.0`. Property `active numeric fields reject non-finite input` shrinks to:

1. `Change(Frequency, "Infinity")`

The pinned run explores 834 states and 1,900 transitions with zero runner diagnostics. The action corpus covers all 19 `FieldKey` values with empty, partial, zero, negative, finite, `NaN`, and `Infinity` representatives.


## Signal Reader clean-room adapter

Signal Reader is pinned at revision `e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a`. The module metadata declares MIT, but the pinned revision has no standalone LICENSE file. No upstream source is copied. `src/vendor/signal_reader/` contains an Apache-2.0 clean-room finite adapter and source hashes only.

The adapter records feed, search, and saved-state HTTP requests and injects responses in bounded orders. It retains three failures:

1. `SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)`
2. `ToggleItemSaved(1, true) -> ToggleItemSaved(1, false) -> ItemSavedSet(request=1, item=1, saved=true, success=true)`
3. `OpenSearchModal -> UpdateSearchQuery("alpha") -> UpdateSearchQuery("beta") -> SearchLoaded(request=1, query="alpha")`

The run explores 720 states and 1,265 transitions with zero diagnostics. The adapter demonstrates response acceptance under modeled ordering; it does not claim a particular network scheduler always produces that order.

## MoonBit Editor file tree

The Apache-2.0 file-tree widget is pinned at revision `001c9db52bcdc543c2bec8689b70e97941cecc18`. The upstream model and message types are private and the shell package is JS-only, so the adapter preserves its tree, toggle, resolve, and auto-reveal update semantics over String URIs. Two finite workspace snapshots replace the remote provider, and every directory resolve is recorded as a deterministic `NativeInvoke` descriptor.

The upstream `DirectoryResolved(uri, result)` message has no request or reveal generation. A late failure for an older unrelated directory therefore clears the current `pending_reveal`. Property `asynchronous resolve responses preserve newer tree intent` shrinks to:

1. `ToggleDirectory("readonly-remote://workspace/tests")`
2. `SetActive("readonly-remote://workspace/src/lib/util.mbt")`
3. `DirectoryResolveFailed(request=1, uri="readonly-remote://workspace/tests")`

A second retained trace shows a late successful response re-expanding a directory manually collapsed after auto-reveal started:

1. `SetActive("readonly-remote://workspace/tests/spec.mbt")`
2. `ToggleDirectory("readonly-remote://workspace/tests")`
3. `DirectoryResolveSucceeded(request=1, uri="readonly-remote://workspace/tests", fixture=1)`

The pinned run explores 1,600 states and 2,646 transitions with zero diagnostics. The modeled request ID controls response delivery but is not used as a freshness guard when applying the response, matching the upstream URI-only message boundary.

## Canopy components

Canopy's Apache-2.0 `rabbita-resizable`, `rabbita-menu`, and `rabbita-tabs` modules are pinned at revision `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`. The adapter preserves the pure component update semantics and replaces pointer, keyboard, focus, and dispatch boundaries with typed finite actions.

The public resizable message accepts arbitrary `Int` deltas and adds them before clamping. MoonBit Int32 wrapping makes a maximum positive nudge move an interior width backward to the minimum:

1. `ResizeNudge(dw=2147483647, dh=0)`

The run explores 720 states and 2,618 transitions with one retained failure and zero diagnostics. Constraint bounds, stale movement after `EndResize`, menu focus range, tab selection, and rendered-state properties pass. The normal keyboard integration emits small deltas, so the failure is scoped to direct dispatch or malformed generated input. Disabled menu/tab selection is not tested because the pinned component APIs have no disabled-entry model.

CodeMirror, context-menu nesting, and the Ideal editor continue in a separate issue.

## incr typed spreadsheet

The Apache-2.0 typed worksheet, formula parser, operation runner, and Rabbita model evidence are pinned at revision `afc715b261d99f35245f1a14a2390ae8ad86d7d0`; builds use `dowdiness/incr@0.15.0`. The finite adapter reconstructs an isolated runtime from committed text for each transition, preventing mutable graph state from crossing exploration branches while retaining exact worksheet snapshots and recomputation traces.

With seeded formula `B1=A1+1`, setting A1 to the largest Int wraps B1 to a negative successful result:

1. `UpdateDraft(A1, "2147483647")`
2. `ApplySelected`

The run explores 900 states and 1,347 transitions with one retained failure and zero diagnostics. Parse failure preservation, delete propagation, changed-formula trace classification, stale inline blur, and rendered-state checks pass.

A real runtime probe also fixes the intended backdating distinction for input 4→6, where parity remains even: Eq-backed middle/downstream counts are 2/1, while `derived_no_backdate` counts are 2/2. The no-backdate always-false comparator is intentional propagation semantics, not an invalid equality implementation.

## Circular clean-room state adapter

Circular is pinned at revision `bf8549a9c13505f3dc5632347acfffbba864c406`. Its `moon.mod` declares Apache-2.0, but the revision has no standalone LICENSE file, so Proped Rabbita does not copy upstream source. The adapter preserves the public state/message shape and selected private updater semantics in a finite clean-room model.

A pinned-source wbtest opened `TaskModal` for `TSK-1` and then called `sync_workspace` with a task-free workspace. The updater cleared `selection.task_id` but preserved `TaskModal`. The external target minimizes the equivalent behavior to:

1. `SelectTask("TSK-1")`
2. `WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)`

The run explores 580 states and 2,456 transitions with one retained failure and zero diagnostics. NoOp, route cleanup, task-menu integrity, effect identity, and rendered-state properties pass. The temporary upstream probe was removed after execution and no upstream write was performed.

## Isomorphic suite

The Kanban, Todo, and Note applications are pinned at revision `590ac1c4de71050419cc6643942e0d1f181301aa`. Each application declares Apache-2.0 in `moon.mod.json`, but the pinned repository has no standalone license file, so Proped Rabbita stores no upstream source and uses a clean-room finite adapter.

One matrix harness preserves the three Elm/MVU response branches and replaces HTTP work with stable per-application request descriptors. The run reaches 1,400 states and 2,288 transitions with four retained failures and zero diagnostics:

1. `KanbanSelectCardToMove(1) -> KanbanMoveCardTo(column=99, index=0)` creates a card that references a missing column.
2. `KanbanInit -> KanbanDeleteCard(1) -> KanbanBoardLoaded(request=101, fixture=0)` restores a newer optimistic deletion.
3. `SwitchApp(todo) -> TodoDelete(1) -> TodoInit -> TodoDeleted(request=2301, todo=1, success=true) -> TodoListLoaded(request=201, fixture=0)` overwrites a newer Todo mutation.
4. `SwitchApp(note) -> NoteInit -> NoteSelect(1) -> NoteListLoaded(request=301, fixture=1)` leaves a selected ID whose note is absent.

Common entity-ID uniqueness, pending request identity, and rendered active-app properties pass. Remaining Isomorphic frontends are recorded in the closed issue checklist for later expansion.


## Moonclaw Rabbita job UI

Moonclaw's Apache-2.0 Jobs surface is pinned at revision `5fdc845f2a926cdd17260fb9720135a2c50eff38`. The adapter preserves the `SnapshotLoaded(run_id, result)` acceptance rule while adding request IDs only as harness delivery metadata. HTTP and stream work are descriptors and no Moonclaw daemon is executed.

Two stream closures create two snapshot requests. Delivering request 2 as `Succeeded` and then request 1 as `Running` replaces the terminal state because the pinned update checks only the selected run ID. The trace shrinks to:

1. `StreamClosed("run-1")`
2. `StreamClosed("run-1")`
3. `SnapshotLoaded(request=2, run="run-1", status=Succeeded)`
4. `SnapshotLoaded(request=1, run="run-1", status=Running)`

The run explores 720 states and 2,269 transitions with one retained failure and zero diagnostics. Other-run responses, timeline duplicates, pending request identity, and rendered-state properties pass. The pinned Jobs surface has no direct cancel or retry message; ACP and Cowork controls are outside this adapter instead of being approximated.


## Mooncakes official UI suite

The production Mooncakes Build Queue is pinned at revision `f7877338598f6a13387b889dd912b15029a0ce5f`, the official Rabbita website home at `a6222f7292ce50f2a08847ef0852b1a8d456a393`, and the official full-stack tutorial frontend at `24f6b9a0b9ac997119ecd3069825edf65d3473fe`. The Mooncakes and website fixtures are covered by their Apache-2.0 repository licenses. `moonbit-docs/LICENSE.md` explicitly licenses code examples and website code under Apache-2.0, and that statement is preserved with the vendor fixture.

`GotBuilds` carries a decoded result but no request generation. The finite adapter records HTTP effects and then injects success, network failure, or malformed decoder responses without consulting harness-only request IDs. The primary property shrinks to:

1. `ReloadBuilds`
2. `BuildsDecodeFailed(request=2, corpus=missing-collections)`
3. `BuildsLoaded(request=1, fixture=older)`

A second failure retains the official tutorial boundary:

1. `ShowSurface(tutorial)`
2. `EditTitle("alpha")`
3. `SubmitTitle`
4. `EditTitle("beta")`
5. `TutorialReply(request=2, title="alpha", success=false)`

The run explores 780 states and 4,856 transitions with two retained failures and zero diagnostics. Queue/recent status alignment, malformed queued/recent item corpora, official website tab/carousel bounds, pending request identity, and rendered-state properties pass. Browser DOM, Shiki, real HTTP, clocks, and backend validation are explicitly outside the adapter.
