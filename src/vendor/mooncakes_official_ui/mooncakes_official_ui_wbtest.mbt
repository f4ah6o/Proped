///|
test "older Build Queue response replaces a newer accepted result" {
  let reloading = update(initial(), ReloadBuilds)
  let newer = update(reloading, BuildsLoaded(2, Newer))
  assert_eq(newer.queue, Success("queue-newer"))
  let stale = update(newer, BuildsLoaded(1, Older))
  assert_eq(stale.queue, Success("queue-older"))
  assert_eq(stale.last_build_response_id, 1)
}

///|
test "malformed Build Queue corpus fails queue and recent together" {
  let corpora = [MissingCollections, InvalidQueuedItem, InvalidRecentItem]
  for corpus in corpora {
    let failed = update(initial(), BuildsDecodeFailed(1, corpus))
    assert_eq(failed.queue, Failed)
    assert_eq(failed.recent, Failed)
  }
}

///|
test "tutorial reply can overwrite a newer edit" {
  let tutorial = update(initial(), ShowSurface(Tutorial))
  let named = update(tutorial, EditTitle("alpha"))
  let edited = update(named, SubmitTitle)
  let changed = update(edited, EditTitle("beta"))
  let replied = update(changed, TutorialReply(2, "alpha", true))
  assert_eq(replied.tutorial_title, "beta")
  assert_eq(replied.tutorial_server_message, Some("accepted: alpha"))
}

///|
test "official UI exploration retains response-order failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.failures.length() >= 2)
  let mut build_index = -1
  let mut tutorial_index = -1
  for index, failure in report.failures {
    if failure.property ==
      "older build responses do not replace newer Build Queue results" {
      build_index = index
    }
    if failure.property == "tutorial replies match the current edited title" {
      tutorial_index = index
    }
  }
  assert_true(build_index >= 0)
  assert_true(tutorial_index >= 0)
  let build = report.failures[build_index]
  assert_eq(build.trace, [
    "ReloadBuilds", "BuildsDecodeFailed(request=2, corpus=missing-collections)",
    "BuildsLoaded(request=1, fixture=older)",
  ])
  let tutorial_failure = report.failures[tutorial_index]
  assert_true(
    tutorial_failure.trace.any(step => {
      step.has_prefix("TutorialReply(") ||
      step.has_prefix("TutorialMalformedReply(")
    }),
  )
}

///|
test "official UI exploration covers production fixtures and decoder corpus" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 400)
  let prefixes = [
    "surface:", "reload-builds", "builds-loaded:", "builds-decode-failed:", "builds-failed:",
    "toggle-theme", "select-hero-tab:", "select-carousel:", "edit-title:", "submit-title",
    "tutorial-reply:", "tutorial-malformed:",
  ]
  for prefix in prefixes {
    assert_true(
      report.transitions.any(transition => {
        transition.action_id.has_prefix(prefix)
      }),
    )
  }
}
