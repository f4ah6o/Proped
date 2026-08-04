# Proped Rabbita

[日本語](README.ja.md) | English

Proped Rabbita explores reachable Rabbita UI states, checks model and transition properties, shrinks failures, and exports deterministic HTML, SVG, JSON, and Graphviz atlases.

## Run the CLI

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

The last command writes each demo to `demo/out/<demo-id>/` and prints one JSON result envelope to stdout.

```json
{"ok":true,"command":"demo run","runs":[{"id":"newsletter","states":5,"failures":0},{"id":"rabbita-counter","states":7,"failures":0}]}
```

Use `schema` as the stable discovery entry point for agents and scripts:

```bash
moon run src/cli -- schema --json
```

CLI exit codes are `0` for success, `2` for invalid usage, and `3` when a property fails. `--json` may appear anywhere in the argument list. `--output <dir>` changes the artifact root.

See [docs/CLI.md](docs/CLI.md) for the complete command and output contract.

## Included demos

| ID | Source | Purpose |
| --- | --- | --- |
| `newsletter` | Project example | Validation, consent, submission, reset, state and transition properties |
| `rabbita-counter` | Vendored Rabbita official example | Finite exploration of the upstream `Inc` and `Dec` counter semantics |

The counter preserves the upstream source and license at `src/vendor/rabbita_counter/`, pinned to revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`. The adapted package bounds generated states to `[-3, 3]` so exploration terminates deterministically.

Each run writes:

- `atlas.html` — standalone human-readable state atlas
- `atlas.svg` — standalone Flow Canvas graph
- `atlas.json` — complete machine-readable run report
- `atlas.dot` — Graphviz transition graph
- `summary.json` — compact CLI result for automation

## Library model

```text
initial Model
  + actions(Model) -> Array[Msg]
  + update(Model, Msg) -> Model
  + view(Model) -> Html
  + Property<Model, Msg>
  + shrink(Msg) -> Array[Msg]
  + dependencies(Model) -> Array[String]
  = verified reachable UI state graph
```

`Machine::actions` returns only messages valid for the supplied model. Proped Rabbita executes typed transitions, renders each discovered model without a browser, checks state and transition properties, and minimizes failing action traces.

```moonbit
let machine = rabbita_machine_with_action_id(
  initial_model,
  update,
  available_actions,
  shrink_msg,
  view,
  model_fingerprint,
  stable_action_id,
  describe_msg,
  dependencies_for,
)

let report = run(machine, properties, RunConfig::default())
let html = report_to_html(report)
let svg = report_to_flow_svg(report)
let json = report_to_json(report)
let dot = report_to_dot(report)
```

`RunReport` records the effective seed, exploration bounds, states, raw transitions, structured failure traces, dependencies, and diagnostics. `affected_state_ids` selects states whose dependency identifiers intersect a supplied change set.

## Core API

| API | Purpose |
| --- | --- |
| `Machine[Model, Msg]` | Pure update, reachable actions, rendering, identities, shrinking, dependencies |
| `state_property` | Validate a model and its rendered HTML |
| `transition_property` | Validate a before/message/after transition |
| `run` | Deterministic exploration with validated defaults |
| `run_checked` | Exploration with typed configuration errors |
| `affected_state_ids` | Plan differential UI rebuilds |
| `report_to_html` | Standalone state atlas |
| `report_to_flow_svg` | Standalone graph |
| `report_to_json` | CI and agent report |
| `report_to_dot` | Graphviz report |

## Repository layout

```text
src/
  cli/                         CLI and machine-readable command contract
  examples/newsletter/         reusable project demo package
  vendor/rabbita_counter/      pinned upstream source and adapter
  core.mbt                     exploration and shrinking
  rabbita_adapter.mbt          browserless Rabbita rendering
  atlas*.mbt                   report exporters
  flow*.mbt                    deterministic graph layout
```

## Development

```bash
moon update
moon fmt --check
moon check --target native
moon test --target native
moon run src/cli -- demo run all --json
```

The server-side Rabbita renderer is marked experimental upstream, so `moon check` emits warning `0014` from `rabbita_adapter.mbt`.

## License

Proped Rabbita is Apache-2.0. Vendored attribution is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
