///|
fn write_json_string(output : StringBuilder, value : String) -> Unit {
  output.write_string(value.escape(quote=true))
}

///|
/// Serialize a run report for CI artifacts and external visualizers.
pub fn report_to_json(report : RunReport) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"seed\":")
  output.write_object(report.seed)
  output.write_string(",\"cases\":")
  output.write_object(report.cases)
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
    output.write_string("]}")
  }
  output.write_string("]}")
  output.to_string()
}

///|
/// Export the discovered graph in Graphviz DOT format.
pub fn report_to_dot(report : RunReport) -> String {
  let output = StringBuilder::new()
  output.write_string("digraph ui_states {\n  rankdir=LR;\n")
  for state in report.states {
    output.write_string("  ")
    write_json_string(output, state.id)
    output.write_string(" [label=")
    write_json_string(output, state.id)
    output.write_string("];\n")
  }
  for transition in report.transitions {
    output.write_string("  ")
    write_json_string(output, transition.from)
    output.write_string(" -> ")
    write_json_string(output, transition.to)
    output.write_string(" [label=")
    write_json_string(output, transition.action)
    output.write_string("];\n")
  }
  output.write_string("}\n")
  output.to_string()
}
