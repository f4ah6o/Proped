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
