///|
test "valid external manifest passes validation" {
  assert_eq(validate_manifest(proton_todo_manifest()), [])
  assert_eq(validate_manifest(ensenzu_manifest()), [])
}

///|
test "source detector classifies command and subscription applications" {
  let source =
    #|import { "moonbit-community/rabbita" }
    #|struct Model { value : Int }
    #|enum Msg { Load }
    #|fn update(model : Model, msg : Msg) { model }
    #|fn view(model : Model) { model }
    #|fn subscriptions(model : Model) { model }
    #|fn app() { @rabbita.create_state_with_init() }
  let inspection = inspect_source(source)
  assert_true(inspection.has_rabbita_import)
  assert_true(inspection.has_create_state_with_init)
  assert_true(inspection.has_subscription)
  assert_eq(inspection.strategy, SubscriptionModel)
}

///|
test "source detector rejects incomplete candidates" {
  let inspection = inspect_source("fn update() { () }")
  assert_eq(inspection.strategy, Unsupported)
}

///|
test "response order generator enumerates all bounded permutations" {
  let effects = [
    { id: 1, kind: NativeInvoke, operation: "one", payload: "" },
    { id: 2, kind: NativeInvoke, operation: "two", payload: "" },
    { id: 3, kind: NativeInvoke, operation: "three", payload: "" },
  ]
  let orders = response_orders(effects)
  assert_eq(orders.length(), 6)
  assert_true(orders.contains([1, 2, 3]))
  assert_true(orders.contains([3, 2, 1]))
}

///|
test "effect identity detector rejects duplicates" {
  let effects = [
    { id: 7, kind: HttpRequest, operation: "first", payload: "" },
    { id: 7, kind: NativeInvoke, operation: "second", payload: "" },
  ]
  assert_true(!effect_ids_unique(effects))
}

///|
test "source detector classifies effect-model applications" {
  let source =
    #|import { "moonbit-community/rabbita" }
    #|struct Model { value : Int }
    #|enum Msg { Download }
    #|fn update(_emit : @rabbita.Emit[Msg], msg : Msg, model : Model) -> (@rabbita.Cmd, Model) { (@rabbita.none, model) }
    #|fn view(model : Model) { model }
  let inspection = inspect_source(source)
  assert_true(inspection.has_command)
  assert_eq(inspection.strategy, EffectModel)
}

///|
test "public external findings produce complete handoff bundles" {
  for spec in [proton_todo_handoff(), ensenzu_handoff()] {
    let files = @disclosure.public_handoff_files(spec).unwrap()
    assert_eq(files.length(), 5)
    assert_true(files.any(file => file.name == "issue.md"))
    assert_true(files.any(file => file.name == "reproduction.md"))
    assert_true(files.any(file => file.name == "fix-plan.md"))
    assert_true(files.any(file => file.name == "pr-body.md"))
    assert_true(files.any(file => file.name == "machine.json"))
  }
}

///|
test "Signal Reader manifest and handoff are valid" {
  assert_eq(validate_manifest(signal_reader_manifest()), [])
  let files = @disclosure.public_handoff_files(signal_reader_handoff()).unwrap()
  assert_eq(files.length(), 5)
}

///|
test "source detector recognizes named model message and method view" {
  let source =
    #|import { "moonbit-community/rabbita" }
    #|struct FileTreeModel { value : Int }
    #|priv enum FileTreeMsg { Refresh }
    #|fn FileTreeModel::update(self : FileTreeModel, msg : FileTreeMsg) { self }
    #|fn FileTreeModel::view(self : FileTreeModel) { self }
    #|fn effect() { @cmd.perform() }
  let inspection = inspect_source(source)
  assert_true(inspection.has_model)
  assert_true(inspection.has_message)
  assert_true(inspection.has_update)
  assert_true(inspection.has_view)
  assert_eq(inspection.strategy, EffectModel)
}

///|
test "editor file tree manifest passes validation" {
  assert_eq(validate_manifest(editor_file_tree_manifest()), [])
}

///|
test "source detector recognizes model methods split from type declarations" {
  let source =
    #|import { "moonbit-community/rabbita" }
    #|priv enum FileTreeMsg { Refresh }
    #|fn FileTreeModel::update(self : FileTreeModel, msg : FileTreeMsg) { self }
    #|fn FileTreeModel::view(self : FileTreeModel) { self }
    #|fn effect() { @cmd.perform() }
  let inspection = inspect_source(source)
  assert_true(inspection.has_model)
  assert_true(inspection.has_message)
  assert_eq(inspection.strategy, EffectModel)
}

///|
test "Canopy component manifest and handoff record bounded direct dispatch" {
  let manifest = canopy_components_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, Pure)
  assert_eq(manifest.effect_policy, "none")
  assert_true(manifest.properties.contains("menu focus remains in range"))
  let handoff = canopy_components_handoff()
  assert_eq(handoff.minimal_trace, ["ResizeNudge(dw=2147483647, dh=0)"])
  assert_eq(handoff.action_ids, ["resize-nudge:2147483647:0"])
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}

///|
test "Canopy editor manifest and handoff preserve browser replay evidence" {
  let manifest = canopy_editor_integration_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, SubscriptionModel)
  assert_eq(manifest.effect_policy, "browser-replay")
  assert_true(
    manifest.properties.contains(
      "older document callbacks do not replace newer accepted revisions",
    ),
  )
  let handoff = canopy_editor_integration_handoff()
  assert_eq(handoff.minimal_trace.length(), 5)
  assert_eq(handoff.action_ids[3], "deliver:2")
  assert_eq(handoff.action_ids[4], "deliver:1")
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}

///|
test "utility batch manifest and handoff preserve classification failure" {
  let manifest = rabbita_utility_batch_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, EffectModel)
  assert_eq(manifest.effect_policy, "record-and-inject")
  assert_true(
    manifest.properties.contains("Fullstack invalid titles are not submitted"),
  )
  let handoff = rabbita_utility_batch_handoff()
  assert_eq(handoff.minimal_trace, ["FullstackSubmit"])
  assert_eq(handoff.action_ids, ["fullstack-submit"])
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}

///|
test "incr typed spreadsheet manifest and handoff preserve overflow evidence" {
  let manifest = incr_typed_spreadsheet_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, Pure)
  assert_eq(manifest.effect_policy, "none")
  assert_true(
    manifest.properties.contains(
      "Eq and no-backdate probes preserve declared semantics",
    ),
  )
  let handoff = incr_typed_spreadsheet_handoff()
  assert_eq(handoff.minimal_trace, [
    "UpdateDraft(A1, \"2147483647\")", "ApplySelected",
  ])
  assert_eq(handoff.action_ids, ["draft:A1:10:2147483647", "apply-selected"])
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}

///|
test "Circular state manifest and handoff preserve dangling-modal evidence" {
  let manifest = circular_state_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, EffectModel)
  assert_eq(manifest.effect_policy, "record-and-inject")
  assert_true(
    manifest.properties.contains("task modals retain an existing selected task"),
  )
  let handoff = circular_state_handoff()
  assert_eq(handoff.minimal_trace, [
    "SelectTask(\"TSK-1\")", "WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)",
  ])
  assert_eq(handoff.action_ids, [
    "select-task:5:TSK-1", "workspace-mutated:TaskQuickMutation:1:1",
  ])
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}

///|
test "Isomorphic suite manifest and handoff cover three applications" {
  let manifest = isomorphic_suite_manifest()
  assert_eq(validate_manifest(manifest), [])
  assert_eq(manifest.strategy, EffectModel)
  assert_eq(manifest.packages.length(), 3)
  assert_true(manifest.properties.contains("selected note remains present"))
  let handoff = isomorphic_suite_handoff()
  assert_eq(handoff.minimal_trace, [
    "KanbanInit", "KanbanDeleteCard(1)", "KanbanBoardLoaded(request=101, fixture=0)",
  ])
  assert_eq(handoff.action_ids, [
    "kanban-init", "kanban-delete:1", "kanban-board:101:0",
  ])
  assert_eq(handoff.visibility, @disclosure.PublicBug)
}
