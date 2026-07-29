///|
priv struct AtlasTransition {
  from : String
  action_id : String
  action : String
  to : String
  samples : Int
}

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
fn atlas_same_transition(
  left : AtlasTransition,
  right : TransitionSnapshot,
) -> Bool {
  left.from == right.from &&
  left.action_id == right.action_id &&
  left.action == right.action &&
  left.to == right.to
}

///|
fn atlas_aggregate_transitions(report : RunReport) -> Array[AtlasTransition] {
  let aggregated : Array[AtlasTransition] = []
  for transition in report.transitions {
    let mut matched_index = -1
    for index, current in aggregated {
      if atlas_same_transition(current, transition) {
        matched_index = index
        break
      }
    }
    if matched_index >= 0 {
      let current = aggregated[matched_index]
      aggregated[matched_index] = { ..current, samples: current.samples + 1 }
    } else {
      aggregated.push({
        from: transition.from,
        action_id: transition.action_id,
        action: transition.action,
        to: transition.to,
        samples: 1,
      })
    }
  }
  aggregated
}

///|
fn atlas_contains_int(values : Array[Int], target : Int) -> Bool {
  for value in values {
    if value == target {
      return true
    }
  }
  false
}

///|
fn atlas_push_unique_int(values : Array[Int], value : Int) -> Unit {
  if !atlas_contains_int(values, value) {
    values.push(value)
  }
}

///|
fn atlas_failure_transition_indices(
  report : RunReport,
  transitions : Array[AtlasTransition],
) -> Array[Int] {
  let failing : Array[Int] = []
  for failure in report.failures {
    for step in failure.structured_trace {
      for index, transition in transitions {
        if transition.from == step.from &&
          transition.action_id == step.action_id &&
          transition.to == step.to {
          atlas_push_unique_int(failing, index)
        }
      }
    }
  }
  failing
}

///|
fn atlas_edge_kind(transition : AtlasTransition, failure : Bool) -> String {
  if failure {
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
  let transitions = atlas_aggregate_transitions(report)
  let failing = atlas_failure_transition_indices(report, transitions)
  let edges : Array[FlowEdge] = []
  for index, transition in transitions {
    let edge = FlowEdge::new(
      "transition-\{index}",
      transition.from,
      transition.to,
      transition.action,
    )
    edges.push({
      ..edge,
      kind: atlas_edge_kind(transition, atlas_contains_int(failing, index)),
      sample_count: transition.samples,
    })
  }
  layout_flow(FlowGraph::new(nodes, edges), FlowLayoutConfig::default())
}

///|
/// Export the explored state graph through the shared flow renderer.
pub fn report_to_flow_svg(report : RunReport) -> String {
  flow_to_svg(report_to_flow_graph(report))
}
