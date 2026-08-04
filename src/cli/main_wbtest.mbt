///|
test "CLI parsing skips executable and accepts machine flags anywhere" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--json", "--output", "artifacts",
  ])
  assert_true(parsed.json)
  assert_true(!parsed.help)
  assert_eq(parsed.output, "artifacts")
  assert_eq(parsed.positionals, ["demo", "run", "all"])
  assert_eq(parsed.error, None)
}

///|
test "CLI parsing treats help as a global flag" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--help",
  ])
  assert_true(parsed.help)
  assert_eq(parsed.positionals, ["demo", "run", "all"])
  assert_eq(parsed.error, None)
}

///|
test "CLI parsing reports a missing output directory" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--output",
  ])
  assert_eq(parsed.error, Some("--output requires a directory"))
}

///|
test "CLI parsing rejects unknown options" {
  let parsed = parse_args(["/tmp/proped-rabbita", "demo", "list", "--yaml"])
  assert_eq(parsed.error, Some("unknown option: --yaml"))
}

///|
test "command schema exposes demos artifacts and exit codes" {
  let schema = schema_json()
  assert_true(schema.contains("rabbita-counter"))
  assert_true(schema.contains("rabbita-todo"))
  assert_true(schema.contains("rabbita-sokoban"))
  assert_true(schema.contains("rabbita-subscriptions"))
  assert_true(schema.contains("rabbita-websocket"))
  assert_true(schema.contains("summary.json"))
  assert_true(schema.contains("expectation_mismatch"))
}

///|
test "run summaries are stable machine-readable envelopes" {
  let summary : RunSummary = {
    id: "example",
    output: "demo/out/example",
    schema_version: 2,
    seed: 7,
    states: 3,
    transitions: 5,
    failures: 0,
    diagnostics: 0,
    expected_failure: false,
    expected_failure_property: "",
    expected_failure_trace: [],
    first_failure: None,
  }
  let json = summaries_json([summary])
  assert_true(json.contains("\"ok\":true"))
  assert_true(json.contains("\"states\":3"))
  assert_true(json.contains("atlas.json"))
}

///|
test "expected failure summaries expose the minimized counterexample" {
  let failure : MinimalFailure = {
    property: "stored todo titles are not blank",
    message: "todo 0 has a blank title",
    state_id: "todo-state",
    trace: ["TitleChanged(\" \")", "Add"],
    action_ids: ["title:1: ", "add"],
  }
  let summary : RunSummary = {
    id: "rabbita-todo",
    output: "demo/out/rabbita-todo",
    schema_version: 2,
    seed: 29,
    states: 100,
    transitions: 500,
    failures: 1,
    diagnostics: 0,
    expected_failure: true,
    expected_failure_property: "stored todo titles are not blank",
    expected_failure_trace: ["TitleChanged(\" \")", "Add"],
    first_failure: Some(failure),
  }
  let json = summary_to_json(summary)
  assert_true(json.contains("\"expectedOutcome\":\"failure\""))
  assert_true(json.contains("\"expectationMet\":true"))
  assert_true(json.contains("\"expectedFailure\":{"))
  assert_true(json.contains("\"traceLength\":2"))
  assert_true(json.contains("\"actionIds\":[\"title:1: \",\"add\"]"))
}

///|
test "expected failure requires the declared property and minimized trace" {
  let observed : MinimalFailure = {
    property: "different property",
    message: "different failure",
    state_id: "state",
    trace: ["TitleChanged(\" \")", "Add"],
    action_ids: ["title:1: ", "add"],
  }
  let summary : RunSummary = {
    id: "rabbita-todo",
    output: "demo/out/rabbita-todo",
    schema_version: 2,
    seed: 29,
    states: 1,
    transitions: 2,
    failures: 1,
    diagnostics: 0,
    expected_failure: true,
    expected_failure_property: "stored todo titles are not blank",
    expected_failure_trace: ["TitleChanged(\" \")", "Add"],
    first_failure: Some(observed),
  }
  assert_true(!expectation_met(summary))
}

///|
test "new practical demos describe exact failure signatures" {
  assert_true(sokoban_description_json().contains("Move(Up)"))
  assert_true(
    subscriptions_description_json().contains(
      "paused ticker ignores queued tick",
    ),
  )
  assert_true(
    websocket_description_json().contains("ClientDisconnectRequested"),
  )
}

///|
test "command schema exposes external application commands" {
  let schema = schema_json()
  assert_true(schema.contains("external"))
  assert_true(schema.contains("inspect-source"))
  assert_true(schema.contains("proton-demo-todo"))
  assert_true(schema.contains("ensenzu-app"))
  assert_true(schema.contains("0.6.0"))
}

///|
test "external inspection reports read-only provenance" {
  let json = proton_external_inspection_json()
  assert_true(json.contains("justjavac/proton-demo"))
  assert_true(
    json.contains(
      "69787a7a175b323ba0c6e01ea2acfc8692379ed938217bcf00c7d3a8c1f79c8b",
    ),
  )
  assert_true(json.contains("read-only"))
}

///|
test "source inspection envelope exposes detected boundaries" {
  let source =
    #|import { "moonbit-community/rabbita" }
    #|struct Model { value : Int }
    #|enum Msg { Load }
    #|fn update(model : Model, msg : Msg) { model }
    #|fn view(model : Model) { model }
    #|fn subscriptions(model : Model) { model }
  let inspection = @external.inspect_source(source)
  let json = source_inspection_json("fixture.mbt", inspection)
  assert_true(json.contains("subscription-model"))
  assert_true(json.contains("\"model\":true"))
  assert_true(json.contains("\"subscription\":true"))
}

///|
test "Ensenzu inspection reports finite-input property and provenance" {
  let json = ensenzu_external_inspection_json()
  assert_true(json.contains("shiguri-01/ensenzu"))
  assert_true(json.contains("effect-model"))
  assert_true(json.contains("active numeric fields reject non-finite input"))
  assert_true(json.contains("expectedFailure"))
  assert_true(json.contains("Infinity"))
  assert_true(json.contains("read-only"))
}

///|
test "external list exposes both pinned applications" {
  let json = external_list_json()
  assert_true(json.contains("proton-demo-todo"))
  assert_true(json.contains("ensenzu-app"))
}
