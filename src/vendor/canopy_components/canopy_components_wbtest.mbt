///|
test "resizable positive Int max nudge wraps backward before clamping" {
  let before = initial()
  let after = update(before, ResizeNudge(2147483647, 0))
  assert_eq(before.resize.w, 120)
  assert_eq(after.resize.w, 50)
  assert_true(after.resize.w < before.resize.w)
}

///|
test "stale pointer move after end is ignored" {
  let dragging = update(initial(), ResizeStart(SouthEast, 0, 0))
  let moved = update(dragging, ResizeMove(25, 35))
  let ended = update(moved, ResizeEnd)
  let stale = update(ended, ResizeMove(1000, 1000))
  assert_eq(stale.resize.w, ended.resize.w)
  assert_eq(stale.resize.h, ended.resize.h)
}

///|
test "menu focus wraps and invalid direct focus is ignored" {
  let opened = update(initial(), MenuOpen)
  let previous = update(opened, MenuPrevious)
  assert_eq(previous.menu.focused, Some(2))
  let invalid = update(previous, MenuFocus(99))
  assert_eq(invalid.menu.focused, Some(2))
  let empty = update(invalid, MenuReset(0))
  assert_eq(empty.menu.focused, None)
}

///|
test "tabs clamp direct selection and navigation wraps" {
  let invalid = update(initial(), TabSelect(99))
  assert_eq(invalid.tabs.selected, 2)
  let wrapped = update(invalid, TabKey("ArrowRight"))
  assert_eq(wrapped.tabs.selected, 0)
  let empty = update(wrapped, TabReset(0, 10))
  assert_eq(empty.tabs.tab_count, 0)
  assert_eq(empty.tabs.selected, 0)
}

///|
test "Canopy exploration shrinks overflow to one nudge" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "positive resize nudges do not decrease width")
  assert_eq(failure.trace, ["ResizeNudge(dw=2147483647, dh=0)"])
  assert_true(report.states.length() >= 100)
  assert_true(report.transitions.length() >= 300)
  for prefix in ["menu-", "tab-", "resize-"] {
    assert_true(
      report.transitions.any(transition => {
        transition.action_id.has_prefix(prefix)
      }),
    )
  }
}
