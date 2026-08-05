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
  assert_true(schema.contains("0.20.0"))
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
test "external list exposes all pinned applications" {
  let json = external_list_json()
  assert_true(json.contains("proton-demo-todo"))
  assert_true(json.contains("ensenzu-app"))
  assert_true(json.contains("signal-reader"))
  assert_true(json.contains("moonbit-editor-file-tree"))
  assert_true(json.contains("canopy-components"))
  assert_true(json.contains("canopy-editor-integration"))
  assert_true(json.contains("rabbita-utility-batch"))
  assert_true(json.contains("incr-typed-spreadsheet"))
  assert_true(json.contains("circular-state"))
  assert_true(json.contains("isomorphic-suite"))
  assert_true(json.contains("rabbita-xterm-lifecycle"))
  assert_true(json.contains("moonclaw-job"))
  assert_true(json.contains("mooncakes-official-ui"))
  assert_true(json.contains("selene-editor-assets"))
  assert_true(json.contains("openseek-desktop-lifecycle"))
}

///|
test "Signal Reader inspection and handoff expose response ordering" {
  let json = signal_reader_external_inspection_json()
  assert_true(json.contains("CAIMEOX/signal_reader"))
  assert_true(json.contains("feed responses match the current subscription"))
  assert_true(json.contains("ItemsLoaded"))
  let spec = handoff_spec("signal-reader").unwrap()
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "private security external run policy always uses ignored private root" {
  let private_manifest = {
    ..@external.signal_reader_manifest(),
    id: "security-fixture",
    finding_visibility: @disclosure.PrivateSecurity,
  }
  let policy = external_run_policy(private_manifest, "public-output")
  assert_true(policy.details_withheld)
  assert_eq(policy.output, ".private/disclosures/security-fixture/run")
}

///|
test "MoonBit Editor file tree inspection and handoff expose resolve race" {
  let json = editor_file_tree_external_inspection_json()
  assert_true(json.contains("moonbitlang/editor"))
  assert_true(
    json.contains("asynchronous resolve responses preserve newer tree intent"),
  )
  assert_true(json.contains("DirectoryResolveFailed"))
  let spec = handoff_spec("moonbit-editor-file-tree").unwrap()
  assert_eq(spec.visibility, @disclosure.PublicBug)
  assert_eq(spec.minimal_trace.length(), 3)
}

///|
test "Canopy inspection and handoff expose overflow boundary" {
  let json = canopy_components_external_inspection_json()
  assert_true(json.contains("dowdiness/canopy"))
  assert_true(json.contains("\"strategy\":\"pure\""))
  assert_true(json.contains("positive resize nudges do not decrease width"))
  assert_true(json.contains("ResizeNudge(dw=2147483647, dh=0)"))
  let spec = handoff_spec("canopy-components").unwrap()
  assert_eq(spec.action_ids, ["resize-nudge:2147483647:0"])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Canopy editor inspection and handoff expose callback ordering" {
  let json = canopy_editor_integration_external_inspection_json()
  assert_true(json.contains("dowdiness/canopy"))
  assert_true(json.contains("subscription-model"))
  assert_true(json.contains("older document callbacks"))
  assert_true(json.contains("DeliverCallback(2)"))
  let spec = handoff_spec("canopy-editor-integration").unwrap()
  assert_eq(spec.action_ids.length(), 5)
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "utility batch inspection and handoff expose initial validation bypass" {
  let json = rabbita_utility_batch_external_inspection_json()
  assert_true(json.contains("beso1225/fullstack_trial_moonbit"))
  assert_true(json.contains("effect-model"))
  assert_true(json.contains("Fullstack invalid titles are not submitted"))
  assert_true(json.contains("FullstackSubmit"))
  let spec = handoff_spec("rabbita-utility-batch").unwrap()
  assert_eq(spec.action_ids, ["fullstack-submit"])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "incr spreadsheet inspection and handoff expose overflow evidence" {
  let json = incr_typed_spreadsheet_external_inspection_json()
  assert_true(json.contains("dowdiness/incr"))
  assert_true(json.contains("\"strategy\":\"pure\""))
  assert_true(json.contains("positive formula addition does not wrap backward"))
  assert_true(json.contains("2147483647"))
  assert_true(json.contains("expectedFailure"))
  let spec = handoff_spec("incr-typed-spreadsheet").unwrap()
  assert_eq(spec.action_ids, ["draft:A1:10:2147483647", "apply-selected"])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Circular inspection and handoff expose dangling task modal" {
  let json = circular_state_external_inspection_json()
  assert_true(json.contains("CAIMEOX/circular"))
  assert_true(json.contains("\"strategy\":\"effect-model\""))
  assert_true(json.contains("task modals retain an existing selected task"))
  assert_true(json.contains("WorkspaceMutated(kind=TaskQuickMutation"))
  let spec = handoff_spec("circular-state").unwrap()
  assert_eq(spec.action_ids, [
    "select-task:5:TSK-1", "workspace-mutated:TaskQuickMutation:1:1",
  ])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Isomorphic suite inspection and handoff cover three apps" {
  let json = isomorphic_suite_external_inspection_json()
  assert_true(json.contains("moonbit-community/isomorphic"))
  assert_true(json.contains("\"strategy\":\"effect-model\""))
  assert_true(json.contains("kanban cards reference existing columns"))
  assert_true(
    json.contains("stale todo list responses preserve newer todo mutations"),
  )
  assert_true(json.contains("selected note remains present"))
  let spec = handoff_spec("isomorphic-suite").unwrap()
  assert_eq(spec.minimal_trace, [
    "KanbanInit", "KanbanDeleteCard(1)", "KanbanBoardLoaded(request=101, fixture=0)",
  ])
  assert_eq(spec.action_ids, [
    "kanban-init", "kanban-delete:1", "kanban-board:101:0",
  ])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Rabbita xterm inspection and handoff expose invalid dimensions" {
  let json = rabbita_xterm_lifecycle_external_inspection_json()
  assert_true(json.contains("moonbit-community/rabbita_xterm"))
  assert_true(json.contains("\"strategy\":\"subscription-model\""))
  assert_true(json.contains("terminal dimensions remain positive"))
  assert_true(json.contains("Resize(cols=0, rows=24)"))
  let spec = handoff_spec("rabbita-xterm-lifecycle").unwrap()
  assert_eq(spec.minimal_trace, ["Resize(cols=0, rows=24)"])
  assert_eq(spec.action_ids, ["resize:0:24"])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Moonclaw inspection and handoff expose stale snapshot revival" {
  let json = moonclaw_job_external_inspection_json()
  assert_true(json.contains("vectie/moonclaw"))
  assert_true(json.contains("\"strategy\":\"subscription-model\""))
  assert_true(
    json.contains("older snapshot responses do not revive terminal runs"),
  )
  assert_true(json.contains("SnapshotLoaded(request=1"))
  let spec = handoff_spec("moonclaw-job").unwrap()
  assert_eq(spec.minimal_trace.length(), 4)
  assert_eq(spec.action_ids, [
    "stream-closed:5:run-1", "stream-closed:5:run-1", "snapshot-loaded:2:5:run-1:Succeeded",
    "snapshot-loaded:1:5:run-1:Running",
  ])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Mooncakes official UI inspection and handoff expose stale Build Queue response" {
  let json = mooncakes_official_ui_external_inspection_json()
  assert_true(json.contains("moonbitlang/mooncakes.io"))
  assert_true(json.contains("\"strategy\":\"effect-model\""))
  assert_true(
    json.contains(
      "older build responses do not replace newer Build Queue results",
    ),
  )
  assert_true(json.contains("BuildsDecodeFailed(request=2"))
  let spec = handoff_spec("mooncakes-official-ui").unwrap()
  assert_eq(spec.minimal_trace, [
    "ReloadBuilds", "BuildsDecodeFailed(request=2, corpus=missing-collections)",
    "BuildsLoaded(request=1, fixture=older)",
  ])
  assert_eq(spec.action_ids, [
    "reload-builds", "builds-decode-failed:2:missing-collections", "builds-loaded:1:older",
  ])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "Selene editor inspection and handoff expose duplicate initialization" {
  let json = selene_editor_assets_external_inspection_json()
  assert_true(json.contains("moonbit-community/selene"))
  assert_true(json.contains("subscription-model"))
  assert_true(json.contains("initialization installs each subscription once"))
  assert_true(json.contains("Initialize -> Initialize"))
  let spec = handoff_spec("selene-editor-assets").unwrap()
  assert_eq(spec.minimal_trace, ["Initialize", "Initialize"])
  assert_eq(spec.action_ids, ["initialize", "initialize"])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}

///|
test "OpenSeek desktop inspection and handoff expose provider-channel stale reply" {
  let json = openseek_desktop_lifecycle_external_inspection_json()
  assert_true(json.contains("moonbitlang/openseek"))
  assert_true(json.contains("effect-model"))
  assert_true(
    json.contains("update check replies match the active provider channel"),
  )
  assert_true(json.contains("ProviderChanged(staging)"))
  let spec = handoff_spec("openseek-desktop-lifecycle").unwrap()
  assert_eq(spec.minimal_trace, [
    "ProviderChanged(staging)", "UpdateCheckFinished(request=1, channel=production, result=found, explicit=false)",
  ])
  assert_eq(spec.action_ids, [
    "provider:staging", "update-check-finished:1:production:found:false",
  ])
  assert_eq(spec.visibility, @disclosure.PublicBug)
}
