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

## Unknown Web project inspection

Proped Rabbita can inspect an unknown Web project without running install, build, or start scripts. The read-only inspector infers package manager, framework, build/serve commands, render mode, output directory, routing, storage/IndexedDB, WebSocket, service-worker, and authentication hints, and reports confidence plus ambiguities instead of silently guessing.

```bash
node scripts/web_project_inspect.mjs .
node scripts/web_project_inspect.mjs . --json
```

The current implementation entry point is the Node script; the planned packaged CLI surface is `proped web inspect`.

## Low-config Web project manifest v2

The high-level v2 manifest is generated from read-only inspection and compiles to the existing v1 stage graph. The current canonical format is JSON; generation is stdout-only unless `--output` is explicit.

```bash
node scripts/web_project_init.mjs . > proped.web.json
node scripts/web_project_doctor.mjs proped.web.json
node scripts/web_project_compile.mjs proped.web.json
```

`web doctor` checks project/runtime/server/browser/sandbox readiness without running install, build, or start commands. Static output and managed command servers are executed by a Proped-owned browser stage after compilation.

## Generic Web property packs

Low-config Generic Browser Mode currently ships `browser-safety`, `navigation`, and `reload-persistence`. The packs are deliberately conservative: uncaught exceptions and observable local/session-storage drift are quality failures; visible state that disappears on reload without persistence evidence is an advisory candidate rather than an automatic CI failure.

This already surfaces TodoMVC React and Vue reload-state loss from generic discovery alone, with no TodoMVC-specific Playwright adapter or semantic contract.

## Generic browser inventory

For an already-running app, the generic browser adapter can discover actions and capture semantic state without project-specific Playwright code:

```bash
node scripts/web_browser_inventory.mjs http://127.0.0.1:3000 --json
```

Action resolution is fail-closed: ambiguous locators become diagnostics rather than `.first()` guesses. External network is denied by default while the target origin remains available.

## Semantic browser quiescence

Generic Browser Mode does not use `networkidle` as its readiness oracle. After each action it advances two animation frames, samples a semantic DOM/form/URL/storage fingerprint, tracks observable same-origin requests, and requires repeated stable samples with zero pending requests. A page that never stabilizes returns a `semantic_quiescence_timeout` diagnostic instead of an opaque wait failure.

## Managed Chromium runtime

Generic Browser Mode owns its browser runtime instead of inheriting one from the target project. The current pinned runtime is Playwright 1.62.0 with Chromium revision 1234 (Chromium 151.0.7922.34). Target applications do not need a Playwright dependency; runtime metadata is included in browser snapshots for reproducibility.

## Strict Web execution sandbox

On Linux, Web project stages can run under an OS-enforced bubblewrap boundary:

```bash
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json \
  --strict-sandbox \
  --writable web/next-ssr-hydration/.next \
  --writable web/nuxt-ssr-hydration/.output
```

Strict mode denies outbound network, mounts the repository read-only, keeps `.git` read-only, exposes only explicit build/artifact directories as writable, uses a private `/tmp`, and passes only an allowlisted environment. Full filesystem strict mode currently requires Linux + bubblewrap; unsupported platforms fail closed rather than silently downgrading.

## Web mutation quality gate

The framework-neutral Web mutation benchmark kills one reviewed mutation for each generic Web property and runs paired healthy controls. Its quality gate reports mutation score, false-positive rate, deterministic replay, minimized-trace drift, throughput, and elapsed-time violations as machine-readable codes.

```bash
node scripts/test_web_mutation_benchmark.mjs
node scripts/test_web_mutation_benchmark.mjs --iterations 2000 --output .tmp/web-mutation
node scripts/test_web_mutation_benchmark.mjs --minimum-mutation-score 1 --maximum-false-positive-rate 0 --no-artifacts
```

Invalid arguments exit with code `2`; a quality-gate failure exits with code `1` and writes the full result to stderr. Default runs write `summary.json`, `atlas.json`, `atlas.html`, `atlas.svg`, and `atlas.dot` below `protocol/out/web-mutation-benchmark/`.

## Web project runner

A strict Web project manifest can run the generic property pack, mutation quality gate, React/Vue Component Mode, Playwright Browser Mode, cross-mode replay, and Next.js/Nuxt SSR checks as one ordered quality graph.

```bash
node scripts/web_project_runner.mjs validate web/project-manifests/proped-web-quality.json
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json --output .tmp/web-quality
```

The runner never invokes a shell. Manifest paths and stage working directories must remain inside the repository root. Exit `1` from a stage is classified as a quality-gate failure, exit `2` as usage error, other non-zero exits as execution failures, and dependent stages are blocked after prerequisite failure. Child-process network, filesystem-write, upstream-write, and credential restrictions are explicitly caller-enforced rather than claimed as an in-process sandbox. The runner itself confines manifest/cwd/artifact paths and strips non-allowlisted environment variables before spawning stages.

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

The external campaign currently includes fifteen runnable targets. `canopy-editor-integration` explores 900 states and 1,633 transitions and retains reverse-ordered document callbacks plus delivery after unmount. `rabbita-utility-batch` classifies ten public repositories, mechanically exercises four supported boundaries across 3,400 states and 7,646 transitions, and minimizes an initial empty-title submission to `FullstackSubmit`. `scripts/utility_batch.py` validates the committed classification report and can re-check pinned local checkouts without writing upstream.

`scripts/utility_batch.py validate` verifies the classification report and fixture hashes. `scripts/utility_batch.py diff` compares pinned revisions with each upstream default branch and emits commit counts, changed target paths, and updated source hashes as JSON without writing upstream.

The utility batch retains initial empty-title submission, late replies for older titles, and GraphSaved rollback via `IssuesSave -> IssuesSave -> IssuesDeliver(id=2) -> IssuesDeliver(id=1)`.

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
  vendor/canopy_editor_integration/ CodeMirror lifecycle/browser replay adapter
  vendor/rabbita_utility_batch/     supported public utility-app batch
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
