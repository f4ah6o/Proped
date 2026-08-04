///|
test "typed spreadsheet starts with seeded formula" {
  let model = initial()
  assert_eq(snapshot_for(model, "A1").unwrap().value, IntValue(10))
  assert_eq(snapshot_for(model, "B1").unwrap().value, IntValue(11))
  assert_eq(model.probe.eq_downstream_count, 1)
  assert_eq(model.probe.no_backdate_downstream_count, 1)
}

///|
test "integer addition wraps at Int32 boundary" {
  let drafted = update(initial(), UpdateDraft("A1", "2147483647"))
  let applied = update(drafted, ApplySelected)
  assert_eq(snapshot_for(applied, "A1").unwrap().value, IntValue(2147483647))
  assert_eq(snapshot_for(applied, "B1").unwrap().value, IntValue(-2147483648))
  assert_true(applied.trace.recomputed.contains("B1"))
  assert_true(applied.trace.changed.contains("B1"))
}

///|
test "parse error preserves worksheet and committed text" {
  let drafted = update(initial(), UpdateDraft("A1", "oops"))
  let failed = update(drafted, ApplySelected)
  assert_true(failed.error is Some(_))
  assert_eq(failed.committed, initial().committed)
  assert_eq(failed.snapshots, initial().snapshots)
}

///|
test "delete invalidates dependent formula" {
  let selected = update(initial(), SelectCell("A1"))
  let deleted = update(selected, DeleteSelected)
  assert_eq(snapshot_for(deleted, "A1").unwrap().value, BlankValue)
  assert_true(snapshot_for(deleted, "B1").unwrap().value is ErrorValue(_))
}

///|
test "Eq backdating skips stable downstream while no-backdate propagates" {
  let probed = update(initial(), SetProbeInput(6))
  assert_eq(probed.probe.eq_middle_count, 2)
  assert_eq(probed.probe.eq_downstream_count, 1)
  assert_eq(probed.probe.no_backdate_middle_count, 2)
  assert_eq(probed.probe.no_backdate_downstream_count, 2)
  assert_eq(probed.probe.eq_value, "even")
  assert_eq(probed.probe.no_backdate_value, "even")
}

///|
test "stale inline blur does not reapply committed edit" {
  let editing = update(initial(), BeginInlineEdit("C1"))
  let drafted = update(editing, UpdateDraft("C1", "7"))
  let applied = update(drafted, ApplyInlineEdit("C1"))
  let stale = update(applied, ApplyInlineEdit("C1"))
  assert_eq(stale, applied)
}

///|
test "incr spreadsheet exploration shrinks arithmetic overflow" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(
    failure.property,
    "positive formula addition does not wrap backward",
  )
  assert_eq(failure.trace, ["UpdateDraft(A1, \"2147483647\")", "ApplySelected"])
  assert_true(report.states.length() >= 400)
  assert_true(report.transitions.length() >= 1000)
}
