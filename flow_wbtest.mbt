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
  assert_eq(graph.edges[0].route[0].x, graph.nodes[0].position.x + graph.nodes[0].size.width)
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
      {
        id: "done",
        html: "<p>Done</p>",
        depth: 1,
        dependencies: ["view.mbt"],
      },
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
