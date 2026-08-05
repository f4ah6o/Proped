///|
test "explicit resize preserves pinned non-positive dimensions" {
  let next = update(initial(), Resize(0, 24))
  assert_eq(next.cols, 0)
  assert_eq(next.rows, 24)
}

///|
test "dispose ignores stale callbacks and is idempotent" {
  let ready = update(initial(), XtermLoaded(1))
  let disposed = update(ready, Dispose)
  assert_eq(update(disposed, Dispose), disposed)
  assert_eq(update(disposed, Data(1, "stale")), disposed)
  assert_eq(update(disposed, Resized(1, 120, 40)), disposed)
}

///|
test "UTF-8 write chunks remain exact while ready" {
  let ready = update(initial(), XtermLoaded(1))
  let japanese = update(ready, Write("日本語"))
  let emoji = update(japanese, Write("🙂"))
  assert_eq(emoji.writes, ["日本語", "🙂"])
}

///|
test "runner shrinks invalid dimensions to one action" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_true(report.failures.length() >= 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "terminal dimensions remain positive")
  assert_eq(failure.trace, ["Resize(cols=0, rows=24)"])
}
