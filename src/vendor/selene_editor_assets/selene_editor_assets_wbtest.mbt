///|
test "older asset response replaces newer accepted assets" {
  let changed = update(initial(), AssetFileChanged)
  let newer = update(changed, AssetsLoaded(2, Newer))
  assert_eq(newer.assets, ["assets/hero-v2.png", "assets/new.png"])
  let stale = update(newer, AssetsLoaded(1, Older))
  assert_eq(stale.assets, ["assets/hero.png", "assets/legacy.png"])
  assert_eq(stale.last_asset_response_id, 1)
}

///|
test "duplicate initialize installs duplicate subscriptions" {
  let once = update(initial(), Initialize)
  assert_eq(once.subscriptions.length(), 4)
  assert_true(
    once.subscriptions.any(effect => effect.operation == "sidebar-layout"),
  )
  assert_eq(once.pending_requests.length(), 2)
  let twice = update(once, Initialize)
  assert_eq(twice.subscriptions.length(), 8)
  assert_eq(twice.pending_requests.length(), 3)
}

///|
test "preview selection normalizes deleted and missing entities" {
  let deleted = update(initial(), DeleteSelected)
  assert_false(deleted.scene_entities.contains("entity-1"))
  let stale = update(
    deleted,
    PreviewSelectionChanged(Some("entity-1"), ["entity-1"]),
  )
  assert_eq(stale.selected_entity_id, None)
  assert_eq(stale.selected_entity_ids, [])
}

///|
test "Selene exploration retains asset and initialization failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.failures.length() >= 2)
  assert_true(
    report.failures.any(failure => {
      failure.property ==
      "older asset responses do not replace newer asset lists"
    }),
  )
  assert_true(
    report.failures.any(failure => {
      failure.property == "initialization installs each subscription once"
    }),
  )
}
