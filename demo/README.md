# Runnable atlases

The CLI generates six end-to-end examples:

```bash
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

Outputs are grouped under `demo/out/<demo-id>/`. Every directory contains `atlas.html`, `atlas.svg`, `atlas.json`, `atlas.dot`, and `summary.json`.

| Demo | Expected | Coverage | Minimized failure |
| --- | --- | --- | --- |
| `newsletter` | pass | validation, consent, submit, reset | — |
| `rabbita-counter` | pass | finite increment/decrement state space | — |
| `rabbita-todo` | failure | add, delete, toggle, tabs, filtering, stats | `TitleChanged(" ") -> Add` |
| `rabbita-sokoban` | failure | movement, crate pushes, branching history, timeline | `Move(Up) -> JumpTo("not-a-number")` |
| `rabbita-subscriptions` | failure | timer, resize, scroll, keyboard, visibility, mouse | `ToggleTicker -> Tick` |
| `rabbita-websocket` | failure | connect, disconnect, send, close, error, transcript | `ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested` |

Expected-failure demos declare an exact property and minimized trace. The CLI returns `0` only when the observed counterexample matches that signature. It returns `3` when a passing demo fails, an expected failure disappears, or a different failure is observed.

Use another artifact root with:

```bash
moon run src/cli -- demo run all --output artifacts --json
```

## External application campaign

External applications use a separate namespace and output root:

```bash
moon run src/cli -- external list --json
moon run src/cli -- external run all --json
```

The campaign includes eight targets. `isomorphic-suite` explores Kanban, Todo, and Note in one matrix, reaches 1,400 states and 2,288 transitions, and retains four failures. Its primary trace is `KanbanSelectCardToMove(1) -> KanbanMoveCardTo(column=99, index=0)`. Outputs are written under `demo/out/external/<id>/`.

Generate local issue and PR drafts without contacting upstream:

```bash
moon run src/cli -- external handoff signal-reader --json
moon run src/cli -- external handoff moonbit-editor-file-tree --json
moon run src/cli -- external handoff canopy-components --json
moon run src/cli -- external handoff incr-typed-spreadsheet --json
moon run src/cli -- external handoff circular-state --json
moon run src/cli -- external handoff isomorphic-suite --json
```
