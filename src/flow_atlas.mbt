///|
priv struct AtlasTransition {
  from : String
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
  left.from == right.from && left.action == right.action && left.to == right.to
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
        action: transition.action,
        to: transition.to,
        samples: 1,
      })
    }
  }
  aggregated
}

///|
fn atlas_contains_string(values : Array[String], target : String) -> Bool {
  for value in values {
    if value == target {
      return true
    }
  }
  false
}

///|
fn atlas_push_unique_string(values : Array[String], value : String) -> Unit {
  if !atlas_contains_string(values, value) {
    values.push(value)
  }
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
fn atlas_initial_state_ids(report : RunReport) -> Array[String] {
  let ids : Array[String] = []
  for state in report.states {
    if state.depth == 0 {
      atlas_push_unique_string(ids, state.id)
    }
  }
  ids
}

///|
fn atlas_next_states(
  transitions : Array[AtlasTransition],
  states : Array[String],
  action : String,
) -> Array[String] {
  let next : Array[String] = []
  for transition in transitions {
    if transition.action == action &&
      atlas_contains_string(states, transition.from) {
      atlas_push_unique_string(next, transition.to)
    }
  }
  next
}

///|
fn atlas_previous_states(
  transitions : Array[AtlasTransition],
  states : Array[String],
  action : String,
) -> Array[String] {
  let previous : Array[String] = []
  for transition in transitions {
    if transition.action == action &&
      atlas_contains_string(states, transition.to) {
      atlas_push_unique_string(previous, transition.from)
    }
  }
  previous
}

///|
fn atlas_failure_transition_indices(
  report : RunReport,
  transitions : Array[AtlasTransition],
) -> Array[Int] {
  let failing : Array[Int] = []
  let initial_states = atlas_initial_state_ids(report)
  for failure in report.failures {
    if failure.trace.is_empty() {
      continue
    }
    let forward : Array[Array[String]] = [initial_states]
    for action in failure.trace {
      forward.push(
        atlas_next_states(transitions, forward[forward.length() - 1], action),
      )
    }
    let backward : Array[Array[String]] = []
    for slot = 0; slot <= failure.trace.length(); slot = slot + 1 {
      backward.push([])
    }
    backward[failure.trace.length()] = [failure.state_id]
    let mut cursor = failure.trace.length()
    while cursor > 0 {
      let step = cursor - 1
      backward[step] = atlas_previous_states(
        transitions,
        backward[cursor],
        failure.trace[step],
      )
      cursor = step
    }
    for step, action in failure.trace {
      for index, transition in transitions {
        if transition.action == action &&
          atlas_contains_string(forward[step], transition.from) &&
          atlas_contains_string(backward[step + 1], transition.to) {
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
