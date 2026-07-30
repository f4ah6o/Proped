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
    action_id: describe_counter_msg,
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
struct GateModel {
  open : Bool
  submitted : Bool
} derive(Debug, Eq)

///|
enum GateMsg {
  OpenGate
  SubmitGate
} derive(Debug, Eq)

///|
fn gate_machine() -> Machine[GateModel, GateMsg] {
  {
    initial: { open: false, submitted: false },
    update: fn(model, msg) {
      match msg {
        OpenGate => { open: true, submitted: model.submitted }
        SubmitGate => { open: model.open, submitted: true }
      }
    },
    actions: fn(model) {
      if model.submitted {
        []
      } else if model.open {
        [SubmitGate]
      } else {
        [OpenGate]
      }
    },
    shrink: fn(_) { [] },
    render: fn(model) {
      "<main open=\"\{model.open}\" submitted=\"\{model.submitted}\"></main>"
    },
    fingerprint: fn(model) { "gate:\{model.open}:\{model.submitted}" },
    action_id: fn(msg) {
      match msg {
        OpenGate => "open-gate"
        SubmitGate => "submit-gate"
      }
    },
    describe_msg: fn(msg) {
      match msg {
        OpenGate => "OpenGate"
        SubmitGate => "SubmitGate"
      }
    },
    dependencies: fn(_) { ["gate/view.mbt"] },
  }
}

///|
enum CycleMsg {
  CycleA
  CycleB
} derive(Debug, Eq)

///|
fn cycle_machine() -> Machine[Int, CycleMsg] {
  {
    initial: 0,
    update: fn(model, msg) {
      match msg {
        CycleA => model + 1
        CycleB => model + 2
      }
    },
    actions: fn(_) { [CycleA, CycleB] },
    shrink: fn(msg) {
      match msg {
        CycleA => [CycleA, CycleB, CycleB]
        CycleB => [CycleB, CycleA]
      }
    },
    render: fn(model) { "<p>\{model}</p>" },
    fingerprint: fn(model) { "cycle:\{model}" },
    action_id: fn(msg) {
      match msg {
        CycleA => "cycle-a"
        CycleB => "cycle-b"
      }
    },
    describe_msg: fn(_) { "cycle" },
    dependencies: fn(_) { ["cycle/view.mbt"] },
  }
}

///|
struct CollisionModel {
  value : Int
}

///|
fn state_collision_machine() -> Machine[CollisionModel, Unit] {
  {
    initial: { value: 0 },
    update: fn(model, _) { { value: model.value + 1 } },
    actions: fn(model) { if model.value == 0 { [()] } else { [] } },
    shrink: fn(_) { [] },
    render: fn(model) { "<p>\{model.value}</p>" },
    fingerprint: fn(_) { "same-state-id" },
    action_id: fn(_) { "step" },
    describe_msg: fn(_) { "Step" },
    dependencies: fn(model) {
      if model.value == 0 {
        ["initial.mbt"]
      } else {
        ["next.mbt"]
      }
    },
  }
}

///|
enum LabelMsg {
  LabelLeft
  LabelRight
} derive(Debug, Eq)

///|
fn duplicate_label_machine(collision : Bool) -> Machine[Int, LabelMsg] {
  {
    initial: 0,
    update: fn(model, msg) {
      match msg {
        LabelLeft => model + 1
        LabelRight => model + 2
      }
    },
    actions: fn(model) { if model == 0 { [LabelLeft, LabelRight] } else { [] } },
    shrink: fn(_) { [] },
    render: fn(model) { "<p>\{model}</p>" },
    fingerprint: fn(model) { "label:\{model}" },
    action_id: fn(msg) {
      if collision {
        "same-action-id"
      } else {
        match msg {
          LabelLeft => "left-action"
          LabelRight => "right-action"
        }
      }
    },
    describe_msg: fn(_) { "Activate" },
    dependencies: fn(_) { ["labels/view.mbt"] },
  }
}

///|
fn left_only_label_machine() -> Machine[Int, LabelMsg] {
  let machine = duplicate_label_machine(false)
  { ..machine, actions: fn(_) { [LabelLeft] } }
}

///|
fn left_only_colliding_label_machine() -> Machine[Int, LabelMsg] {
  let machine = duplicate_label_machine(true)
  { ..machine, actions: fn(_) { [LabelLeft] } }
}

///|
fn config_for_tests(
  cases : Int,
  max_depth : Int,
  max_states : Int,
  seed : Int,
  shrink_budget : Int,
) -> RunConfig {
  { cases, max_depth, max_states, seed, shrink_budget }
}

///|
fn contains_test_int(values : Array[Int], target : Int) -> Bool {
  for value in values {
    if value == target {
      return true
    }
  }
  false
}

///|
fn deterministic_indices(bound : Int, count : Int) -> Array[Int] {
  let prng = deterministic_prng(19)
  let values : Array[Int] = []
  for index = 0; index < count; index = index + 1 {
    values.push(prng.next_index(bound))
  }
  values
}

///|
fn indexed_machine(action_count : Int) -> Machine[Int, Int] {
  {
    initial: 0,
    update: fn(_, msg) { msg },
    actions: fn(_) {
      let values : Array[Int] = []
      for index = 0; index < action_count; index = index + 1 {
        values.push(index)
      }
      values
    },
    shrink: fn(_) { [] },
    render: fn(model) { "<p>\{model}</p>" },
    fingerprint: fn(model) { "indexed:\{model}" },
    action_id: fn(msg) { "index-\{msg}" },
    describe_msg: fn(msg) { "Index \{msg}" },
    dependencies: fn(_) { ["indexed/view.mbt"] },
  }
}

///|
test "deterministic PRNG is reproducible and reaches every small action index" {
  for bound in [3, 5, 7] {
    let values = deterministic_indices(bound, bound * 8)
    for expected = 0; expected < bound; expected = expected + 1 {
      assert_true(contains_test_int(values, expected))
    }
    let report = run(
      indexed_machine(bound),
      [],
      config_for_tests(bound * 8, 1, 64, 19, 1024),
    )
    for expected = 0; expected < bound; expected = expected + 1 {
      let expected_id = "index-\{expected}"
      assert_true(
        report.transitions.any(fn(transition) {
          transition.action_id == expected_id
        }),
      )
    }
  }
  let first = run(
    counter_machine(counter_actions),
    [],
    config_for_tests(8, 4, 32, 19, 1024),
  )
  let second = run(
    counter_machine(counter_actions),
    [],
    config_for_tests(8, 4, 32, 19, 1024),
  )
  assert_eq(report_to_json(first), report_to_json(second))
  let changed_seed = run(
    counter_machine(counter_actions),
    [],
    config_for_tests(8, 4, 32, 20, 1024),
  )
  assert_true(report_to_json(first) != report_to_json(changed_seed))
}

///|
test "invalid run configuration is explicit" {
  let invalid = config_for_tests(-1, 2, 8, 1, 1024)
  match run_checked(counter_machine(counter_actions), [], invalid) {
    Err(InvalidCases(value)) => assert_eq(value, -1)
    _ => fail("expected invalid cases error")
  }
  match RunConfig::validate(config_for_tests(1, -1, 8, 1, 1024)) {
    Err(InvalidMaxDepth(value)) => assert_eq(value, -1)
    _ => fail("expected invalid max depth error")
  }
  match RunConfig::validate(config_for_tests(1, 1, 0, 1, 1024)) {
    Err(InvalidMaxStates(value)) => assert_eq(value, 0)
    _ => fail("expected invalid max states error")
  }
  match RunConfig::validate(config_for_tests(1, 1, 8, 1, 0)) {
    Err(InvalidShrinkBudget(value)) => assert_eq(value, 0)
    _ => fail("expected invalid shrink budget error")
  }
  let report = run(counter_machine(counter_actions), [], invalid)
  assert_eq(report.diagnostics.length(), 1)
  assert_eq(report.diagnostics[0].kind, InvalidConfig)
  assert_true(report_to_json(report).contains("invalid_config"))
}

///|
test "state and action identity collisions are diagnosed" {
  assert_true(
    available_action(left_only_label_machine(), 0, LabelRight) is None,
  )
  let replay_property = state_property("left action fails", fn(model, _) {
    if model == 1 {
      Fail("left")
    } else {
      Pass
    }
  })
  match
    replay_failure(left_only_colliding_label_machine(), replay_property, [
      LabelRight,
    ]) {
    Some(failure) => {
      assert_eq(failure.structured_trace.length(), 1)
      assert_eq(failure.structured_trace[0].to, "label:1")
    }
    None => fail("replay must use the available message with the matching ID")
  }
  let state_report = run(
    state_collision_machine(),
    [],
    config_for_tests(1, 2, 8, 1, 1024),
  )
  assert_true(
    state_report.diagnostics.any(fn(diagnostic) {
      diagnostic.kind == StateIdentityCollision
    }),
  )

  let distinct_actions = run(
    duplicate_label_machine(false),
    [],
    config_for_tests(8, 1, 8, 1, 1024),
  )
  assert_true(
    distinct_actions.transitions.any(fn(transition) {
      transition.action_id == "left-action"
    }),
  )
  assert_true(
    distinct_actions.transitions.any(fn(transition) {
      transition.action_id == "right-action"
    }),
  )
  assert_true(
    !distinct_actions.diagnostics.any(fn(diagnostic) {
      diagnostic.kind == ActionIdentityCollision
    }),
  )

  let colliding_actions = run(
    duplicate_label_machine(true),
    [],
    config_for_tests(1, 1, 8, 1, 1024),
  )
  assert_true(
    colliding_actions.diagnostics.any(fn(diagnostic) {
      diagnostic.kind == ActionIdentityCollision
    }),
  )
}

///|
test "cycle and duplicate shrink candidates terminate" {
  let property = state_property("cycle fails", fn(model, _) {
    if model == 0 {
      Pass
    } else {
      Fail("cycle")
    }
  })
  let report = run(
    cycle_machine(),
    [property],
    config_for_tests(1, 1, 8, 1, 1024),
  )
  assert_eq(report.failures.length(), 1)
  assert_eq(report.failures[0].trace.length(), 1)
  assert_eq(report.failures[0].structured_trace.length(), 1)
  assert_true(
    !report.diagnostics.any(fn(diagnostic) {
      diagnostic.kind == ShrinkBudgetExceeded
    }),
  )

  let limited = run(
    cycle_machine(),
    [property],
    config_for_tests(1, 1, 8, 1, 1),
  )
  assert_true(
    limited.diagnostics.any(fn(diagnostic) {
      diagnostic.kind == ShrinkBudgetExceeded
    }),
  )
  assert_eq(limited.failures.length(), 1)
}

///|
test "runner explores reachable states" {
  let properties : Array[Property[CounterModel, CounterMsg]] = [
    state_property("count remains non-negative", fn(model, _) {
      if model.count >= 0 {
        Pass
      } else {
        Fail("negative count")
      }
    }),
    transition_property("reset returns to zero", fn(_, msg, after) {
      match msg {
        Reset if after.count != 0 => Fail("reset did not return to zero")
        _ => Pass
      }
    }),
  ]
  let report = run(counter_machine(counter_actions), properties, {
    cases: 12,
    max_depth: 6,
    max_states: 32,
    seed: 7,
    shrink_budget: 1024,
  })
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
      if model.count < 2 {
        Pass
      } else {
        Fail("count reached two")
      }
    }),
  ]
  let report = run(counter_machine(only_large_increment), properties, {
    cases: 1,
    max_depth: 3,
    max_states: 8,
    seed: 1,
    shrink_budget: 1024,
  })
  assert_eq(report.failures.length(), 1)
  assert_eq(report.failures[0].trace.length(), 1)
  assert_eq(report.failures[0].trace[0], "Inc(2)")
}

///|
test "shrinking keeps counterexamples reachable" {
  let properties : Array[Property[GateModel, GateMsg]] = [
    state_property("submission fails", fn(model, _) {
      if model.submitted {
        Fail("submitted")
      } else {
        Pass
      }
    }),
  ]
  let report = run(gate_machine(), properties, {
    cases: 1,
    max_depth: 3,
    max_states: 8,
    seed: 1,
    shrink_budget: 1024,
  })
  assert_eq(report.failures.length(), 1)
  assert_eq(report.failures[0].trace.length(), 2)
  assert_eq(report.failures[0].trace[0], "OpenGate")
  assert_eq(report.failures[0].trace[1], "SubmitGate")
}

///|
test "state limit stops before recording a dangling transition" {
  let report = run(counter_machine(counter_actions), [], {
    cases: 1,
    max_depth: 3,
    max_states: 1,
    seed: 1,
    shrink_budget: 1024,
  })
  assert_eq(report.states.length(), 1)
  assert_eq(report.transitions.length(), 0)
  assert_eq(report.steps, 0)
}

///|
test "transition failure target is included in state snapshots" {
  let properties : Array[Property[CounterModel, CounterMsg]] = [
    transition_property("increment fails", fn(_, msg, _) {
      match msg {
        Inc(_) => Fail("increment rejected")
        Reset => Pass
      }
    }),
  ]
  let report = run(counter_machine(counter_actions), properties, {
    cases: 1,
    max_depth: 3,
    max_states: 8,
    seed: 1,
    shrink_budget: 1024,
  })
  assert_eq(report.failures.length(), 1)
  let failure_state = report.failures[0].state_id
  let mut found = false
  for state in report.states {
    if state.id == failure_state {
      found = true
    }
  }
  assert_true(found)
  let provenance = report.failures[0].structured_trace
  assert_eq(provenance.length(), 1)
  assert_eq(provenance[0].from, "counter:0")
  assert_eq(provenance[0].action, report.failures[0].trace[0])
  assert_eq(provenance[0].to, report.failures[0].state_id)
  assert_eq(report.transitions.length(), report.steps)
  let html = report_to_html(report)
  assert_true(html.contains("increment fails"))
  assert_true(html.contains("Property failures"))
  assert_true(html.contains("flow-node"))
  assert_true(report_to_dot(report).contains("color=red"))
  let failure_json = report_to_json(report)
  assert_true(failure_json.contains("structuredTrace"))
  assert_true(failure_json.contains("actionId"))
  assert_true(!html.contains("<script"))
}

///|
test "atlas exporters include discovered graph" {
  let report = run(counter_machine(counter_actions), [], {
    cases: 2,
    max_depth: 2,
    max_states: 8,
    seed: 3,
    shrink_budget: 1024,
  })
  let json = report_to_json(report)
  let dot = report_to_dot(report)
  let html = report_to_html(report)
  assert_true(json.contains("\"states\""))
  assert_true(json.contains("\"schemaVersion\":2"))
  assert_true(json.contains("\"actionId\""))
  assert_true(json.contains("\"dependencies\""))
  assert_true(dot.contains("digraph ui_states"))
  assert_true(html.contains("<html lang=\"en\">"))
  assert_true(html.contains("Proped Rabbita Atlas"))
  assert_true(html.contains("Flow Canvas"))
  assert_true(html.contains("flow-arrow"))
  assert_true(html.contains("flow-node"))
  assert_true(html.contains("atlas.json"))
  assert_true(html.contains("atlas.dot"))
  assert_true(!html.contains("<script"))
  assert_true(html.contains(report_to_flow_svg(report)))
}

///|
test "static atlas escapes failure details" {
  let report : RunReport = {
    schema_version: 2,
    seed: 1,
    cases: 1,
    max_depth: 1,
    max_states: 1,
    shrink_budget: 1024,
    strategy: "xorshift64",
    steps: 0,
    states: [],
    transitions: [],
    failures: [
      {
        property: "<property & name>",
        message: "message with <unsafe> & quotes \"here\"",
        state_id: "state<'one'>",
        trace: ["Action<&>"],
        structured_trace: [],
      },
    ],
    diagnostics: [],
  }
  let html = report_to_html(report)
  assert_true(html.contains("&lt;property &amp; name&gt;"))
  assert_true(
    html.contains("message with &lt;unsafe&gt; &amp; quotes &quot;here&quot;"),
  )
  assert_true(html.contains("state&lt;&#39;one&#39;&gt;"))
  assert_true(html.contains("Action&lt;&amp;&gt;"))
  assert_true(!html.contains("<script"))
}

///|
test "empty static atlas includes a flow SVG and success summary" {
  let report : RunReport = {
    schema_version: 2,
    seed: 1,
    cases: 0,
    max_depth: 0,
    max_states: 1,
    shrink_budget: 1024,
    strategy: "xorshift64",
    steps: 0,
    states: [],
    transitions: [],
    failures: [],
    diagnostics: [],
  }
  let html = report_to_html(report)
  assert_true(html.contains("Flow Canvas"))
  assert_true(html.contains("flow-arrow"))
  assert_true(html.contains("All generated traces satisfied"))
}

///|
test "differential build selects dependent states" {
  let report = run(counter_machine(counter_actions), [], {
    cases: 4,
    max_depth: 3,
    max_states: 16,
    seed: 1,
    shrink_budget: 1024,
  })
  let theme_affected = affected_state_ids(report, ["theme/base.css"])
  assert_eq(theme_affected.length(), 1)
  assert_eq(theme_affected[0], "counter:0")
  let view_affected = affected_state_ids(report, ["counter/view.mbt"])
  assert_eq(view_affected.length(), report.states.length())
}
