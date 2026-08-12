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

Proped Rabbita can inspect an unknown Web project without running install, build, or start scripts. The read-only inspector infers package manager, Node engine requirement, framework, build/serve commands, render mode, output directory, routing, storage/IndexedDB, WebSocket, service-worker, authentication, and server-side framework/persistence/API hints, and reports confidence plus ambiguities instead of silently guessing.

```bash
node scripts/web_project_inspect.mjs .
node scripts/web_project_inspect.mjs . --json
```

The current implementation entry point is the Node script; the planned packaged CLI surface is `proped web inspect`.

## Generated GitHub Actions quality gate

A reviewed v2 manifest can generate a GitHub Actions workflow without modifying the repository unless `--output` is explicit:

```bash
node scripts/web_project_ci.mjs proped.web.json > proped-web.yml
node scripts/web_project_ci.mjs proped.web.json --output .github/workflows/proped-web.yml
```

The generated workflow checks out Proped Rabbita at a **full commit SHA**, uses read-only repository permissions, runs project dependency bootstrap separately, installs the Proped-managed Playwright/Chromium runtime, installs bubblewrap for strict execution, runs `web_project_run_v2.mjs`, and uploads `.proped/out` even when the quality gate fails.

## Unified Web CLI

The canonical Web onboarding entry point is now `proped web`. Inside the repository, the same dispatcher runs as `node scripts/proped.mjs web ...`. It does not invoke a shell and preserves each existing command's stdout, stderr, and exit code.

```bash
node scripts/proped.mjs web inspect . --json
node scripts/proped.mjs web init . --output proped.web.json
node scripts/proped.mjs web doctor proped.web.json
node scripts/proped.mjs web review . --json
node scripts/proped.mjs web approve init review.json --output approvals.json
node scripts/proped.mjs web apply proped.web.json semantic-hints.json --output proped.web.approved.json
node scripts/proped.mjs web run proped.web.approved.json
```

The existing `web_project_*` and `web_semantic_*` scripts remain compatibility entry points.

## Explicit Web project preparation

`web run` never installs target dependencies implicitly. If a generated manifest has an install command and the target dependency artifact is missing, `web run` exits with `prepare_required`. Run the explicit setup phase first:

```bash
node scripts/proped.mjs web prepare proped.web.json
node scripts/proped.mjs web run proped.web.json
```

`web prepare` executes the inferred install argv with `shell=false`, confines cwd to the project root, and passes only the credential-safe environment allowlist. Network access is explicit to this setup command; `--offline` requests package-manager offline mode. The generated manifest carries `engines.node`. Proped inventories already-installed Node runtimes (current process plus NVM, Volta, FNM, and asdf layouts), selects the highest compatible runtime for target install/build/preview subprocesses, and never downloads a runtime implicitly. The Proped process and managed Chromium stay on the Proped-owned runtime. If no installed runtime can satisfy the declared range, `web doctor`, `web prepare`, and `web run` fail before install/build. `web doctor` also reports dependency readiness before execution.

## Blind unknown-project validation

A pinned blind run against `moonbitlang/website` (`a6222f7292ce50f2a08847ef0852b1a8d456a393`) reached real Generic Browser exploration with **0 project-specific executable adapter LOC**. The run drove the unknown Vite subproject with generated actions and coverage-guided exploration. Blind findings were converted into generic fixes: Docusaurus detection, explicit dependency preparation, package-manager completion markers, storage-access fail-closed snapshots, and unique-link `href` fallback. On the real blind app, locator uniqueness improved from **54.2% to 100%** without forced clicks.

A second blind onboarding pass used pinned `dowdiness/canopy` (`cb41945b04801084e8abe1d8edc27eb0cdce4a1c`) as a server-state candidate. Read-only inspection identified local/session storage, IndexedDB, WebSocket, Hono, and five relative API call sites. It also exposed a lifecycle-classification gap: because Waku depends on React and Vite, the generic inspector originally treated the app as a static React/Vite SPA. Waku is now first-class; Canopy is classified as `waku` / `server-rendered`, and generated manifest v2 uses managed command-server mode with `npm run preview` instead of a static `dist` server. Its declared Node range (`^24.0.0 || ^22.15.0`) excludes the current Node 25 runtime, but Proped now discovers the already-installed NVM Node 22.22.3 and selects it automatically for target subprocesses. The blind offline prepare therefore advances to npm itself and fails only because an uncached dependency tarball is unavailable; `web run` then correctly reports `prepare_required` rather than a Node-engine failure.

## Low-config Web project manifest v2

The high-level v2 manifest is generated from read-only inspection and compiles to the existing v1 stage graph. The current canonical format is JSON; generation is stdout-only unless `--output` is explicit.

```bash
node scripts/web_project_init.mjs . > proped.web.json
node scripts/web_project_doctor.mjs proped.web.json
node scripts/web_project_compile.mjs proped.web.json
```

`web doctor` checks project/runtime/server/browser/sandbox readiness without running install, build, or start commands. Static output and managed command servers are executed by a Proped-owned browser stage after compilation.

## Review-only server hooks

When source inspection finds literal same-origin server interactions, `proped web review` can propose bounded server hooks without activating them. Literal GET/HEAD fetches or routes become low-risk read-only candidates; POST endpoints are ignored unless the path is explicitly reset-like, and reset candidates are high-risk. A human-approved read-only candidate is merged into manifest v2 `server.hooks.readOnly`; an approved reset candidate requires explicit risk acknowledgement before it can populate `server.hooks.reset`. Other mutation endpoints are never proposed as hooks, and `automaticActivation` remains false.

Pinned Canopy dogfood proposed one real read-only candidate, `GET /api/pi-resume-chat/status`, at confidence 0.85. Approving only that candidate produced a manifest with exactly that read-only hook and no reset hook, with the other semantic candidates left pending.

## Managed command-server endpoint discovery

For full-stack projects, Generic Browser Mode requests a fresh loopback port through `PORT`/host environment hints but no longer assumes the target obeys it. The managed command-server runtime also scans bounded stdout/stderr for literal loopback HTTP(S) URLs and probes only those same-machine candidates. External/network URLs are ignored, the child receives the credential-safe environment allowlist, and readiness failure always terminates the process tree before returning. This keeps unknown preview servers usable without accepting arbitrary log-provided origins.

## Fresh-campaign replay gate

Manifest v2 defaults to three fresh campaign attempts. A candidate error is promoted to a quality failure only when the same canonical failure class appears in every attempt. A class that appears in only some runs becomes a `nondeterministic_failure_candidate` diagnostic instead of failing CI. This makes fresh-browser determinism part of the quality gate rather than a separate manual check.

## Canonical failure classes

Every Web failure can be assigned a stable canonical class in addition to its human-facing code. Classification uses the oracle family, normalized action pattern, semantic evidence paths, route family, and exception kind. Generated IDs, runtime generations, and concrete input values are normalized before hashing, so repeated occurrences cluster without losing the original failure code. Runner summaries and Atlas artifacts expose these canonical IDs.

## Generic Web property packs

Low-config Generic Browser Mode currently ships `browser-safety`, `navigation`, and `reload-persistence`. The packs are deliberately conservative: uncaught exceptions and observable local/session-storage drift are quality failures; visible state that disappears on reload without persistence evidence is an advisory candidate rather than an automatic CI failure.

This already surfaces TodoMVC React and Vue reload-state loss from generic discovery alone, with no TodoMVC-specific Playwright adapter or semantic contract.

## Dexie-aware metadata

When inspection detects Dexie, manifest v2 carries the declared and—when already installed—the resolved Dexie version into Generic Browser Mode. The first adapter is intentionally version-bounded: Dexie 3.x is supported because the pinned real dependency verifies `indexedDB.open(name, Math.round(db.verno * 10))` and reads existing native versions as `idbdb.version / 10`. Unknown Dexie majors are not guessed; they produce a diagnostic and keep the native IndexedDB version.

Real drawDB declares `^3.2.4`, resolves `3.2.7`, and is automatically reported as native IndexedDB version `670` / Dexie logical version `67`, including reconstructed schemas such as `++id,diagramId,lastModified,loadedFromGistId`.

## IndexedDB metadata inventory

When manifest v2 selects `state.indexedDB.mode = "auto-metadata"`, Generic Browser Mode records IndexedDB database names, native versions, object-store key paths, auto-increment flags, index definitions, and record counts. It intentionally does **not** read record payloads. In real drawDB dogfood this detects the `drawDB` native version 670 database and its `diagrams`/`templates` stores without a drawDB-specific adapter.

## Volatility mining

Manifest v2 runs bounded no-action fresh-context probes before a generic campaign. The miner reports paths that vary across runs, classifies generated IDs/tokens/timestamps separately from state-bearing storage/form/domain paths, and may propose a replacement rule. **No candidate is applied automatically** and raw volatile values are not included in the report. State-bearing volatility remains review-required.

## Selector survival benchmark

`web-selector-survival` turns a discovered action inventory into a semantic locator contract and compares it across minor UI revisions. Class names, generated DOM IDs, wrapper nodes, and element ordering can change without reducing survival when role/name/scope/test identity remain stable. The committed benchmark requires at least 95% survival for minor revisions and separately verifies that deliberately breaking the semantic accessibility contract is detected.

```bash
node scripts/test_web_selector_survival.mjs
```

## State novelty weighting

Exploration can rank frontier states with a deterministic semantic novelty score. The scorer treats a new state fingerprint, route family, storage-key shape, IndexedDB schema shape, and accessible action-target frontier as separate novelty signals. Dynamic route IDs and storage values are not treated as novelty by themselves, reducing sensitivity to volatile data.

```bash
node scripts/test_web_state_novelty.mjs
```

## Unknown-project onboarding acceptance

The committed onboarding regression corpus records six real-browser failure classes: three from TodoMVC React and three from drawDB. The pinned real runs reproduce all **6/6** classes deterministically on managed Chromium. A separate generic-property benchmark executes 10,000 healthy semantic transitions and records **0 false positives** (0 / 1000), while sensitivity controls still detect duplicate-submit and invalid-entity faults.

```bash
node scripts/test_web_healthy_transition_benchmark.mjs
node scripts/test_unknown_web_onboarding_acceptance.mjs
```

## Human semantic approval workflow

Semantic suggestions remain inert until a human records an explicit decision. An approval plan pins the semantic review hash, tracks `approve`/`reject`/`defer` per stable candidate ref, requires explicit acknowledgement for high-risk approvals, and rejects stale or tampered plans. Compiling a plan yields human-approved hints only; it never performs automatic activation.

```bash
node scripts/web_semantic_approval.mjs init review.json --output approvals.json
node scripts/web_semantic_approval.mjs decide review.json approvals.json property:undo-redo-inverse approve --output approvals.json
node scripts/web_semantic_approval.mjs compile review.json approvals.json --output semantic-hints.json
```

## Coverage-guided Generic Browser exploration

Generated manifest v2 enables a small bounded coverage-guided campaign by default, starting with `maxStates=32`, `maxTransitions=64`, and `maxDepth=4`. The frontier prioritizes semantic-state novelty and previously unseen actions, reconstructing each state by replaying its trace in a fresh context. **Destructive actions are always excluded**; bounded mutations are allowed only for self-contained `static-output` runs, while command/external servers explore safe actions only. Exploration failures are promoted only when the exact discovered trace reproduces the same failure class in every fresh replay attempt; flaky candidates remain diagnostics.

## Approved semantic runtime integration

`semantic-hints.json` can be attached explicitly to manifest v2 as `semantics.approved`. Only human-approved hints enter runtime execution; unapproved candidates remain inert. The first runtime maps `property:saved-state-survives-reload` to the existing `reload-persistence` pack, adds `projection:route-identity` and `projection:persistence-summary` to semantic state, and applies concrete approved normalizer rules to fresh-context fingerprints. Approved hints without a generic executor are preserved as diagnostics instead of being silently activated.

```bash
node scripts/web_semantic_approval.mjs compile review.json approvals.json --output semantic-hints.json
node scripts/web_semantic_apply.mjs proped.web.json semantic-hints.json --output proped.web.approved.json
node scripts/web_project_run_v2.mjs proped.web.approved.json
```

Without `--output`, `web_semantic_apply.mjs` is stdout-only and does not modify the source manifest. The compiled hint semantic hash is revalidated so post-approval tampering is rejected.

## Unified semantic review report

Property, projection, and normalizer suggestions can be reviewed through one bounded report. Every candidate gets a stable `kind:id` reference, HIGH/MEDIUM/LOW confidence band, semantic risk when applicable, recommended decision, evidence sources, and an explicit automatic-activation flag. The default CLI is human-readable; `--json` exposes the same review data for tooling.

```bash
node scripts/web_semantic_review.mjs .
node scripts/web_semantic_review.mjs . --volatility volatility.json --json
```

## Review-only normalizer candidates

Volatility findings can be promoted into explained normalizer candidates without applying them. The explainer combines fresh-context volatility with source-level evidence, assigns semantic risk, and recommends whether to review a replacement rule or keep the value observed. Generated DOM IDs, timestamps, and token-like values may receive low-risk replacement suggestions; storage, form, application-state, and IndexedDB paths remain high-risk and never receive an automatic replacement.

```bash
node scripts/web_normalizer_candidates.mjs . --volatility volatility.json --json
```

## Review-only semantic projection candidates

Proped can also propose small declarative state projections instead of generating project-specific Playwright code. Current candidates cover selected-entity identity, entity collection counts, undo/redo history position, persistence metadata, normalized route identity, and graph/domain summaries. Each suggestion includes an output shape, source kind, confidence, and evidence; executable projection code is never generated or activated automatically.

```bash
node scripts/web_projection_candidates.mjs . --json
```

## Review-only semantic property candidates

A bounded read-only static analyzer can propose higher-value semantic properties from three independent evidence sources: repository source snippets, existing test titles, and UI vocabulary. Current candidates include undo/redo inverse behavior, import/export roundtrips, Escape-cancels-edit, selection consistency after delete, saved-state reload persistence, and filter/source consistency. Candidates are **review-only**: confidence and evidence are reported, and automatic activation is always disabled.

```bash
node scripts/web_property_candidates.mjs . --json
```

## Multi-context scheduler prototype

A deterministic multi-context scheduler explores interleavings over shared state and per-context state using context-tagged semantic actions. It records the transition graph and replays failure traces without relying on wall-clock concurrency. The synthetic regression finds a two-context lost-update race and reproduces the same failure signature from the recorded four-step interleaving.

```bash
node scripts/test_web_multi_context_scheduler.mjs
```

## Server reset and read-only API hooks

Manifest v2 can declare optional same-origin server hooks for deterministic campaigns. A reset hook is an explicit credential-free `POST` relative path invoked before every fresh browser reset. Read-only hooks are limited to `GET`/`HEAD`; redirects and cross-origin URLs are denied, responses are byte-bounded, and artifacts keep only status, content hash, and JSON shape rather than raw bodies. This lets server-backed apps participate in fresh replay without a project-specific adapter.

```json
{
  "hooks": {
    "reset": { "method": "POST", "path": "/__test/reset", "expectedStatus": [204], "timeoutMs": 1000 },
    "readOnly": [{ "id": "state", "method": "GET", "path": "/api/state", "expectedStatus": [200], "timeoutMs": 1000, "maxBytes": 65536 }]
  }
}
```

## Coverage-guided Web exploration

A bounded explorer reconstructs frontier states by replaying semantic traces into fresh browser contexts, then prioritizes states with discovery novelty and globally unexecuted semantic actions. This avoids relying on browser-state cloning and keeps exploration reproducible. The synthetic regression reaches a new-route failure in three transitions and reproduces the same transition graph and semantic hash on a second run.

```bash
node scripts/test_web_coverage_guided_exploration.mjs
```

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
