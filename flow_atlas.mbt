///|
fn atlas_state_has_failure(report : RunReport, state_id : String) -> Bool {
  for failure in report.failures {
    if failure.state_id == state_id {
      return true
    }
  }
  false
}

///|
fn atlas_node_kind(report : RunReport, state : StateSnapshot) -> String {
  if atlas_state_has_failure(report, state.id) {
    "failure"
  } else if state.depth == 0 {
    "initial"
  } else {
    "state"
  }
}

///|
fn atlas_edge_kind(
  report : RunReport,
  transition : TransitionSnapshot,
) -> String {
  if atlas_state_has_failure(report, transition.to) {
    "failure"
  } else if transition.from == transition.to {
    "self"
  } else {
    "transition"
  }
}

///|
/// Convert an explored UI report into the reusable MoonBit flow-canvas model.
pub fn report_to_flow_graph(report : RunReport) -> FlowGraph {
  let nodes : Array[FlowNode] = []
  for state in report.states {
    let node = FlowNode::new(state.id, state.id, state.depth)
    nodes.push({
      ..node,
      kind: atlas_node_kind(report, state),
      draggable: false,
    })
  }
  let edges : Array[FlowEdge] = []
  for index, transition in report.transitions {
    let edge = FlowEdge::new(
      "transition-\{index}",
      transition.from,
      transition.to,
      transition.action,
    )
    edges.push({ ..edge, kind: atlas_edge_kind(report, transition) })
  }
  layout_flow(FlowGraph::new(nodes, edges), FlowLayoutConfig::default())
}

///|
/// Export the explored state graph through the shared flow renderer.
pub fn report_to_flow_svg(report : RunReport) -> String {
  flow_to_svg(report_to_flow_graph(report))
}
