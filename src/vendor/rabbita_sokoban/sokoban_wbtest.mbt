///|
test "invalid timeline text rewinds upstream cursor to zero" {
  let moved = update(initial(), Move(Up))
  assert_eq(moved.cursor, 1)
  let jumped = update(moved, JumpTo("not-a-number"))
  assert_eq(jumped.cursor, 0)
}

///|
test "sokoban exploration minimizes malformed timeline failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "invalid timeline input preserves cursor")
  assert_eq(failure.trace, ["Move(Up)", "JumpTo(\"not-a-number\")"])
  assert_eq(failure.structured_trace.length(), 2)
}

///|
test "sokoban explores movement and timeline branching" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 20)
  assert_true(report.transitions.length() >= 100)
  let mut saw_move = false
  let mut saw_jump = false
  for transition in report.transitions {
    if transition.action_id.has_prefix("move:") {
      saw_move = true
    }
    if transition.action_id.has_prefix("jump:") {
      saw_jump = true
    }
  }
  assert_true(saw_move)
  assert_true(saw_jump)
}
