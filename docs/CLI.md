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

`schema` returns the command grammar, supported demo IDs, generated artifact names, and exit-code meanings. Agents should use it before constructing commands instead of scraping human help text.

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

Returns all runnable demo IDs, their origin, description, and upstream revision when applicable.

### `demo describe <id>`

```bash
moon run src/cli -- demo describe rabbita-counter --json
```

Returns the model, action IDs, deterministic exploration defaults, origin, and artifact names for one demo.

### `demo run <id|all>`

```bash
moon run src/cli -- demo run newsletter --json
moon run src/cli -- demo run all --output artifacts --json
```

Runs one or all demos. Each run produces a compact summary in stdout and writes complete reports under `<output>/<demo-id>/`.

## JSON envelope

A successful run has this shape:

```json
{
  "ok": true,
  "command": "demo run",
  "runs": [
    {
      "id": "newsletter",
      "ok": true,
      "output": "demo/out/newsletter",
      "schemaVersion": 2,
      "seed": 7,
      "states": 5,
      "transitions": 192,
      "failures": 0,
      "diagnostics": 0,
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

When a demo produces one or more property failures, its summary contains `"ok": false`, the process exits with code `3`, and the complete failure traces remain in `atlas.json` and `atlas.html`.

## Artifacts

| File | Contract |
| --- | --- |
| `summary.json` | Compact copy of the per-demo CLI summary |
| `atlas.json` | Complete `RunReport`, including states, raw transitions, failures, structured traces, dependencies, and diagnostics |
| `atlas.html` | Standalone human-readable state atlas |
| `atlas.svg` | Standalone deterministic Flow Canvas graph |
| `atlas.dot` | Graphviz transition graph |

Generated files are deterministic for the same source, demo configuration, and seed.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed and no property failed |
| `2` | Invalid command, option, or demo ID |
| `3` | Exploration completed but at least one property failed |

Unexpected filesystem or runtime failures are not converted into a success envelope and retain the runtime's nonzero exit behavior.
