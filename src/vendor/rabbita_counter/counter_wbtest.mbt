///|
test "vendored counter preserves upstream increment and decrement semantics" {
  assert_eq(update(0, Inc), 1)
  assert_eq(update(0, Dec), -1)
}

///|
test "vendored counter exploration is finite at both boundaries" {
  assert_eq(actions(-3), [Inc])
  assert_eq(actions(0), [Inc, Dec])
  assert_eq(actions(3), [Dec])
}

///|
test "vendored counter renders the visible upstream controls" {
  let report = @proped.run(machine(), properties(), default_config())
  let mut rendered_two = false
  for state in report.states {
    if state.id == "rabbita-counter:2" {
      assert_true(state.html.contains("<h1>2</h1>"))
      assert_true(state.html.contains(">+</button>"))
      assert_true(state.html.contains(">-</button>"))
      rendered_two = true
    }
  }
  assert_true(rendered_two)
}
