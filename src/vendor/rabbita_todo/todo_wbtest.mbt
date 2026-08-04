///|
test "upstream add guard accepts whitespace-only titles" {
  let titled = update(initial(), TitleChanged(" "))
  let added = update(titled, Add)
  assert_eq(added.items.length(), 1)
  assert_eq(added.items[0].title, " ")
}

///|
test "todo exploration finds and minimizes the blank-title failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "stored todo titles are not blank")
  assert_eq(failure.trace, ["TitleChanged(\" \")", "Add"])
  assert_eq(failure.structured_trace.length(), 2)
  assert_eq(failure.structured_trace[0].action_id, "title:1: ")
  assert_eq(failure.structured_trace[1].action_id, "add")
}

///|
test "todo model still explores practical interactions around the failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 40)
  assert_true(report.transitions.length() >= 100)
  let mut saw_toggle = false
  let mut saw_delete = false
  let mut saw_stats = false
  for transition in report.transitions {
    if transition.action_id.has_prefix("toggle:") {
      saw_toggle = true
    }
    if transition.action_id.has_prefix("delete:") {
      saw_delete = true
    }
    if transition.action_id == "tab:stats" {
      saw_stats = true
    }
  }
  assert_true(saw_toggle)
  assert_true(saw_delete)
  assert_true(saw_stats)
}
