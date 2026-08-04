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
