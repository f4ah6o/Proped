///|
test "older Moonclaw snapshot response revives a completed run" {
  let first = update(initial(), PollRun)
  let second = update(first, PollRun)
  let completed = update(second, SnapshotLoaded(2, "run-1", Succeeded))
  assert_eq(completed.snapshot.unwrap().status, Succeeded)
  let revived = update(completed, SnapshotLoaded(1, "run-1", Running))
  assert_eq(revived.snapshot.unwrap().status, Running)
  assert_eq(revived.last_applied_request_id, 1)
}

///|
test "Moonclaw exploration minimizes stale snapshot revival" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(
    failure.property,
    "older snapshot responses do not revive terminal runs",
  )
  assert_eq(failure.trace, [
    "StreamClosed(\"run-1\")", "StreamClosed(\"run-1\")", "SnapshotLoaded(request=2, run=\"run-1\", status=Succeeded)",
    "SnapshotLoaded(request=1, run=\"run-1\", status=Running)",
  ])
}

///|
test "Moonclaw ignores another run response and deduplicates stream events" {
  let requested = update(initial(), PollRun)
  let selected = update(requested, SelectRun("run-2"))
  let stale = update(selected, SnapshotLoaded(1, "run-1", Succeeded))
  assert_eq(stale.snapshot, None)
  let event : TimelineEntry = {
    id: "event-1",
    run_id: "run-2",
    event_type: "step.progress",
    timestamp: 1,
  }
  let once = update(stale, StreamEvent("run-2", event))
  let twice = update(once, StreamEvent("run-2", event))
  assert_eq(twice.timeline.length(), 1)
}

///|
test "Moonclaw exploration covers requests responses streams and selection" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 300)
  let prefixes = [
    "select-run:", "poll-run", "snapshot-loaded:", "snapshot-failed:", "stream-event:",
    "stream-closed:",
  ]
  for prefix in prefixes {
    assert_true(
      report.transitions.any(transition => {
        transition.action_id.has_prefix(prefix)
      }),
    )
  }
}
