///|
struct CounterModel {
  count : Int
} derive(Debug, Eq)

///|
enum CounterMsg {
  Inc(Int)
  Reset
} derive(Debug, Eq)

///|
fn counter_update(model : CounterModel, msg : CounterMsg) -> CounterModel {
  match msg {
    Inc(amount) => { count: model.count + amount }
    Reset => { count: 0 }
  }
}

///|
fn counter_actions(model : CounterModel) -> Array[CounterMsg] {
  if model.count < 3 {
    [Inc(1), Inc(2)]
  } else {
    [Reset]
  }
}

///|
fn shrink_counter_msg(msg : CounterMsg) -> Array[CounterMsg] {
  match msg {
    Inc(amount) if amount > 1 => [Inc(1)]
    _ => []
  }
}

///|
fn describe_counter_msg(msg : CounterMsg) -> String {
  match msg {
    Inc(amount) => "Inc(\{amount})"
    Reset => "Reset"
  }
}

///|
fn counter_machine(
  actions : (CounterModel) -> Array[CounterMsg],
) -> Machine[CounterModel, CounterMsg] {
  {
    initial: { count: 0 },
    update: counter_update,
    actions,
    shrink: shrink_counter_msg,
    render: fn(model) { "<button>\{model.count}</button>" },
    fingerprint: fn(model) { "counter:\{model.count}" },
    describe_msg: describe_counter_msg,
    dependencies: fn(model) {
      if model.count == 0 {
        ["counter/view.mbt", "theme/base.css"]
      } else {
        ["counter/view.mbt"]
      }
    },
  }
}

///|
test "runner explores reachable states" {
  let properties : Array[Property[CounterModel, CounterMsg]] = [
    state_property("count remains non-negative", fn(model, _) {
      if model.count >= 0 { Pass } else { Fail("negative count") }
    }),
    transition_property("reset returns to zero", fn(_, msg, after) {
      match msg {
        Reset if after.count != 0 => Fail("reset did not return to zero")
        _ => Pass
      }
    }),
  ]
  let report = run(
    counter_machine(counter_actions),
    properties,
    { cases: 12, max_depth: 6, max_states: 32, seed: 7 },
  )
  assert_true(report.states.length() >= 3)
  assert_true(report.transitions.length() > 0)
  assert_eq(report.failures.length(), 0)
}

///|
test "failing traces are minimized" {
  fn only_large_increment(_ : CounterModel) -> Array[CounterMsg] {
    [Inc(2)]
  }
  let properties : Array[Property[CounterModel, CounterMsg]] = [
    state_property("count stays below two", fn(model, _) {
      if model.count < 2 { Pass } else { Fail("count reached two") }
    }),
  ]
  let report = run(
    counter_machine(only_large_increment),
    properties,
    { cases: 1, max_depth: 3, max_states: 8, seed: 1 },
  )
  assert_eq(report.failures.length(), 1)
  assert_eq(report.failures[0].trace.length(), 1)
  assert_eq(report.failures[0].trace[0], "Inc(2)")
}

///|
test "atlas exporters include discovered graph" {
  let report = run(
    counter_machine(counter_actions),
    [],
    { cases: 2, max_depth: 2, max_states: 8, seed: 3 },
  )
  let json = report_to_json(report)
  let dot = report_to_dot(report)
  let html = report_to_html(report)
  assert_true(json.contains("\"states\""))
  assert_true(json.contains("\"dependencies\""))
  assert_true(dot.contains("digraph ui_states"))
  assert_true(html.contains("Proped Rabbita UI Atlas"))
}

///|
test "differential build selects dependent states" {
  let report = run(
    counter_machine(counter_actions),
    [],
    { cases: 4, max_depth: 3, max_states: 16, seed: 1 },
  )
  let theme_affected = affected_state_ids(report, ["theme/base.css"])
  assert_eq(theme_affected.length(), 1)
  assert_eq(theme_affected[0], "counter:0")
  let view_affected = affected_state_ids(report, ["counter/view.mbt"])
  assert_eq(view_affected.length(), report.states.length())
}
