///|
test "stale item response can replace the selected feed" {
  let first = update(initial(), SelectSubscription(1))
  let second = update(first, SelectSubscription(2))
  let stale = update(
    second,
    ItemsLoaded(1, 1, [
      {
        id: 11,
        subscription_id: 1,
        title: "Feed 1 item",
        read: false,
        saved: false,
      },
    ]),
  )
  assert_eq(stale.selected_subscription_id, 2)
  assert_eq(stale.items[0].subscription_id, 1)
}

///|
test "stale search response can replace results for a newer query" {
  let opened = update(initial(), OpenSearchModal)
  let first = update(opened, UpdateSearchQuery("alpha"))
  let second = update(first, UpdateSearchQuery("beta"))
  let stale = update(
    second,
    SearchLoaded(1, "alpha", [
      { item_id: 105, query: "alpha", title: "Result for alpha", saved: false },
    ]),
  )
  assert_eq(stale.search_query, "beta")
  assert_eq(stale.search_results[0].query, "alpha")
}

///|
test "stale saved callback can override the latest intent" {
  let saved = update(initial(), ToggleItemSaved(1, true))
  let unsaved = update(saved, ToggleItemSaved(1, false))
  let stale = update(unsaved, ItemSavedSet(1, 1, true, true))
  assert_eq(stale.desired_saved, false)
  assert_eq(stale.items[0].saved, true)
}

///|
test "exploration retains all three response-order failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.diagnostics.length(), 0)
  assert_true(report.states.length() >= 500)
  assert_true(report.transitions.length() >= 1000)
  assert_true(
    report.failures.any(failure => {
      failure.property == "feed responses match the current subscription"
    }),
  )
  assert_true(
    report.failures.any(failure => {
      failure.property == "search responses match the current query"
    }),
  )
  assert_true(
    report.failures.any(failure => {
      failure.property == "latest saved intent wins"
    }),
  )
}
