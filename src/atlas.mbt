///|
fn json_hex_digit(value : Int) -> Char {
  [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
  ][value]
}

///|
fn write_json_string(output : StringBuilder, value : String) -> Unit {
  output.write_char('"')
  for char in value {
    let code = char.to_int()
    if char == '"' {
      output.write_string("\\\"")
    } else if char == '\\' {
      output.write_string("\\\\")
    } else if code == 8 {
      output.write_string("\\b")
    } else if code == 9 {
      output.write_string("\\t")
    } else if code == 10 {
      output.write_string("\\n")
    } else if code == 12 {
      output.write_string("\\f")
    } else if code == 13 {
      output.write_string("\\r")
    } else if code < 32 {
      output.write_string("\\u00")
      output.write_char(json_hex_digit(code / 16))
      output.write_char(json_hex_digit(code % 16))
    } else {
      // JSON is Unicode text. Keeping non-ASCII scalar values verbatim avoids
      // MoonBit's language-specific `\u{...}` escape, which is not JSON.
      output.write_char(char)
    }
  }
  output.write_char('"')
}

///|
fn run_diagnostic_kind_name(kind : RunDiagnosticKind) -> String {
  match kind {
    InvalidConfig => "invalid_config"
    StateIdentityCollision => "state_identity_collision"
    ActionIdentityCollision => "action_identity_collision"
    ShrinkBudgetExceeded => "shrink_budget_exceeded"
  }
}

///|
fn report_transition_is_failure(
  report : RunReport,
  transition : TransitionSnapshot,
) -> Bool {
  for failure in report.failures {
    for step in failure.structured_trace {
      if step.from == transition.from &&
        step.action_id == transition.action_id &&
        step.to == transition.to {
        return true
      }
    }
  }
  false
}

///|
fn transition_identity_equal(
  left : TransitionSnapshot,
  right : TransitionSnapshot,
) -> Bool {
  left.from == right.from &&
  left.action_id == right.action_id &&
  left.to == right.to
}

///|
fn report_transition_records(report : RunReport) -> Array[TransitionSnapshot] {
  let records = report.transitions.copy()
  for failure in report.failures {
    for provenance in failure.structured_trace {
      let mut found = false
      for existing in records {
        if transition_identity_equal(existing, provenance) {
          found = true
          break
        }
      }
      if !found {
        records.push(provenance)
      }
    }
  }
  records
}

///|
/// Serialize a run report for CI artifacts and external visualizers.
pub fn report_to_json(report : RunReport) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"schemaVersion\":")
  output.write_object(report.schema_version)
  output.write_string(",\"seed\":")
  output.write_object(report.seed)
  output.write_string(",\"cases\":")
  output.write_object(report.cases)
  output.write_string(",\"maxDepth\":")
  output.write_object(report.max_depth)
  output.write_string(",\"maxStates\":")
  output.write_object(report.max_states)
  output.write_string(",\"shrinkBudget\":")
  output.write_object(report.shrink_budget)
  output.write_string(",\"strategy\":")
  write_json_string(output, report.strategy)
  output.write_string(",\"steps\":")
  output.write_object(report.steps)
  output.write_string(",\"states\":[")
  for index, state in report.states {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string("{\"id\":")
    write_json_string(output, state.id)
    output.write_string(",\"depth\":")
    output.write_object(state.depth)
    output.write_string(",\"html\":")
    write_json_string(output, state.html)
    output.write_string(",\"dependencies\":[")
    for dependency_index, dependency in state.dependencies {
      if dependency_index > 0 {
        output.write_char(',')
      }
      write_json_string(output, dependency)
    }
    output.write_string("]}")
  }
  output.write_string("],\"transitions\":[")
  for index, transition in report.transitions {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string("{\"from\":")
    write_json_string(output, transition.from)
    output.write_string(",\"actionId\":")
    write_json_string(output, transition.action_id)
    output.write_string(",\"action\":")
    write_json_string(output, transition.action)
    output.write_string(",\"to\":")
    write_json_string(output, transition.to)
    output.write_char('}')
  }
  output.write_string("],\"failures\":[")
  for index, failure in report.failures {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string("{\"property\":")
    write_json_string(output, failure.property)
    output.write_string(",\"message\":")
    write_json_string(output, failure.message)
    output.write_string(",\"stateId\":")
    write_json_string(output, failure.state_id)
    output.write_string(",\"trace\":[")
    for trace_index, action in failure.trace {
      if trace_index > 0 {
        output.write_char(',')
      }
      write_json_string(output, action)
    }
    output.write_string("],\"structuredTrace\":[")
    for trace_index, transition in failure.structured_trace {
      if trace_index > 0 {
        output.write_char(',')
      }
      output.write_string("{\"from\":")
      write_json_string(output, transition.from)
      output.write_string(",\"actionId\":")
      write_json_string(output, transition.action_id)
      output.write_string(",\"action\":")
      write_json_string(output, transition.action)
      output.write_string(",\"to\":")
      write_json_string(output, transition.to)
      output.write_char('}')
    }
    output.write_string("]}")
  }
  output.write_string("],\"diagnostics\":[")
  for index, diagnostic in report.diagnostics {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string("{\"kind\":")
    write_json_string(output, run_diagnostic_kind_name(diagnostic.kind))
    output.write_string(",\"identity\":")
    write_json_string(output, diagnostic.identity)
    output.write_string(",\"message\":")
    write_json_string(output, diagnostic.message)
    output.write_char('}')
  }
  output.write_string("]}")
  output.to_string()
}

///|
/// Export the discovered graph in Graphviz DOT format.
pub fn report_to_dot(report : RunReport) -> String {
  let output = StringBuilder::new()
  let transitions = report_transition_records(report)
  output.write_string("digraph ui_states {\n  rankdir=LR;\n")
  for state in report.states {
    output.write_string("  ")
    write_json_string(output, state.id)
    output.write_string(" [label=")
    write_json_string(output, state.id)
    output.write_string("];\n")
  }
  for transition in transitions {
    output.write_string("  ")
    write_json_string(output, transition.from)
    output.write_string(" -> ")
    write_json_string(output, transition.to)
    output.write_string(" [label=")
    write_json_string(output, transition.action)
    if report_transition_is_failure(report, transition) {
      output.write_string(",color=red,fontcolor=red")
    }
    output.write_string("];\n")
  }
  output.write_string("}\n")
  output.to_string()
}
