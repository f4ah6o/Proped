///|
test "newsletter reaches submitted state only from ready input" {
  let ready_model = {
    email: "alice@example.com",
    consented: true,
    submitted: false,
  }
  assert_true(ready(ready_model))
  assert_eq(update(ready_model, Submit).submitted, true)
  assert_eq(update(initial(), Submit), initial())
}

///|
test "newsletter machine exposes only reachable actions" {
  assert_eq(actions(initial()).length(), 4)
  let submitted = {
    email: "alice@example.com",
    consented: true,
    submitted: true,
  }
  assert_eq(actions(submitted), [Reset])
}

///|
test "newsletter default exploration has no property failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 0)
  assert_true(report.states.length() >= 4)
}
