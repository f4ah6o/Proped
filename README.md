# Proped Rabbita

[日本語](README.ja.md) | English

Proped Rabbita explores reachable Rabbita UI states, checks model and transition properties, shrinks failures, and exports deterministic HTML, SVG, JSON, and Graphviz atlases.

## Run the CLI

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

The last command writes each demo to `demo/out/<demo-id>/` and prints one JSON result envelope to stdout. Agents and scripts should discover the stable command contract with:

```bash
moon run src/cli -- schema --json
```

CLI exit codes are `0` when each demo matches its declared expected outcome, `2` for invalid usage, and `3` for an expectation mismatch. `--json` may appear anywhere in the argument list. `--output <dir>` changes the artifact root.

See [docs/CLI.md](docs/CLI.md) for the complete command and output contract.

## Included demos

| ID | Source | Expected outcome | Purpose |
| --- | --- | --- | --- |
| `newsletter` | Project example | Pass | Validation, consent, submission, reset, state and transition properties |
| `rabbita-counter` | Vendored Rabbita official example | Pass | Finite exploration of the upstream `Inc` and `Dec` semantics |
| `rabbita-todo` | Vendored Rabbita official example | Failure | Practical add/delete/toggle/tab exploration and minimal counterexample shrinking |

The practical TODO run explores 169 states and 2,251 transitions with the pinned deterministic configuration. It finds the upstream behavior that accepts a whitespace-only title and shrinks the failure to two actions:

```text
TitleChanged(" ")
Add
```

The CLI reports this as a matched expected failure and includes the property, message, state ID, trace length, human trace, and stable action IDs in `firstFailure`.

Vendored source, revisions, hashes, licenses, and adapter changes are recorded under `src/vendor/`, [docs/VENDORED_DEMOS.md](docs/VENDORED_DEMOS.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Each run writes:

- `atlas.html` — standalone human-readable state atlas
- `atlas.svg` — standalone Flow Canvas graph
- `atlas.json` — complete machine-readable run report
- `atlas.dot` — Graphviz transition graph
- `summary.json` — compact CLI result including the first minimized failure

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

`Machine::actions` returns only messages valid for the supplied model. Proped Rabbita executes typed transitions, renders each discovered model without a browser, checks state and transition properties, and minimizes failing action traces. For practical runs, the runner retains the shortest counterexample per property instead of repeating equivalent failures from many generated cases.

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

`RunReport` records the effective seed, exploration bounds, states, raw transitions, structured minimized failure traces, dependencies, and diagnostics. `affected_state_ids` selects states whose dependency identifiers intersect a supplied change set.

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
  vendor/rabbita_counter/      pinned counter source and adapter
  vendor/rabbita_todo/         pinned practical TODO source and adapter
  core.mbt                     exploration, shrinking, minimal failure retention
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
