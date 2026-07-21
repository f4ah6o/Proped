///|
fn html_escape(value : String) -> String {
  let output = StringBuilder::new()
  for char in value {
    match char {
      '&' => output.write_string("&amp;")
      '<' => output.write_string("&lt;")
      '>' => output.write_string("&gt;")
      '"' => output.write_string("&quot;")
      '\'' => output.write_string("&#39;")
      _ => output.write_char(char)
    }
  }
  output.to_string()
}

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
    output.write_char('}')
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

///|
/// Build a dependency-free static HTML atlas. Each reachable state is rendered
/// in its own sandboxed iframe; transitions and minimized failures are included
/// below the canvas.
pub fn report_to_html(report : RunReport) -> String {
  let output = StringBuilder::new()
  output.write_string(
    #|<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proped Rabbita Atlas</title><style>
    #|:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#eef1f7}*{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:2;background:#111827;color:#fff;padding:16px 24px;box-shadow:0 2px 12px #0003}.top h1{margin:0 0 4px;font-size:20px}.meta{opacity:.75;font-size:13px}.canvas{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px;padding:24px}.frame{background:#fff;border:1px solid #d7dce7;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px #1f293712}.frame header{display:flex;justify-content:space-between;gap:16px;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font:12px ui-monospace,monospace}.frame iframe{display:block;width:100%;height:260px;border:0;background:#fff}.section{margin:0 24px 24px;background:#fff;border:1px solid #d7dce7;border-radius:12px;padding:18px}.section h2{margin:0 0 12px;font-size:16px}.edge,.failure{padding:9px 0;border-top:1px solid #eef1f5;font:13px ui-monospace,monospace}.edge:first-of-type,.failure:first-of-type{border-top:0}.failure{color:#991b1b}.ok{color:#166534}.arrow{color:#667085;padding:0 8px}.trace{margin:6px 0 0;padding-left:22px;color:#3f3f46}</style></head><body>
  )
  output.write_string("<div class=\"top\"><h1>Proped Rabbita UI Atlas</h1><div class=\"meta\">")
  output.write_object(report.states.length())
  output.write_string(" states · ")
  output.write_object(report.transitions.length())
  output.write_string(" transitions · ")
  output.write_object(report.failures.length())
  output.write_string(" failures · seed ")
  output.write_object(report.seed)
  output.write_string("</div></div><main><div class=\"canvas\">")
  for state in report.states {
    output.write_string("<article class=\"frame\"><header><strong>")
    output.write_string(html_escape(state.id))
    output.write_string("</strong><span>depth ")
    output.write_object(state.depth)
    output.write_string("</span></header><iframe sandbox srcdoc=\"")
    output.write_string(html_escape(state.html))
    output.write_string("\"></iframe></article>")
  }
  output.write_string("</div><section class=\"section\"><h2>Transitions</h2>")
  for transition in report.transitions {
    output.write_string("<div class=\"edge\"><strong>")
    output.write_string(html_escape(transition.from))
    output.write_string("</strong><span class=\"arrow\">— ")
    output.write_string(html_escape(transition.action))
    output.write_string(" →</span><strong>")
    output.write_string(html_escape(transition.to))
    output.write_string("</strong></div>")
  }
  output.write_string("</section><section class=\"section\"><h2>Properties</h2>")
  if report.failures.is_empty() {
    output.write_string("<div class=\"ok\">All generated traces satisfied the configured properties.</div>")
  } else {
    for failure in report.failures {
      output.write_string("<div class=\"failure\"><strong>")
      output.write_string(html_escape(failure.property))
      output.write_string("</strong>: ")
      output.write_string(html_escape(failure.message))
      output.write_string("<div>state: ")
      output.write_string(html_escape(failure.state_id))
      output.write_string("</div><ol class=\"trace\">")
      for action in failure.trace {
        output.write_string("<li>")
        output.write_string(html_escape(action))
        output.write_string("</li>")
      }
      output.write_string("</ol></div>")
    }
  }
  output.write_string("</section></main></body></html>")
  output.to_string()
}
