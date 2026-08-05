///|
test "supported utility models preserve generic invariants" {
  let edited = update(initial(), SymwebEdit("x + 2"))
  let stale = update(edited, SymwebDebouncedRun(0))
  assert_eq(stale.symweb, edited.symweb)

  let invalid_selection = update(initial(), IssuesSelect(99))
  assert_eq(invalid_selection.issues.selected, 1)

  let invalid_title = update(initial(), FullstackEdit(""))
  assert_eq(invalid_title.fullstack.warning, Some("title cannot be empty"))

  let subscribed = update(initial(), ProtonSubscribe)
  let unsubscribed = update(subscribed, ProtonUnsubscribe)
  let stale_event = update(
    unsubscribed,
    ProtonEvent(subscribed.proton.generation),
  )
  assert_eq(stale_event.proton.delivered_events, 0)
}

///|
test "Issues Dashboard accepts reverse GraphSaved delivery" {
  let first = update(initial(), IssuesSave)
  let second = update(first, IssuesSave)
  let newer = update(second, IssuesDeliver(2))
  assert_eq(newer.issues.graph_revision, 2)
  let older = update(newer, IssuesDeliver(1))
  assert_eq(older.issues.graph_revision, 1)
}

///|
test "Fullstack Trial accepts reply for an older edited title" {
  let edited = update(initial(), FullstackEdit("valid"))
  let submitted = update(edited, FullstackSubmit)
  let changed = update(submitted, FullstackEdit("edited"))
  let replied = update(changed, FullstackDeliver(1))
  assert_eq(replied.fullstack.server_message, Some("reply for valid"))
  assert_eq(replied.fullstack.title, "edited")
}

///|
test "Fullstack Trial initial submit crosses request boundary with empty title" {
  let submitted = update(initial(), FullstackSubmit)
  assert_eq(submitted.fullstack.pending.length(), 1)
  assert_eq(submitted.fullstack.pending[0].payload, "")
}

///|
test "utility batch exploration retains exact primary failure" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_eq(report.failures.length(), 3)
  let failure = report.failures[0]
  assert_eq(failure.property, "Fullstack invalid titles are not submitted")
  assert_eq(failure.trace, ["FullstackSubmit"])
  let mut issues_trace : Array[String]? = None
  for candidate in report.failures {
    if candidate.property ==
      "Issues Dashboard older save replies do not roll back graph revision" {
      issues_trace = Some(candidate.trace)
    }
  }
  assert_eq(
    issues_trace,
    Some([
      "IssuesSave", "IssuesSave", "IssuesDeliver(id=2)", "IssuesDeliver(id=1)",
    ]),
  )
  assert_eq(report.states.length(), 3400)
  assert_eq(report.transitions.length(), 7646)
  assert_true(report.transitions.length() >= 200)
  for prefix in ["symweb-", "issues-", "fullstack-", "proton-"] {
    assert_true(
      report.transitions.any(transition => {
        transition.action_id.has_prefix(prefix)
      }),
    )
  }
}
