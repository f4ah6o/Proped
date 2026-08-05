///|
test "old update channel reply is accepted after provider switch" {
  let switched = update(initial(), ProviderChanged(Staging))
  assert_true(switched.update_ux is UpdateUnknown)
  let stale = update(switched, UpdateCheckFinished(1, Production, Found, false))
  assert_true(stale.provider is Staging)
  assert_true(stale.update_ux is UpdateAvailable(channel=Production, ..))
}

///|
test "duplicate emulator ready issues duplicate terminal opens" {
  let mounted = update(initial(), ToggleTerminal)
  let once = update(mounted, EmulatorReady(1, 80, 24))
  let twice = update(once, EmulatorReady(1, 80, 24))
  assert_eq(twice.pending_terminal_opens.length(), 2)
}

///|
test "older duplicate file read replaces newer content" {
  let selected = update(initial(), FileSelected("src/main.mbt"))
  let selected_again = update(selected, FileSelected("src/main.mbt"))
  let request_ids = selected_again.pending_file_reads.map(read => read.effect.id)
  assert_eq(request_ids.length(), 2)
  let newer = update(selected_again, FileLoaded(request_ids[1], Newer))
  let stale = update(newer, FileLoaded(request_ids[0], Older))
  assert_true(stale.file_tabs[0].state is FileLoaded(content="older content"))
}

///|
test "OpenSeek exploration retains all three submodel failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.failures.length() >= 3)
  assert_true(
    report.failures.any(f => {
      f.property == "update check replies match the active provider channel"
    }),
  )
  assert_true(
    report.failures.any(f => {
      f.property == "one opening terminal tab issues one terminal open request"
    }),
  )
  assert_true(
    report.failures.any(f => {
      f.property == "older file replies do not replace newer file content"
    }),
  )
}
