# Vendored demo policy

Proped Rabbita vendors upstream applications when preserving their source materially improves adapter testing, reproducibility, and demonstration value. Each vendored demo records its revision, license, unmodified source, SHA-256 hashes, adaptation boundary, finite exploration constraints, and observed properties.

## Rabbita counter

- Upstream repository: `moonbit-community/rabbita`
- Upstream path: `examples/counter`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- License: Apache-2.0
- Preserved source: `src/vendor/rabbita_counter/upstream/main.mbt.txt`
- Adapter package: `src/vendor/rabbita_counter/counter.mbt`
- Expected outcome: pass

The adapter keeps the upstream `Inc` and `Dec` update semantics and visible heading/buttons. It changes the application boundary from a mounted browser executable to a reusable pure package, then bounds generated actions to `[-3, 3]` so deterministic state exploration terminates.

## Rabbita todo

- Upstream repository: `moonbit-community/rabbita`
- Upstream path: `examples/todo`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Upstream source size: 281 MoonBit lines
- License: Apache-2.0
- Preserved source: `src/vendor/rabbita_todo/upstream/main.mbt.txt`
- Adapter package: `src/vendor/rabbita_todo/todo.mbt`
- Expected outcome: failure

The adapter preserves the upstream model concepts and action semantics for title changes, add, delete, toggle, and tab selection. It replaces the browser-mounted state container with a pure model package, bounds generated items to two, and uses a finite title corpus. The rendered adapter retains the form, tab counts, filtered item list, status toggle, delete action, and statistics view.

The upstream update logic handles `Add if title == ""` as a no-op but accepts whitespace-only input. The property `stored todo titles are not blank` discovers this behavior. With seed `29`, 192 cases, depth `14`, and at most 320 states, the run explores 169 states and 2,251 transitions and shrinks the counterexample to:

1. `TitleChanged(" ")`
2. `Add`

Repeated discoveries from generated cases are normalized to the shortest counterexample for that property.

## Additional upstream examples

| Example class | Representative Rabbita examples | Adapter concern |
| --- | --- | --- |
| Stateful game | `sokoban` | History branching, keyboard abstraction, board invariants, larger state spaces |
| Browser/editor behavior | `shiki_editor` | Selection, focus, keyboard input, layout, and browser adapter boundaries |
| External I/O | `websocket` | Deterministic command interpreter, mocks, timeouts, and replayable responses |
| Build-system application | `website/playground` | Warren and asset generation boundaries before model exploration |

The counter and TODO are included in the executable CLI. Larger browser- or I/O-dependent examples require explicit deterministic boundaries rather than assuming arbitrary Rabbita applications can be analyzed unchanged.
