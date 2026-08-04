# Vendored demo policy

Proped Rabbita vendors small upstream applications only when preserving their source materially improves adapter testing, reproducibility, and demonstration value.

## Rabbita counter

- Upstream repository: `moonbit-community/rabbita`
- Upstream path: `examples/counter`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache-2.0
- Preserved source: `src/vendor/rabbita_counter/upstream/main.mbt.txt`
- Adapter package: `src/vendor/rabbita_counter/counter.mbt`

The adapter keeps the upstream `Inc` and `Dec` update semantics and visible heading/buttons. It changes the application boundary from a mounted browser executable to a reusable pure package, then bounds generated actions to `[-3, 3]` so deterministic state exploration terminates.

## Additional upstream examples

| Example class | Representative Rabbita examples | Adapter concern |
| --- | --- | --- |
| Pure local state | `grocery`, `todo`, `sokoban` | Explicit action enumeration, stable fingerprints, finite exploration bounds |
| Browser/editor behavior | `shiki_editor` | Selection, focus, keyboard input, layout, and browser adapter boundaries |
| External I/O | `websocket` | Deterministic command interpreter, mocks, timeouts, and replayable responses |
| Build-system application | `website/playground` | Warren and asset generation boundaries before model exploration |

Only the counter is included in the executable CLI. The classification records why larger examples require additional execution boundaries rather than implying that arbitrary Rabbita applications can be analyzed without an adapter.
