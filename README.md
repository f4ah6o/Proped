# Proped Rabbita

[日本語](README.ja.md) | English

Proped Rabbita explores reachable Rabbita UI states, checks model and transition properties, shrinks failures, and exports deterministic HTML, SVG, JSON, and Graphviz atlases.

## Run the CLI

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
moon run src/cli -- external inspect-source src/vendor/ensenzu_app/upstream/app.mbt.txt --json
moon run src/cli -- external inspect-source src/vendor/moonbit_editor_file_tree/upstream/file_tree.mbt.txt --json
moon run src/cli -- external run all --json
```

`demo run all` writes demos to `demo/out/<demo-id>/`. `external run all` writes external targets to `demo/out/external/<id>/`. Both commands print one JSON result envelope to stdout. Agents and scripts should discover the stable command contract with:

```bash
moon run src/cli -- schema --json
```

CLI exit codes are `0` when each demo matches its declared expected outcome, `2` for invalid usage, and `3` for an expectation mismatch. `--json` may appear anywhere in the argument list. `--output <dir>` changes the artifact root.

See [docs/CLI.md](docs/CLI.md) for the complete command and output contract.

## Included demos

| ID | Source | Expected | Coverage | Minimal counterexample |
| --- | --- | --- | --- | --- |
| `newsletter` | project | pass | validation, consent, submit, reset | — |
| `rabbita-counter` | Rabbita `examples/counter` | pass | finite counter state space | — |
| `rabbita-todo` | Rabbita `examples/todo` | failure | CRUD, tabs, filtering, statistics | `TitleChanged(" ") -> Add` |
| `rabbita-sokoban` | Rabbita `examples/sokoban` | failure | movement, crates, branching history, timeline | `Move(Up) -> JumpTo("not-a-number")` |
| `rabbita-subscriptions` | Rabbita `examples/subscriptions` | failure | timer and six browser event subscriptions | `ToggleTicker -> Tick` |
| `rabbita-websocket` | Rabbita `examples/websocket` | failure | command-client lifecycle and transcript | `Connect -> Disconnect -> Disconnect` |

The added practical runs cover 255 Sokoban states and 1,163 transitions, 640 subscription states and 1,718 transitions, and 800 WebSocket states and 4,428 transitions. Each expected failure is accepted only when both its property name and minimized trace match the declared signature.

Vendored source, revision, hashes, license, adapter changes, and failure rationale are recorded under `src/vendor/`, [docs/VENDORED_DEMOS.md](docs/VENDORED_DEMOS.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## External Rabbita applications

External targets are pinned by manifests under `external/manifests/`. `external inspect-source` mechanically detects common `Model`, `Msg`, `update`, `view`, command, and subscription boundaries in a local source file. Effects are recorded as deterministic descriptors rather than executing upstream network or native operations. `scripts/external_harness.py` validates manifests, generates bounded action scaffolds for simple `Msg` payloads, prepares deterministic source-hash reports, previews explicit revision updates, and runs requested inspection commands with network denied.

The external campaign currently includes ten targets. `moonclaw-job` explores 720 states and 2,269 transitions and shows that an older same-run snapshot can replace a newer terminal snapshot after two stream-triggered requests. `rabbita-xterm-lifecycle` models managed xterm loading, mounting, subscriptions, UTF-8 writes, and disposal natively; it shrinks invalid dimensions to `Resize(cols=0, rows=24)`. `isomorphic-suite` continues to run Kanban, Todo, and Note through one shared harness with four retained failures.

Upstream repositories are read-only inputs: this project does not create issues, pull requests, comments, or commits in them. `external handoff <id>` generates local issue, reproduction, fix-plan, and PR-body drafts only. Security-sensitive findings are blocked from public export and isolated below ignored `.private/disclosures/`; see [docs/DISCLOSURE.md](docs/DISCLOSURE.md).

Each public run writes `atlas.html`, `atlas.svg`, `atlas.json`, `atlas.dot`, and `summary.json`.

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
  cli/                              CLI and machine-readable command contract
  external/                         manifest validation, detection, effect modeling
  examples/newsletter/              reusable project demo package
  vendor/rabbita_counter/           passing counter baseline
  vendor/rabbita_todo/              blank-title failure
  vendor/rabbita_sokoban/           malformed timeline failure
  vendor/rabbita_subscriptions/     stale timer failure
  vendor/rabbita_websocket/         duplicate disconnect failure
  vendor/proton_todo/               stale snapshot ordering failure
  vendor/ensenzu_app/               numeric form and SVG application adapter
  vendor/ensenzu_core/              pinned Ensenzu calculation implementation
  vendor/moonbit_editor_file_tree/  file-tree resolve and auto-reveal adapter
  vendor/canopy_components/         resizable, menu, and tabs finite adapter
  vendor/incr_typed_spreadsheet/     worksheet UI and backdating adapter
  vendor/incr_typed_spreadsheet_core/ pinned worksheet implementation
  vendor/isomorphic_suite/           Kanban, Todo, and Note matrix adapter
  vendor/circular_state/              clean-room workspace/modal adapter
  core.mbt                          exploration, shrinking, minimal failure retention
  rabbita_adapter.mbt               browserless Rabbita rendering
  atlas*.mbt                        report exporters
  flow*.mbt                         deterministic graph layout
external/                            pinned external manifests and schema
```

## Development

```bash
moon update
moon fmt --check
moon check --target native
moon test --target native
moon run src/cli -- demo run all --json
moon run src/cli -- external run all --json
```

The server-side Rabbita renderer is marked experimental upstream, so `moon check` emits warning `0014` from `rabbita_adapter.mbt`.

## License

Proped Rabbita is Apache-2.0. Vendored attribution is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
