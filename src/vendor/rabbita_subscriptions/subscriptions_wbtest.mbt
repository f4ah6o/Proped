///|
test "queued tick increments after ticker is paused" {
  let paused = update(initial(), ToggleTicker)
  assert_true(!paused.app.ticking)
  assert_true(paused.pending_tick)
  let ticked = update(paused, Tick)
  assert_eq(ticked.app.tick_count, 1)
}

///|
test "subscriptions exploration shrinks stale timer failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "paused ticker ignores queued tick")
  assert_eq(failure.trace, ["ToggleTicker", "Tick"])
  assert_eq(failure.structured_trace.length(), 2)
}

///|
test "subscriptions explores all event classes" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 50)
  assert_true(report.transitions.length() >= 500)
  let prefixes = [
    "resize:", "scroll:", "keydown:", "keyup:", "visibility:", "mouse:",
  ]
  for prefix in prefixes {
    let mut found = false
    for transition in report.transitions {
      if transition.action_id.has_prefix(prefix) {
        found = true
        break
      }
    }
    assert_true(found)
  }
}
