///|
test "Ensenzu accepts non-finite frequency without validation error" {
  let next = update(initial(), Change(Frequency, "Infinity"))
  assert_true(!next.pending_input)
  assert_eq(next.error, None)
  assert_eq(next.fields.frequency, "Infinity")
}

///|
test "Ensenzu action corpus covers every field and input representative" {
  let initial_actions = actions(initial())
  for key in all_field_keys() {
    for value in input_corpus() {
      let expected = action_id(Change(key, value))
      let mut found = false
      for action in initial_actions {
        if action_id(action) == expected {
          found = true
          break
        }
      }
      assert_true(found)
    }
  }
}

///|
test "Ensenzu exploration minimizes accepted Infinity failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "active numeric fields reject non-finite input")
  assert_eq(failure.trace, ["Change(Frequency, \"Infinity\")"])
  assert_eq(failure.structured_trace.length(), 1)
  assert_eq(report.diagnostics.length(), 0)
}

///|
test "Ensenzu reset confirmation paths preserve or restore fields" {
  let changed = update(initial(), Change(PhaseVoltage, "200"))
  let requested = update(changed, RequestReset)
  assert_true(requested.confirm_reset)
  let cancelled = update(requested, CancelReset)
  assert_eq(cancelled.fields.phase_voltage, "200")
  let reset = update(requested, Reset)
  assert_eq(reset.fields, default_app_fields())
}

///|
test "Ensenzu download is recorded as one deterministic DOM effect" {
  let downloaded = update(initial(), Download)
  assert_eq(downloaded.pending_effects.length(), 1)
  assert_eq(downloaded.pending_effects[0].kind, @external.DomCommand)
  assert_eq(downloaded.pending_effects[0].operation, "download-svg")
  assert_eq(update(downloaded, Download), downloaded)
}
