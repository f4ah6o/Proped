# Proped Rabbita

Property-based, model-based UI verification and static state atlases for [Rabbita](https://github.com/moonbit-community/rabbita).

Proped Rabbita treats the following as first-class UI framework concepts:

- reachable application states
- typed user and system actions
- state and transition properties
- generated action traces
- automatic failure shrinking
- browserless Rabbita rendering
- static HTML, JSON, and Graphviz state atlases

The core model is:

```text
initial Model
  + available(Model) -> Array[Msg]
  + update(Model, Msg) -> Model
  + view(Model) -> Html
  + Property<Model, Msg>
  + shrink(Msg) -> Array[Msg]
  = verified reachable UI state graph
```

This is not random DOM clicking. The generator asks the model for actions that are valid in the current state, executes typed transitions, checks invariants, and reduces failures to a minimal reproducible trace.

## Status

Early MVP. The current branch provides the executable framework core and exporters. It does not yet instrument arbitrary Rabbita components or replace browser-level layout testing.

## Features

### Reachable-state exploration

`Machine::actions` receives the current model and returns only currently valid messages. Generated traces therefore remain in the reachable state space rather than constructing arbitrary and contradictory field combinations.

### State and transition properties

```moonbit
let properties : Array[Property[Model, Msg]] = [
  state_property("loading disables submit", fn(model, html) {
    if model.loading && !html.contains("disabled") {
      Fail("submit remained enabled")
    } else {
      Pass
    }
  }),
  transition_property("cancel restores persisted data", fn(before, msg, after) {
    match msg {
      Cancel if after.form != before.persisted => Fail("form was not restored")
      _ => Pass
    }
  }),
]
```

### Failure shrinking

When a property fails, Proped Rabbita first removes unnecessary actions from the trace, then applies the message-specific shrinker. Reports contain the minimized sequence rather than only the original generated sequence.

### Browserless Rabbita rendering

`rabbita_machine` uses Rabbita's server-side renderer:

```moonbit
let machine = rabbita_machine(
  initial_model,
  update,
  available_actions,
  shrink_msg,
  fn(model) { @rabbita.Val::constant(view(model)) },
  model_fingerprint,
  describe_msg,
)
```

State and structural properties can therefore run without Playwright or a browser. A future browser adapter will verify layout, focus, IME, scroll, animation, and other host-specific behavior only for selected states.

## Minimal example

```moonbit
enum Msg {
  Inc(Int)
  Reset
}

struct Model {
  count : Int
}

let machine : Machine[Model, Msg] = {
  initial: { count: 0 },
  update: fn(model, msg) {
    match msg {
      Inc(amount) => { count: model.count + amount }
      Reset => { count: 0 }
    }
  },
  actions: fn(model) {
    if model.count < 3 { [Inc(1), Inc(2)] } else { [Reset] }
  },
  shrink: fn(msg) {
    match msg {
      Inc(amount) if amount > 1 => [Inc(1)]
      _ => []
    }
  },
  render: fn(model) { "<button>\{model.count}</button>" },
  fingerprint: fn(model) { "counter:\{model.count}" },
  describe_msg: fn(msg) { msg.to_string() },
}

let properties : Array[Property[Model, Msg]] = [
  state_property("count is non-negative", fn(model, _) {
    if model.count >= 0 { Pass } else { Fail("negative count") }
  }),
]

let report = run(machine, properties, RunConfig::default())
let atlas_html = report_to_html(report)
let graph_json = report_to_json(report)
let graph_dot = report_to_dot(report)
```

## API

### `Machine[Model, Msg]`

| Field | Purpose |
| --- | --- |
| `initial` | Initial application model |
| `update` | Pure typed transition function |
| `actions` | Valid action candidates for the current model |
| `shrink` | Smaller representatives for a message |
| `render` | Browserless state renderer |
| `fingerprint` | Stable state identity and deduplication key |
| `describe_msg` | Human-readable trace entry |

### `Property[Model, Msg]`

A property may inspect rendered state, transitions, or both.

- `state_property(name, check)`
- `transition_property(name, check)`

### Exporters

- `report_to_html`: dependency-free static UI atlas
- `report_to_json`: machine-readable CI artifact
- `report_to_dot`: Graphviz transition graph

## What the MVP verifies

- typed model transitions
- reachable-state invariants
- transition invariants
- generated and replayable traces
- minimized failure traces
- static rendered HTML
- state and transition graph structure

## What still requires a browser adapter

- CSS layout and text wrapping
- real fonts and image dimensions
- focus and selection behavior
- IME and clipboard behavior
- drag-and-drop and scrolling
- hover, media queries, and animation
- browser engine differences

The intended architecture keeps this as a second-stage verification backend. The pure runner explores broadly; a browser runner checks representative, changed, and failing states.

## Planned architecture

```text
proped-rabbita core
  ├─ state-machine runner
  ├─ property evaluation
  ├─ trace replay
  ├─ shrinking
  └─ report model

Rabbita adapter
  └─ Model -> Val[Html] -> static HTML

Atlas exporters
  ├─ HTML canvas
  ├─ JSON graph
  └─ Graphviz DOT

Future Warren integration
  ├─ CLI
  ├─ filesystem output
  ├─ dependency cache
  ├─ changed-state builds
  └─ optional browser adapter
```

## Roadmap

1. Stabilize the runner and renderer adapter.
2. Add weighted generators and deterministic PRNG state.
3. Add command interpreters for generated success, failure, timeout, and cancellation results.
4. Add model and fixture shrinkers in addition to action shrinkers.
5. Add dependency metadata for property-level and state-level differential builds.
6. Add a Warren command that writes the HTML/JSON/DOT artifacts.
7. Add an optional browser adapter for selected states.
8. Add a Figma-like infinite-canvas atlas viewer.

## Development

```bash
moon install
moon fmt --check
moon check --target native
moon test --target native
```

## License

Apache-2.0
