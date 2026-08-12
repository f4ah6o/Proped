# MoonBit flow canvas

[日本語](FLOW.ja.md) | English

Proped includes a small React Flow-like graph foundation implemented in MoonBit.

The initial implementation is deliberately browser-independent. It provides typed nodes and edges, deterministic layout, viewport state, single-item selection, orthogonal edge routing, and standalone SVG output on both native and JS targets.

## Model

```moonbit
let nodes = [
  FlowNode::new("idle", "Idle", 0),
  FlowNode::new("ready", "Ready", 1),
]
let edges = [
  FlowEdge::new("submit", "idle", "ready", "Submit"),
]
let graph =
  FlowGraph::new(nodes, edges)
  |> layout_flow(_, FlowLayoutConfig::default())

let selected = select_flow_node(graph, "ready")
let fitted = fit_flow_view(selected, 1200, 720, 32)
let svg = flow_to_svg(fitted)
```

`FlowGraph` contains:

- `nodes`: typed node identity, label, rank, position, size, kind, selection, and drag capability
- `edges`: typed source and target identity, label, kind, selection, and renderer-independent routes
- `viewport`: integer pan and zoom state shared by native and JS targets
- `selection`: no selection, one node, or one edge

## Atlas adapter

A `RunReport` can be converted directly:

```moonbit
let graph = report_to_flow_graph(report)
let svg = report_to_flow_svg(report)
```

The adapter maps state depth to layout rank and maps initial, failing, ordinary, self-transition, and failure-transition states to semantic node or edge kinds.

## Layout boundary

`layout_flow` is the built-in deterministic fallback. It places nodes in rank columns, assigns lanes within each rank, and creates orthogonal routes.

The core flow model does not depend on a specific layout engine. A later adapter can translate `FlowGraph` to Diago, Dagre, or ELK and write the resulting coordinates and routes back into the same model without changing Atlas APIs.

## Current scope

Included:

- typed graph model
- deterministic rank layout
- orthogonal edge routing, including self-loops
- pan, zoom, and fit-view state
- node and edge selection
- standalone SVG renderer
- `RunReport` adapter
- native tests

Deferred:

- Rabbita pointer-event view
- interactive node dragging
- connection handles and graph editing
- multi-selection
- minimap and controls
- pluggable Diago/Dagre/ELK adapter

The deferred interaction layer should use the same `FlowGraph` state rather than introducing a separate JavaScript graph model.
