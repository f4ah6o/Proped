///|
test "disconnect remains enabled while client is already closing" {
  let connecting = update(initial(), ClientConnectRequested)
  assert_eq(connecting.client_status, "connecting")
  let closing = update(connecting, ClientDisconnectRequested)
  assert_eq(closing.client_status, "closing")
  assert_true(client_connecting(closing.client_status))
  let repeated = update(closing, ClientDisconnectRequested)
  assert_eq(repeated.transcript.length(), closing.transcript.length() + 1)
}

///|
test "websocket exploration minimizes duplicate disconnect failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "closing client rejects repeated disconnect")
  assert_eq(failure.trace, [
    "ClientConnectRequested", "ClientDisconnectRequested", "ClientDisconnectRequested",
  ])
  assert_eq(failure.structured_trace.length(), 3)
}

///|
test "websocket explores connection send failure and transcript paths" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 50)
  assert_true(report.transitions.length() >= 500)
  let prefixes = [
    "client-opened", "client-closed:", "client-failed:", "client-send-raw",
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
