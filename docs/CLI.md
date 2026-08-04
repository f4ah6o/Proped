# CLI contract

The Proped Rabbita CLI is designed for interactive use, CI, and LLM-driven automation. Human output is the default. `--json` switches commands to stable JSON envelopes.

## Invocation

```bash
moon run src/cli -- <command> [arguments] [--json] [--output <dir>]
```

After `moon build --target native`, the generated native executable accepts the same arguments without the `moon run src/cli --` prefix.

## Discovery

```bash
moon run src/cli -- schema --json
```

`schema` returns the command grammar, supported demo IDs, summary fields, generated artifact names, and exit-code meanings. Agents should use it before constructing commands instead of scraping human help text.

## Commands

### `version`

```bash
moon run src/cli -- version --json
```

Returns the CLI version.

### `demo list`

```bash
moon run src/cli -- demo list --json
```

Returns all runnable demo IDs, their origin, declared expected outcome, description, and upstream revision when applicable.

### `demo describe <id>`

```bash
moon run src/cli -- demo describe rabbita-todo --json
```

Returns the model, action classes, properties, deterministic exploration defaults, origin, expected outcome, and artifact names for one demo.

### `demo run <id|all>`

```bash
moon run src/cli -- demo run rabbita-todo --json
moon run src/cli -- demo run all --output artifacts --json
```

Runs one or all demos. Each run produces a compact summary in stdout and writes complete reports under `<output>/<demo-id>/`.

A demo declares `expectedOutcome` as either `pass` or `failure`. Expected-failure demos also declare an exact `expectedFailure` property and minimized trace. The command succeeds only when the observed counterexample matches that signature. This allows a regression fixture to prove that failure discovery and shrinking still work without accepting an unrelated failure or making the complete demo suite permanently red.

## Expected-failure fixtures

| Demo | Property | Exact minimized trace |
| --- | --- | --- |
| `rabbita-todo` | `stored todo titles are not blank` | `TitleChanged(" ") -> Add` |
| `rabbita-sokoban` | `invalid timeline input preserves cursor` | `Move(Up) -> JumpTo("not-a-number")` |
| `rabbita-subscriptions` | `paused ticker ignores queued tick` | `ToggleTicker -> Tick` |
| `rabbita-websocket` | `closing client rejects repeated disconnect` | `ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested` |

`demo run all` executes these four fixtures together with the two expected-pass demos.

## JSON envelope

A practical expected-failure run has this shape:

```json
{
  "ok": true,
  "command": "demo run",
  "runs": [
    {
      "id": "rabbita-todo",
      "ok": true,
      "expectedOutcome": "failure",
      "expectationMet": true,
      "expectedFailure": {
        "property": "stored todo titles are not blank",
        "trace": [
          "TitleChanged(\" \")",
          "Add"
        ]
      },
      "output": "demo/out/rabbita-todo",
      "schemaVersion": 2,
      "seed": 29,
      "states": 169,
      "transitions": 2251,
      "failures": 1,
      "diagnostics": 0,
      "firstFailure": {
        "property": "stored todo titles are not blank",
        "message": "todo 0 has a blank title",
        "stateId": "rabbita-todo|...",
        "traceLength": 2,
        "trace": [
          "TitleChanged(\" \")",
          "Add"
        ],
        "actionIds": [
          "title:1: ",
          "add"
        ]
      },
      "artifacts": [
        "atlas.html",
        "atlas.svg",
        "atlas.json",
        "atlas.dot",
        "summary.json"
      ]
    }
  ]
}
```

For passing demos, `expectedOutcome` is `pass`, `failures` is `0`, and `firstFailure` is `null`.

A usage error has this shape and exits with code `2`:

```json
{
  "ok": false,
  "error": {
    "code": "usage_error",
    "message": "unknown demo id: missing"
  }
}
```

## Failure retention

Exploration may rediscover the same property violation in many generated cases. `RunReport.failures` retains the shortest counterexample for each property instead of appending repeated or longer failures. `firstFailure` is the first retained property failure copied into the compact summary.

The full structured trace remains available in `atlas.json`, including `from`, `actionId`, human label, and `to` for every minimized transition.

## Artifacts

| File | Contract |
| --- | --- |
| `summary.json` | Compact copy of the per-demo CLI summary, including `firstFailure` |
| `atlas.json` | Complete `RunReport`, including states, raw transitions, minimized failures, structured traces, dependencies, and diagnostics |
| `atlas.html` | Standalone human-readable state atlas with minimized failure traces |
| `atlas.svg` | Standalone deterministic Flow Canvas graph |
| `atlas.dot` | Graphviz transition graph |

Generated files are deterministic for the same source, demo configuration, and seed.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every selected demo matched its declared expected outcome |
| `2` | Invalid command, option, or demo ID |
| `3` | At least one selected demo did not match its declared expected outcome |

Unexpected filesystem or runtime failures are not converted into a success envelope and retain the runtime's nonzero exit behavior.
