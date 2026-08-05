///|
test "CodeMirror command descriptors are deterministic" {
  assert_eq(
    EditorCommand::Mount(1, "editor", "host").to_string(),
    "mount:g=1:id=editor:host=host",
  )
  assert_eq(
    EditorCommand::ForwardSelection(2, 1, 3).to_string(),
    "selection:g=2:1:3",
  )
}

///|
test "queued document callback can arrive after unmount" {
  let mounted = update(initial(), MountCompleted)
  let queued = update(mounted, BrowserDocumentChanged("draft"))
  let unmounted = update(queued, UnmountRequested)
  assert_eq(unmounted.pending.length(), 1)
  let delivered = update(unmounted, DeliverCallback(1))
  assert_eq(delivered.document, "draft")
  assert_false(delivered.mounted)
}

///|
test "context menu close clears focus" {
  let opened = update(initial(), ContextMenuOpen)
  assert_eq(opened.context_menu.focused, Some(0))
  let closed = update(opened, ContextMenuClose)
  assert_eq(closed.context_menu.focused, None)
}

///|
test "Canopy editor exploration shrinks reverse callback ordering" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_true(report.failures.length() >= 1)
  let failure = report.failures[0]
  assert_eq(
    failure.property,
    "older document callbacks do not replace newer accepted revisions",
  )
  assert_eq(failure.trace, [
    "MountCompleted(generation=1)", "BrowserDocumentChanged(\"draft\")", "BrowserDocumentChanged(\"draft\")",
    "DeliverCallback(id=2)", "DeliverCallback(id=1)",
  ])
  assert_true(report.states.length() >= 30)
  assert_true(report.transitions.length() >= 60)
}
