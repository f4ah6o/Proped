///|
test "stale unrelated failure clears a newer reveal target" {
  let first = update(initial(), SetActive(target_tests()))
  let second = update(first, SetActive(target_src()))
  assert_eq(second.pending_reveal, Some(target_src()))
  assert_eq(second.pending_resolves.length(), 2)
  let stale = second.pending_resolves[0]
  let after = update(second, DirectoryResolveFailed(stale.effect.id, stale.uri))
  assert_eq(after.pending_reveal, None)
  assert_eq(after.selected, Some(target_src()))
}

///|
test "root response ordering can roll the fixture backward" {
  let first = update(initial(), Refresh)
  let switched = update(first, SwitchFixture(2))
  let second = update(switched, Refresh)
  let old = second.pending_resolves[0]
  let new = second.pending_resolves[1]
  let newer = update(
    second,
    DirectoryResolveSucceeded(new.effect.id, new.uri, new.fixture_revision),
  )
  assert_eq(newer.accepted_root_revision, 2)
  let older = update(
    newer,
    DirectoryResolveSucceeded(old.effect.id, old.uri, old.fixture_revision),
  )
  assert_eq(older.accepted_root_revision, 1)
}

///|
test "outside target terminates without a resolve" {
  let after = update(initial(), SetActive(target_outside()))
  assert_eq(after.selected, Some(target_outside()))
  assert_eq(after.pending_reveal, None)
  assert_true(after.pending_resolves.is_empty())
}

///|
test "late success keeps a manually collapsed directory collapsed" {
  let expanded = update(initial(), ToggleDirectory("\{root()}/src"))
  assert_eq(expanded.pending_resolves.length(), 1)
  let collapsed = update(expanded, ToggleDirectory("\{root()}/src"))
  let pending = collapsed.pending_resolves[0]
  let resolved = update(
    collapsed,
    DirectoryResolveSucceeded(
      pending.effect.id,
      pending.uri,
      pending.fixture_revision,
    ),
  )
  let src = find_in_root(resolved.root, "\{root()}/src").unwrap()
  assert_true(!src.expanded)
  assert_true(src.children is Some(_))
}

///|
test "exploration shrinks the stale reveal failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_true(report.states.length() >= 500)
  assert_true(report.transitions.length() >= 1000)
  assert_eq(report.failures.length(), 2)
  let failure = report.failures[0]
  assert_eq(
    failure.property,
    "asynchronous resolve responses preserve newer tree intent",
  )
  assert_eq(failure.trace, [
    "ToggleDirectory(\"readonly-remote://workspace/tests\")", "SetActive(\"readonly-remote://workspace/src/lib/util.mbt\")",
    "DirectoryResolveFailed(request=1, uri=\"readonly-remote://workspace/tests\")",
  ])
  let collapse = report.failures[1]
  assert_eq(
    collapse.property,
    "late resolve does not re-expand a collapsed directory",
  )
  assert_eq(collapse.trace, [
    "SetActive(\"readonly-remote://workspace/tests/spec.mbt\")", "ToggleDirectory(\"readonly-remote://workspace/tests\")",
    "DirectoryResolveSucceeded(request=1, uri=\"readonly-remote://workspace/tests\", fixture=1)",
  ])
}
