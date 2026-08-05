///|
struct Pending {
  id : Int
  query : String
} derive(Debug, Eq)

///|
struct Model {
  query : String
  results : String
  next_id : Int
  pending : Array[Pending]
} derive(Debug, Eq)

///|
enum Msg {
  Type(String)
  Deliver(Int)
} derive(Debug, Eq)

///|
fn initial() -> Model {
  { query: "", results: "", next_id: 1, pending: [] }
}

///|
fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Type(query) => {
      let pending = model.pending.copy()
      pending.push({ id: model.next_id, query })
      { ..model, query, next_id: model.next_id + 1, pending }
    }
    Deliver(id) => {
      let pending : Array[Pending] = []
      let mut result : String? = None
      for item in model.pending {
        if item.id == id && result is None {
          result = Some(item.query)
        } else {
          pending.push(item)
        }
      }
      match result {
        Some(value) => { ..model, results: value, pending }
        None => model
      }
    }
  }
}

///|
fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = [Type("a"), Type("ab")]
  for item in model.pending {
    result.push(Deliver(item.id))
  }
  result
}

///|
fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    Type(value) if value.length() > 1 => [Type("a")]
    Deliver(id) if id > 1 => [Deliver(1)]
    _ => []
  }
}

///|
fn fingerprint(model : Model) -> String {
  let pending = StringBuilder::new()
  for index, item in model.pending {
    if index > 0 {
      pending.write_char(',')
    }
    pending.write_object(item.id)
    pending.write_char(':')
    pending.write_string(item.query)
  }
  "search|q=\{model.query}|r=\{model.results}|n=\{model.next_id}|p=\{pending.to_string()}"
}

///|
fn action_id(msg : Msg) -> String {
  match msg {
    Type(value) => "type:\{value}"
    Deliver(id) => "deliver:\{id}"
  }
}

///|
fn describe(msg : Msg) -> String {
  action_id(msg)
}

///|
fn parse_action(value : String) -> Msg? {
  if value == "type:a" {
    Some(Type("a"))
  } else if value == "type:ab" {
    Some(Type("ab"))
  } else if value == "deliver:1" {
    Some(Deliver(1))
  } else if value == "deliver:2" {
    Some(Deliver(2))
  } else {
    None
  }
}

///|
fn machine() -> @proped.Machine[Model, Msg] {
  {
    initial: initial(),
    update,
    actions,
    shrink,
    render: fn(model) {
      "<search query=\{model.query} results=\{model.results}>"
    },
    fingerprint,
    action_id,
    describe_msg: describe,
    dependencies: fn(_) { ["fixture:stale-search", "protocol:1.0"] },
  }
}

///|
fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("search results match latest query", fn(model, _) {
      if model.results != "" && model.results != model.query {
        @proped.Fail("stale search response replaced latest query results")
      } else {
        @proped.Pass
      }
    }),
  ]
}

///|
fn config() -> @proped.RunConfig {
  { cases: 32, max_depth: 4, max_states: 64, seed: 7, shrink_budget: 256 }
}

///|
fn json_string(value : String) -> String {
  value.escape(quote=true)
}

///|
fn report_summary_json(report : @proped.RunReport) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"ok\":true,\"fixture\":\"stale-search\",\"states\":")
  output.write_object(report.states.length())
  output.write_string(",\"transitions\":")
  output.write_object(report.transitions.length())
  output.write_string(",\"failures\":")
  output.write_object(report.failures.length())
  output.write_string(",\"diagnostics\":")
  output.write_object(report.diagnostics.length())
  if !report.failures.is_empty() {
    let failure = report.failures[0]
    output.write_string(",\"property\":")
    output.write_string(json_string(failure.property))
    output.write_string(",\"message\":")
    output.write_string(json_string(failure.message))
    output.write_string(",\"trace\":[")
    for index, action in failure.trace {
      if index > 0 {
        output.write_char(',')
      }
      output.write_string(json_string(action))
    }
    output.write_char(']')
  }
  output.write_char('}')
  output.to_string()
}

///|
fn replay_json(raw : Array[String]) -> String {
  let mut model = initial()
  let trace : Array[String] = []
  for value in raw {
    match parse_action(value) {
      Some(msg) => {
        model = update(model, msg)
        trace.push(value)
      }
      None => return "{\"ok\":false,\"error\":\"unknown_action\"}"
    }
  }
  let failed = model.results != "" && model.results != model.query
  let output = StringBuilder::new()
  output.write_string("{\"ok\":true,\"fixture\":\"stale-search\",\"failed\":")
  output.write_string(if failed { "true" } else { "false" })
  output.write_string(",\"property\":")
  output.write_string(
    if failed {
      json_string("search results match latest query")
    } else {
      "null"
    },
  )
  output.write_string(",\"failureClass\":")
  output.write_string(
    if failed {
      json_string("stale-response")
    } else {
      "null"
    },
  )
  output.write_string(",\"fingerprint\":")
  output.write_string(json_string(fingerprint(model)))
  output.write_string(",\"trace\":[")
  for index, action in trace {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string(json_string(action))
  }
  output.write_string("]}")
  output.to_string()
}

///|
fn main {
  let args = @env.args()
  if args.length() < 2 {
    println("{\"ok\":false,\"error\":\"usage\"}")
    return
  }
  match args[1] {
    "explore" =>
      println(
        report_summary_json(@proped.run(machine(), properties(), config())),
      )
    "replay" => {
      let replay_args : Array[String] = []
      for index = 2; index < args.length(); index = index + 1 {
        replay_args.push(args[index])
      }
      println(replay_json(replay_args))
    }
    _ => println("{\"ok\":false,\"error\":\"unknown_command\"}")
  }
}
