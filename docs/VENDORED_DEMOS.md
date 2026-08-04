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
