///|
test "upstream update accepts an older snapshot after a newer one" {
  let newer = update(initial(), SnapshotReceived({ version: 2, todos: [] }))
  let older = update(newer, SnapshotReceived({ version: 1, todos: [] }))
  assert_eq(older.snapshot.version, 1)
}

///|
test "proton exploration minimizes snapshot rollback" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "snapshot version never decreases")
  assert_eq(failure.trace, [
    "SnapshotReceived(version=1)", "SnapshotReceived(version=0)",
  ])
  assert_eq(failure.structured_trace.length(), 2)
}

///|
test "proton exploration is deterministic" {
  let first = @proped.report_to_json(
    @proped.run(machine(), properties(), default_config()),
  )
  let second = @proped.report_to_json(
    @proped.run(machine(), properties(), default_config()),
  )
  assert_eq(first, second)
}

///|
test "proton adapter records native effects without executing them" {
  let loaded = update(initial(), Load)
  assert_eq(loaded.pending_effects.length(), 1)
  assert_eq(loaded.pending_effects[0].operation, "list_todos")
  let drafted = update(loaded, DraftChanged("hello"))
  let created = update(drafted, Create)
  assert_eq(created.pending_effects.length(), 2)
  assert_eq(created.pending_effects[1].operation, "create_todo")
}
