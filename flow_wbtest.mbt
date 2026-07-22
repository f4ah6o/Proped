///|
fn sample_flow_graph() -> FlowGraph {
  let nodes = [
    FlowNode::new("start", "Start", 0),
    FlowNode::new("ready", "Ready", 1),
    FlowNode::new("done", "Done", 1),
  ]
  let edges = [
    FlowEdge::new("start-ready", "start", "ready", "Open"),
    FlowEdge::new("ready-done", "ready", "done", "Submit"),
  ]
  FlowGraph::new(nodes, edges)
}

///|
test "flow layout places ranks in columns and lanes in rows" {
  let graph = layout_flow(sample_flow_graph(), FlowLayoutConfig::default())
  assert_true(graph.nodes[1].position.x > graph.nodes[0].position.x)
  assert_eq(graph.nodes[1].position.x, graph.nodes[2].position.x)
  assert_true(graph.nodes[2].position.y > graph.nodes[1].position.y)
  assert_eq(graph.edges[0].route.length(), 4)
  assert_eq(
    graph.edges[0].route[0].x,
    graph.nodes[0].position.x + graph.nodes[0].size.width,
  )
}

///|
test "flow layout respects custom node sizes" {
  let config = FlowLayoutConfig::default()
  let wide = {
    ..FlowNode::new("wide", "Wide", 0),
    size: { width: 500, height: 200 },
  }
  let next = FlowNode::new("next", "Next", 1)
  let lower = {
    ..FlowNode::new("lower", "Lower", 0),
    size: { width: 120, height: 160 },
  }
  let graph = layout_flow(FlowGraph::new([wide, next, lower], []), config)
  assert_true(
    graph.nodes[1].position.x >=
    graph.nodes[0].position.x +
    graph.nodes[0].size.width +
    config.horizontal_gap,
  )
  assert_true(
    graph.nodes[2].position.y >=
    graph.nodes[0].position.y + graph.nodes[0].size.height + config.vertical_gap,
  )
}

///|
test "backward edges use facing node sides" {
  let nodes = [
    FlowNode::new("target", "Target", 0),
    FlowNode::new("source", "Source", 1),
  ]
  let edge = FlowEdge::new("reset", "source", "target", "Reset")
  let graph = layout_flow(
    FlowGraph::new(nodes, [edge]),
    FlowLayoutConfig::default(),
  )
  assert_eq(graph.edges[0].route[0].x, graph.nodes[1].position.x)
  assert_eq(
    graph.edges[0].route[3].x,
    graph.nodes[0].position.x + graph.nodes[0].size.width,
  )
}

///|
test "self loop routes contribute to graph bounds" {
  let node = FlowNode::new("loop", "Loop", 0)
  let edge = FlowEdge::new("again", "loop", "loop", "Again")
  let graph = layout_flow(
    FlowGraph::new([node], [edge]),
    FlowLayoutConfig::default(),
  )
  let bounds = flow_bounds(graph)
  assert_true(bounds.y < graph.nodes[0].position.y)
  assert_true(
    bounds.x + bounds.width >
    graph.nodes[0].position.x + graph.nodes[0].size.width,
  )
}

///|
test "flow selection keeps one selected item" {
  let graph = layout_flow(sample_flow_graph(), FlowLayoutConfig::default())
  let node_selected = select_flow_node(graph, "ready")
  assert_eq(node_selected.selection, NodeSelection("ready"))
  assert_true(node_selected.nodes[1].selected)
  assert_true(!node_selected.edges[0].selected)
  let edge_selected = select_flow_edge(node_selected, "start-ready")
  assert_eq(edge_selected.selection, EdgeSelection("start-ready"))
  assert_true(!edge_selected.nodes[1].selected)
  assert_true(edge_selected.edges[0].selected)
  let cleared = clear_flow_selection(edge_selected)
  assert_eq(cleared.selection, EmptySelection)
}

///|
test "flow viewport pans zooms and fits deterministically" {
  let graph = layout_flow(sample_flow_graph(), FlowLayoutConfig::default())
  let panned = pan_flow(graph, 20, -10)
  assert_eq(panned.viewport.x, 20)
  assert_eq(panned.viewport.y, -10)
  let zoomed = zoom_flow(panned, 500)
  assert_eq(zoomed.viewport.zoom_percent, 400)
  let fitted = fit_flow_view(graph, 800, 500, 24)
  assert_true(fitted.viewport.zoom_percent >= 10)
  assert_true(fitted.viewport.zoom_percent <= 400)
  assert_eq(fitted.viewport.width, 800)
  assert_eq(fitted.viewport.height, 500)
}

///|
test "fitted SVG preserves the requested viewport" {
  let graph = layout_flow(sample_flow_graph(), FlowLayoutConfig::default())
  let svg = flow_to_svg(fit_flow_view(graph, 1200, 720, 32))
  assert_true(svg.contains("width=\"1200\""))
  assert_true(svg.contains("height=\"720\""))
  assert_true(svg.contains("viewBox=\"0 0 1200 720\""))
}

///|
test "flow SVG contains routed nodes and edges" {
  let graph = layout_flow(sample_flow_graph(), FlowLayoutConfig::default())
  let svg = flow_to_svg(graph)
  assert_true(svg.contains("<svg"))
  assert_true(svg.contains("flow-arrow"))
  assert_true(svg.contains("Start"))
  assert_true(svg.contains("Submit"))
}

///|
test "run report adapts to flow graph and SVG" {
  let report : RunReport = {
    seed: 1,
    cases: 1,
    steps: 1,
    states: [
      {
        id: "idle",
        html: "<button>Start</button>",
        depth: 0,
        dependencies: ["view.mbt"],
      },
      { id: "done", html: "<p>Done</p>", depth: 1, dependencies: ["view.mbt"] },
    ],
    transitions: [{ from: "idle", action: "Start", to: "done" }],
    failures: [],
  }
  let graph = report_to_flow_graph(report)
  assert_eq(graph.nodes.length(), 2)
  assert_eq(graph.edges.length(), 1)
  assert_eq(graph.nodes[0].kind, "initial")
  assert_true(report_to_flow_svg(report).contains("idle"))
}

///|
test "Atlas aggregates samples and marks only the failing trace path" {
  let report : RunReport = {
    seed: 1,
    cases: 2,
    steps: 4,
    states: [
      { id: "a", html: "<p>A</p>", depth: 0, dependencies: [] },
      { id: "c", html: "<p>C</p>", depth: 1, dependencies: [] },
      { id: "b", html: "<p>B</p>", depth: 2, dependencies: [] },
    ],
    transitions: [
      { from: "a", action: "Start", to: "b" },
      { from: "a", action: "Start", to: "b" },
      { from: "a", action: "ToC", to: "c" },
      { from: "c", action: "Start", to: "b" },
    ],
    failures: [
      {
        property: "submit fails",
        message: "rejected",
        state_id: "b",
        trace: ["ToC", "Start"],
      },
    ],
  }
  let graph = report_to_flow_graph(report)
  assert_eq(graph.edges.length(), 3)
  assert_eq(graph.edges[0].sample_count, 2)
  assert_eq(graph.edges[0].kind, "transition")
  assert_eq(graph.edges[1].kind, "failure")
  assert_eq(graph.edges[2].kind, "failure")
  assert_true(flow_to_svg(graph).contains("Start ×2"))
}
