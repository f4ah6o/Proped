///|
struct CliArgs {
  json : Bool
  output : String
  positionals : Array[String]
  help : Bool
  error : String?
}

///|
struct MinimalFailure {
  property : String
  message : String
  state_id : String
  trace : Array[String]
  action_ids : Array[String]
}

///|
struct RunSummary {
  id : String
  output : String
  schema_version : Int
  seed : Int
  states : Int
  transitions : Int
  failures : Int
  diagnostics : Int
  expected_failure : Bool
  expected_failure_property : String
  expected_failure_trace : Array[String]
  first_failure : MinimalFailure?
}

///|
fn json_string(value : String) -> String {
  value.escape(quote=true)
}

///|
fn parse_args(raw : Array[String]) -> CliArgs {
  let positionals : Array[String] = []
  let mut json = false
  let mut output = "demo/out"
  let mut help = false
  let mut error : String? = None
  let mut index = 1
  while index < raw.length() {
    let argument = raw[index]
    if argument == "--json" {
      json = true
    } else if argument == "--output" {
      if index + 1 >= raw.length() {
        error = Some("--output requires a directory")
      } else {
        index = index + 1
        output = raw[index]
      }
    } else if argument == "--help" || argument == "-h" {
      help = true
    } else if argument.has_prefix("-") {
      error = Some("unknown option: \{argument}")
    } else {
      positionals.push(argument)
    }
    index = index + 1
  }
  { json, output, positionals, help, error }
}

///|
fn print_help() -> Unit {
  println("Proped Rabbita CLI 0.10.0")
  println("")
  println("Usage:")
  println("  moon run src/cli -- <command> [arguments] [--json] [--output DIR]")
  println("")
  println("Commands:")
  println(
    "  schema                     Print the machine-readable command contract",
  )
  println("  version                    Print the CLI version")
  println("  demo list                  List runnable demos")
  println(
    "  demo describe <id>         Describe one demo and its deterministic defaults",
  )
  println(
    "  demo run <id|all>          Generate HTML, SVG, JSON, DOT, and summary artifacts",
  )
  println("  external list              List pinned external applications")
  println(
    "  external inspect <id>      Show manifest and adapter classification",
  )
  println(
    "  external inspect-source <file>  Detect Rabbita boundaries in a local source file",
  )
  println("  external run <id|all>      Explore pinned external applications")
  println(
    "  external handoff <id|all>  Generate local issue and PR draft bundles",
  )
  println("")
  println("Demo IDs:")
  println("  newsletter                 Passing newsletter form example")
  println(
    "  rabbita-counter            Passing vendored Rabbita counter example",
  )
  println(
    "  rabbita-todo               Vendored practical TODO with expected failure",
  )
  println("  rabbita-sokoban            Vendored Sokoban timeline failure")
  println("  rabbita-subscriptions      Vendored stale timer failure")
  println("  rabbita-websocket          Vendored duplicate disconnect failure")
  println("")
  println("External IDs:")
  println("  proton-demo-todo           Proton snapshot-order failure")
  println(
    "  ensenzu-app                Ensenzu non-finite numeric input failure",
  )
  println("  signal-reader              Signal Reader response-order failures")
  println("  moonbit-editor-file-tree   Editor file-tree resolve race")
  println("  canopy-components         Canopy resizable overflow failure")
  println("  incr-typed-spreadsheet    incr formula overflow and backdating")
  println("  incr-typed-spreadsheet    incr formula overflow and backdating")
  println("")
  println(
    "Exit codes: 0 expectation met, 2 usage error, 3 expectation mismatch",
  )
}

///|
fn schema_json() -> String {
  (
    #|{"name":"proped-rabbita","version":"0.10.0","commands":[{"argv":["schema"],"output":"command-contract-json"},{"argv":["version"],"output":"version"},{"argv":["demo","list"],"flags":["--json"]},{"argv":["demo","describe","<id>"],"flags":["--json"]},{"argv":["demo","run","<id|all>"],"flags":["--json","--output <dir>"],"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]},{"argv":["external","list"],"flags":["--json"]},{"argv":["external","inspect","<id>"],"flags":["--json"]},{"argv":["external","inspect-source","<file>"],"flags":["--json"]},{"argv":["external","run","<id|all>"],"flags":["--json","--output <dir>"],"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]},{"argv":["external","handoff","<id|all>"],"flags":["--json","--output <dir>"],"artifacts":["issue.md","reproduction.md","fix-plan.md","pr-body.md","machine.json"]}],"demoIds":["newsletter","rabbita-counter","rabbita-todo","rabbita-sokoban","rabbita-subscriptions","rabbita-websocket"],"externalIds":["proton-demo-todo","ensenzu-app","signal-reader","moonbit-editor-file-tree","canopy-components","incr-typed-spreadsheet"],"summaryFields":["expectedOutcome","expectationMet","expectedFailure","firstFailure"],"exitCodes":{"0":"expectation_met","2":"usage_error","3":"expectation_mismatch"}}
  )
}

///|
fn demo_list_json() -> String {
  (
    #|{"ok":true,"command":"demo list","demos":[{"id":"newsletter","origin":"project","expectedOutcome":"pass","description":"Newsletter form with validation, consent, submit, and reset states"},{"id":"rabbita-counter","origin":"vendored","expectedOutcome":"pass","description":"Rabbita official counter adapted for finite deterministic exploration","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357"},{"id":"rabbita-todo","origin":"vendored","expectedOutcome":"failure","description":"Rabbita official TODO blank-title failure and minimal shrinking","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357"},{"id":"rabbita-sokoban","origin":"vendored","expectedOutcome":"failure","description":"Rabbita Sokoban malformed timeline input failure","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357"},{"id":"rabbita-subscriptions","origin":"vendored","expectedOutcome":"failure","description":"Rabbita subscriptions stale timer callback failure","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357"},{"id":"rabbita-websocket","origin":"vendored","expectedOutcome":"failure","description":"Rabbita WebSocket duplicate disconnect failure","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357"}]}
  )
}

///|
fn external_list_json() -> String {
  (
    #|{"ok":true,"command":"external list","applications":[{"id":"proton-demo-todo","repository":"justjavac/proton-demo","revision":"5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d","license":"MIT","strategy":"subscription-model","expectedOutcome":"failure","description":"Proton Todo with deterministic native-effect recording and stale snapshot ordering"},{"id":"ensenzu-app","repository":"shiguri-01/ensenzu","revision":"f1fbec776a393e7023c8fa8324ea26c0774752e5","license":"Apache-2.0","strategy":"effect-model","expectedOutcome":"failure","description":"Ensenzu numeric forms, SVG calculation, reset, and non-finite input exploration"},{"id":"signal-reader","repository":"CAIMEOX/signal_reader","revision":"e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a","license":"MIT","strategy":"effect-model","expectedOutcome":"failure","description":"Signal Reader stale feed, search, and saved-state response exploration"},{"id":"moonbit-editor-file-tree","repository":"moonbitlang/editor","revision":"001c9db52bcdc543c2bec8689b70e97941cecc18","license":"Apache-2.0","strategy":"effect-model","expectedOutcome":"failure","description":"MoonBit Editor overlapping file-tree resolve and auto-reveal exploration"},{"id":"canopy-components","repository":"dowdiness/canopy","revision":"cb41945b04801084e8abe1d8edc27eb0cdce4a1c","license":"Apache-2.0","strategy":"pure","expectedOutcome":"failure","description":"Canopy resizable, menu, and tabs direct-dispatch exploration"},{"id":"incr-typed-spreadsheet","repository":"dowdiness/incr","revision":"afc715b261d99f35245f1a14a2390ae8ad86d7d0","license":"Apache-2.0","strategy":"pure","expectedOutcome":"failure","description":"Typed spreadsheet formula overflow, trace, and Eq/no-backdate exploration"}]}
  )
}

///|
fn external_inspection_json(
  manifest : @external.ExternalManifest,
  effect_kinds : Array[String],
  response_ordering : String,
  expected_failure : String,
) -> String {
  let output = StringBuilder::new()
  output.write_string(
    "{\"ok\":true,\"command\":\"external inspect\",\"application\":{",
  )
  output.write_string("\"id\":")
  output.write_string(json_string(manifest.id))
  output.write_string(",\"repository\":")
  output.write_string(json_string(manifest.repository))
  output.write_string(",\"revision\":")
  output.write_string(json_string(manifest.revision))
  output.write_string(",\"license\":")
  output.write_string(json_string(manifest.license))
  output.write_string(",\"strategy\":")
  output.write_string(json_string(manifest.strategy.to_string()))
  output.write_string(",\"effectPolicy\":")
  output.write_string(json_string(manifest.effect_policy))
  output.write_string(",\"sourceSha256\":")
  output.write_string(json_string(manifest.source_sha256))
  output.write_string(",\"entryPoints\":{\"model\":")
  output.write_string(json_string(manifest.model_entry))
  output.write_string(",\"message\":")
  output.write_string(json_string(manifest.message_entry))
  output.write_string(",\"update\":")
  output.write_string(json_string(manifest.update_entry))
  output.write_string(",\"view\":")
  output.write_string(json_string(manifest.view_entry))
  output.write_string("},\"properties\":")
  write_json_string_array(output, manifest.properties)
  output.write_string(",\"findingVisibility\":")
  output.write_string(json_string(manifest.finding_visibility.to_string()))
  output.write_string(",\"effectKinds\":")
  write_json_string_array(output, effect_kinds)
  output.write_string(",\"responseOrdering\":")
  output.write_string(json_string(response_ordering))
  output.write_string(",\"expectedFailure\":")
  output.write_string(json_string(expected_failure))
  output.write_string(",\"upstreamWritePolicy\":\"read-only\"}}")
  output.to_string()
}

///|
fn proton_external_inspection_json() -> String {
  external_inspection_json(
    @external.proton_todo_manifest(),
    ["native-invoke", "subscription-installed"],
    "all bounded permutations",
    "SnapshotReceived(version=1) -> SnapshotReceived(version=0)",
  )
}

///|
fn ensenzu_external_inspection_json() -> String {
  external_inspection_json(
    @external.ensenzu_manifest(),
    ["dom-command"],
    "not applicable",
    "Change(Frequency, \"Infinity\")",
  )
}

///|
fn signal_reader_external_inspection_json() -> String {
  external_inspection_json(
    @external.signal_reader_manifest(),
    ["http-request"],
    "all bounded domain-local permutations",
    "SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)",
  )
}

///|
fn editor_file_tree_external_inspection_json() -> String {
  external_inspection_json(
    @external.editor_file_tree_manifest(),
    ["native-invoke"],
    "all bounded pending resolve permutations",
    "ToggleDirectory(\"readonly-remote://workspace/tests\") -> SetActive(\"readonly-remote://workspace/src/lib/util.mbt\") -> DirectoryResolveFailed(request=1, uri=\"readonly-remote://workspace/tests\")",
  )
}

///|
fn canopy_components_external_inspection_json() -> String {
  external_inspection_json(
    @external.canopy_components_manifest(),
    [],
    "not applicable",
    "ResizeNudge(dw=2147483647, dh=0)",
  )
}

///|
fn incr_typed_spreadsheet_external_inspection_json() -> String {
  external_inspection_json(
    @external.incr_typed_spreadsheet_manifest(),
    [],
    "not applicable",
    "UpdateDraft(A1, \"2147483647\") -> ApplySelected",
  )
}

///|
fn print_external_inspection(
  manifest : @external.ExternalManifest,
  expected_failure : String,
) -> Unit {
  println("id: \{manifest.id}")
  println("repository: \{manifest.repository}")
  println("revision: \{manifest.revision}")
  println("license: \{manifest.license}")
  println("strategy: \{manifest.strategy.to_string()}")
  println("effect-policy: \{manifest.effect_policy}")
  println("source-sha256: \{manifest.source_sha256}")
  println("expected-failure: \{expected_failure}")
  println("upstream-write-policy: read-only")
}

///|
fn print_proton_external_inspection() -> Unit {
  print_external_inspection(
    @external.proton_todo_manifest(),
    "SnapshotReceived(version=1) -> SnapshotReceived(version=0)",
  )
}

///|
fn print_ensenzu_external_inspection() -> Unit {
  print_external_inspection(
    @external.ensenzu_manifest(),
    "Change(Frequency, \"Infinity\")",
  )
}

///|
fn print_signal_reader_external_inspection() -> Unit {
  print_external_inspection(
    @external.signal_reader_manifest(),
    "SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)",
  )
}

///|
fn print_editor_file_tree_external_inspection() -> Unit {
  print_external_inspection(
    @external.editor_file_tree_manifest(),
    "ToggleDirectory(tests) -> SetActive(src/lib/util.mbt) -> DirectoryResolveFailed(tests)",
  )
}

///|
fn print_canopy_components_external_inspection() -> Unit {
  print_external_inspection(
    @external.canopy_components_manifest(),
    "ResizeNudge(dw=2147483647, dh=0)",
  )
}

///|
fn print_incr_typed_spreadsheet_external_inspection() -> Unit {
  print_external_inspection(
    @external.incr_typed_spreadsheet_manifest(),
    "UpdateDraft(A1, \"2147483647\") -> ApplySelected",
  )
}

///|
fn source_inspection_json(
  path : String,
  inspection : @external.SourceInspection,
) -> String {
  let output = StringBuilder::new()
  output.write_string(
    "{\"ok\":true,\"command\":\"external inspect-source\",\"path\":",
  )
  output.write_string(json_string(path))
  output.write_string(",\"strategy\":")
  output.write_string(json_string(inspection.strategy.to_string()))
  output.write_string(",\"detected\":{")
  output.write_string("\"rabbitaImport\":")
  output.write_object(inspection.has_rabbita_import)
  output.write_string(",\"createState\":")
  output.write_object(inspection.has_create_state)
  output.write_string(",\"createStateWithInit\":")
  output.write_object(inspection.has_create_state_with_init)
  output.write_string(",\"cellWithDispatch\":")
  output.write_object(inspection.has_cell_with_dispatch)
  output.write_string(",\"model\":")
  output.write_object(inspection.has_model)
  output.write_string(",\"message\":")
  output.write_object(inspection.has_message)
  output.write_string(",\"update\":")
  output.write_object(inspection.has_update)
  output.write_string(",\"view\":")
  output.write_object(inspection.has_view)
  output.write_string(",\"subscription\":")
  output.write_object(inspection.has_subscription)
  output.write_string(",\"command\":")
  output.write_object(inspection.has_command)
  output.write_string("}}")
  output.to_string()
}

///|
fn print_source_inspection(
  path : String,
  inspection : @external.SourceInspection,
) -> Unit {
  println("path: \{path}")
  println("strategy: \{inspection.strategy.to_string()}")
  println("rabbita-import: \{inspection.has_rabbita_import}")
  println("model: \{inspection.has_model}")
  println("message: \{inspection.has_message}")
  println("update: \{inspection.has_update}")
  println("view: \{inspection.has_view}")
  println("subscription: \{inspection.has_subscription}")
  println("command: \{inspection.has_command}")
}

///|
fn todo_description_json() -> String {
  (
    #|{"ok":true,"command":"demo describe","demo":{"id":"rabbita-todo","origin":"vendored","expectedOutcome":"failure","upstream":"moonbit-community/rabbita examples/todo","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357","model":"title, item collection, next id, active tab","actions":["title-changed","add","delete","toggle","set-tab"],"properties":["stored todo titles are not blank","next id remains ahead of stored ids","rendered header reports active count"],"knownMinimalTrace":["space-title","add"],"defaults":{"cases":192,"maxDepth":14,"maxStates":320,"seed":29,"shrinkBudget":4096},"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]}}
  )
}

///|
fn sokoban_description_json() -> String {
  (
    #|{"ok":true,"command":"demo describe","demo":{"id":"rabbita-sokoban","origin":"vendored","expectedOutcome":"failure","upstream":"moonbit-community/rabbita examples/sokoban","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357","model":"board, player, crates, branching history, timeline cursor","actions":["move","jump-to"],"properties":["invalid timeline input preserves cursor","cursor remains inside history","all historical worlds remain valid","rendered timeline matches model"],"knownMinimalTrace":["Move(Up)","JumpTo(\"not-a-number\")"],"defaults":{"cases":192,"maxDepth":12,"maxStates":480,"seed":41,"shrinkBudget":4096},"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]}}
  )
}

///|
fn subscriptions_description_json() -> String {
  (
    #|{"ok":true,"command":"demo describe","demo":{"id":"rabbita-subscriptions","origin":"vendored","expectedOutcome":"failure","upstream":"moonbit-community/rabbita examples/subscriptions","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357","model":"seven subscription tabs, counters, event payloads, queued timer callback","actions":["select-tab","toggle-ticker","tick","resize","scroll","keydown","keyup","visibility","mouse"],"properties":["paused ticker ignores queued tick","subscription counters stay non-negative","rendered output identifies active tab"],"knownMinimalTrace":["ToggleTicker","Tick"],"defaults":{"cases":256,"maxDepth":14,"maxStates":640,"seed":43,"shrinkBudget":4096},"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]}}
  )
}

///|
fn websocket_description_json() -> String {
  (
    #|{"ok":true,"command":"demo describe","demo":{"id":"rabbita-websocket","origin":"vendored","expectedOutcome":"failure","upstream":"moonbit-community/rabbita examples/websocket","upstreamRevision":"67e8169efa1bb2e8bd17018b62b41211cbc4c357","model":"URL, draft, client lifecycle, transcript, command outcomes","actions":["url-changed","draft-changed","connect","disconnect","opened","closed","send-raw","failed","clear-transcript"],"properties":["closing client rejects repeated disconnect","transcript remains capped","rendered status matches model"],"knownMinimalTrace":["ClientConnectRequested","ClientDisconnectRequested","ClientDisconnectRequested"],"defaults":{"cases":320,"maxDepth":16,"maxStates":800,"seed":47,"shrinkBudget":8192},"artifacts":["atlas.html","atlas.svg","atlas.json","atlas.dot","summary.json"]}}
  )
}

///|
fn demo_description_json(id : String) -> String? {
  if id == "newsletter" {
    Some(
      "{\"ok\":true,\"command\":\"demo describe\",\"demo\":{\"id\":\"newsletter\",\"origin\":\"project\",\"expectedOutcome\":\"pass\",\"model\":\"email, consented, submitted\",\"actions\":[\"set-email\",\"toggle-consent\",\"submit\",\"reset\"],\"defaults\":{\"cases\":24,\"maxDepth\":8,\"maxStates\":64,\"seed\":7,\"shrinkBudget\":1024},\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}}",
    )
  } else if id == "rabbita-counter" {
    Some(
      "{\"ok\":true,\"command\":\"demo describe\",\"demo\":{\"id\":\"rabbita-counter\",\"origin\":\"vendored\",\"expectedOutcome\":\"pass\",\"upstream\":\"moonbit-community/rabbita examples/counter\",\"upstreamRevision\":\"67e8169efa1bb2e8bd17018b62b41211cbc4c357\",\"model\":\"integer bounded to [-3,3] for exploration\",\"actions\":[\"inc\",\"dec\"],\"defaults\":{\"cases\":32,\"maxDepth\":10,\"maxStates\":16,\"seed\":11,\"shrinkBudget\":256},\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}}",
    )
  } else if id == "rabbita-todo" {
    Some(todo_description_json())
  } else if id == "rabbita-sokoban" {
    Some(sokoban_description_json())
  } else if id == "rabbita-subscriptions" {
    Some(subscriptions_description_json())
  } else if id == "rabbita-websocket" {
    Some(websocket_description_json())
  } else {
    None
  }
}

///|
fn print_demo_description(id : String) -> Bool {
  if id == "newsletter" {
    println("id: newsletter")
    println("origin: project")
    println("expected-outcome: pass")
    println("model: email, consented, submitted")
    println("actions: set-email, toggle-consent, submit, reset")
    println(
      "defaults: cases=24 max-depth=8 max-states=64 seed=7 shrink-budget=1024",
    )
    true
  } else if id == "rabbita-counter" {
    println("id: rabbita-counter")
    println("origin: vendored moonbit-community/rabbita examples/counter")
    println("expected-outcome: pass")
    println("upstream-revision: 67e8169efa1bb2e8bd17018b62b41211cbc4c357")
    println("model: integer bounded to [-3,3] for finite exploration")
    println("actions: inc, dec")
    println(
      "defaults: cases=32 max-depth=10 max-states=16 seed=11 shrink-budget=256",
    )
    true
  } else if id == "rabbita-todo" {
    println("id: rabbita-todo")
    println("origin: vendored moonbit-community/rabbita examples/todo")
    println("expected-outcome: failure")
    println("known-minimal-failure: TitleChanged(\" \") -> Add")
    println(
      "defaults: cases=192 max-depth=14 max-states=320 seed=29 shrink-budget=4096",
    )
    true
  } else if id == "rabbita-sokoban" {
    println("id: rabbita-sokoban")
    println("origin: vendored moonbit-community/rabbita examples/sokoban")
    println("expected-outcome: failure")
    println("known-minimal-failure: Move(Up) -> JumpTo(\"not-a-number\")")
    println(
      "defaults: cases=192 max-depth=12 max-states=480 seed=41 shrink-budget=4096",
    )
    true
  } else if id == "rabbita-subscriptions" {
    println("id: rabbita-subscriptions")
    println("origin: vendored moonbit-community/rabbita examples/subscriptions")
    println("expected-outcome: failure")
    println("known-minimal-failure: ToggleTicker -> Tick")
    println(
      "defaults: cases=256 max-depth=14 max-states=640 seed=43 shrink-budget=4096",
    )
    true
  } else if id == "rabbita-websocket" {
    println("id: rabbita-websocket")
    println("origin: vendored moonbit-community/rabbita examples/websocket")
    println("expected-outcome: failure")
    println(
      "known-minimal-failure: ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested",
    )
    println(
      "defaults: cases=320 max-depth=16 max-states=800 seed=47 shrink-budget=8192",
    )
    true
  } else {
    false
  }
}

///|
fn first_failure(report : @proped.RunReport) -> MinimalFailure? {
  if report.failures.is_empty() {
    None
  } else {
    let failure = report.failures[0]
    let action_ids : Array[String] = []
    for transition in failure.structured_trace {
      action_ids.push(transition.action_id)
    }
    Some({
      property: failure.property,
      message: failure.message,
      state_id: failure.state_id,
      trace: failure.trace.copy(),
      action_ids,
    })
  }
}

///|
fn expectation_met(summary : RunSummary) -> Bool {
  if summary.expected_failure {
    match summary.first_failure {
      Some(failure) =>
        failure.property == summary.expected_failure_property &&
        failure.trace == summary.expected_failure_trace
      None => false
    }
  } else {
    summary.failures == 0
  }
}

///|
fn write_json_string_array(
  output : StringBuilder,
  values : Array[String],
) -> Unit {
  output.write_char('[')
  for index, value in values {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string(json_string(value))
  }
  output.write_char(']')
}

///|
fn write_minimal_failure_json(
  output : StringBuilder,
  failure : MinimalFailure?,
) -> Unit {
  match failure {
    None => output.write_string("null")
    Some(value) => {
      output.write_string("{\"property\":")
      output.write_string(json_string(value.property))
      output.write_string(",\"message\":")
      output.write_string(json_string(value.message))
      output.write_string(",\"stateId\":")
      output.write_string(json_string(value.state_id))
      output.write_string(",\"traceLength\":")
      output.write_object(value.trace.length())
      output.write_string(",\"trace\":")
      write_json_string_array(output, value.trace)
      output.write_string(",\"actionIds\":")
      write_json_string_array(output, value.action_ids)
      output.write_char('}')
    }
  }
}

///|
fn summary_to_json(summary : RunSummary) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"id\":")
  output.write_string(json_string(summary.id))
  output.write_string(",\"ok\":")
  output.write_object(expectation_met(summary))
  output.write_string(",\"expectedOutcome\":")
  output.write_string(
    json_string(if summary.expected_failure { "failure" } else { "pass" }),
  )
  output.write_string(",\"expectationMet\":")
  output.write_object(expectation_met(summary))
  output.write_string(",\"expectedFailure\":")
  if summary.expected_failure {
    output.write_string("{\"property\":")
    output.write_string(json_string(summary.expected_failure_property))
    output.write_string(",\"trace\":")
    write_json_string_array(output, summary.expected_failure_trace)
    output.write_char('}')
  } else {
    output.write_string("null")
  }
  output.write_string(",\"output\":")
  output.write_string(json_string(summary.output))
  output.write_string(",\"schemaVersion\":")
  output.write_object(summary.schema_version)
  output.write_string(",\"seed\":")
  output.write_object(summary.seed)
  output.write_string(",\"states\":")
  output.write_object(summary.states)
  output.write_string(",\"transitions\":")
  output.write_object(summary.transitions)
  output.write_string(",\"failures\":")
  output.write_object(summary.failures)
  output.write_string(",\"diagnostics\":")
  output.write_object(summary.diagnostics)
  output.write_string(",\"firstFailure\":")
  write_minimal_failure_json(output, summary.first_failure)
  output.write_string(
    ",\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}",
  )
  output.to_string()
}

///|
async fn write_report_files(
  output_dir : String,
  report : @proped.RunReport,
) -> Unit {
  if !@fs.exists(output_dir) {
    @fs.mkdir(output_dir, recursive=true)
  }
  @fs.write_file(
    "\{output_dir}/atlas.html",
    @proped.report_to_html(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.svg",
    @proped.report_to_flow_svg(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.json",
    @proped.report_to_json(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.dot",
    @proped.report_to_dot(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
}

///|
async fn finish_run(
  id : String,
  output : String,
  expected_failure : Bool,
  expected_failure_property : String,
  expected_failure_trace : Array[String],
  report : @proped.RunReport,
) -> RunSummary {
  write_report_files(output, report)
  let summary : RunSummary = {
    id,
    output,
    schema_version: report.schema_version,
    seed: report.seed,
    states: report.states.length(),
    transitions: report.transitions.length(),
    failures: report.failures.length(),
    diagnostics: report.diagnostics.length(),
    expected_failure,
    expected_failure_property,
    expected_failure_trace,
    first_failure: first_failure(report),
  }
  @fs.write_file(
    "\{output}/summary.json",
    summary_to_json(summary),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  summary
}

///|
async fn run_newsletter(output_root : String) -> RunSummary {
  let report = @proped.run(
    @newsletter.machine(),
    @newsletter.properties(),
    @newsletter.default_config(),
  )
  finish_run("newsletter", "\{output_root}/newsletter", false, "", [], report)
}

///|
async fn run_counter(output_root : String) -> RunSummary {
  let report = @proped.run(
    @counter.machine(),
    @counter.properties(),
    @counter.default_config(),
  )
  finish_run(
    "rabbita-counter",
    "\{output_root}/rabbita-counter",
    false,
    "",
    [],
    report,
  )
}

///|
async fn run_todo(output_root : String) -> RunSummary {
  let report = @proped.run(
    @todo.machine(),
    @todo.properties(),
    @todo.default_config(),
  )
  finish_run(
    "rabbita-todo",
    "\{output_root}/rabbita-todo",
    true,
    "stored todo titles are not blank",
    ["TitleChanged(\" \")", "Add"],
    report,
  )
}

///|
async fn run_sokoban(output_root : String) -> RunSummary {
  let report = @proped.run(
    @sokoban.machine(),
    @sokoban.properties(),
    @sokoban.default_config(),
  )
  finish_run(
    "rabbita-sokoban",
    "\{output_root}/rabbita-sokoban",
    true,
    "invalid timeline input preserves cursor",
    ["Move(Up)", "JumpTo(\"not-a-number\")"],
    report,
  )
}

///|
async fn run_subscriptions(output_root : String) -> RunSummary {
  let report = @proped.run(
    @subscriptions.machine(),
    @subscriptions.properties(),
    @subscriptions.default_config(),
  )
  finish_run(
    "rabbita-subscriptions",
    "\{output_root}/rabbita-subscriptions",
    true,
    "paused ticker ignores queued tick",
    ["ToggleTicker", "Tick"],
    report,
  )
}

///|
async fn run_websocket(output_root : String) -> RunSummary {
  let report = @proped.run(
    @websocket.machine(),
    @websocket.properties(),
    @websocket.default_config(),
  )
  finish_run(
    "rabbita-websocket",
    "\{output_root}/rabbita-websocket",
    true,
    "closing client rejects repeated disconnect",
    [
      "ClientConnectRequested", "ClientDisconnectRequested", "ClientDisconnectRequested",
    ],
    report,
  )
}

///|
struct ExternalRunPolicy {
  output : String
  details_withheld : Bool
}

///|
fn external_run_policy(
  manifest : @external.ExternalManifest,
  output_root : String,
) -> ExternalRunPolicy {
  match manifest.finding_visibility {
    @disclosure.PublicBug =>
      { output: "\{output_root}/\{manifest.id}", details_withheld: false }
    @disclosure.PrivateSecurity =>
      {
        output: ".private/disclosures/\{manifest.id}/run",
        details_withheld: true,
      }
  }
}

///|
async fn finish_external_run(
  manifest : @external.ExternalManifest,
  output_root : String,
  expected_failure_property : String,
  expected_failure_trace : Array[String],
  report : @proped.RunReport,
) -> RunSummary {
  let policy = external_run_policy(manifest, output_root)
  if !policy.details_withheld {
    return finish_run(
      manifest.id,
      policy.output,
      true,
      expected_failure_property,
      expected_failure_trace,
      report,
    )
  }
  write_report_files(policy.output, report)
  let redacted_failure : MinimalFailure = {
    property: "private security finding withheld",
    message: "Detailed reproduction is available only in the ignored private disclosure bundle.",
    state_id: "withheld",
    trace: [],
    action_ids: [],
  }
  let summary : RunSummary = {
    id: manifest.id,
    output: policy.output,
    schema_version: report.schema_version,
    seed: report.seed,
    states: report.states.length(),
    transitions: report.transitions.length(),
    failures: report.failures.length(),
    diagnostics: report.diagnostics.length(),
    expected_failure: true,
    expected_failure_property: "private security finding withheld",
    expected_failure_trace: [],
    first_failure: Some(redacted_failure),
  }
  @fs.write_file(
    "\{policy.output}/summary.json",
    summary_to_json(summary),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  summary
}

///|
async fn run_proton_todo(output_root : String) -> RunSummary {
  let report = @proped.run(
    @proton_todo.machine(),
    @proton_todo.properties(),
    @proton_todo.default_config(),
  )
  finish_external_run(
    @external.proton_todo_manifest(),
    output_root,
    "snapshot version never decreases",
    ["SnapshotReceived(version=1)", "SnapshotReceived(version=0)"],
    report,
  )
}

///|
async fn run_ensenzu(output_root : String) -> RunSummary {
  let report = @proped.run(
    @ensenzu_app.machine(),
    @ensenzu_app.properties(),
    @ensenzu_app.default_config(),
  )
  finish_external_run(
    @external.ensenzu_manifest(),
    output_root,
    "active numeric fields reject non-finite input",
    ["Change(Frequency, \"Infinity\")"],
    report,
  )
}

///|
async fn run_signal_reader(output_root : String) -> RunSummary {
  let report = @proped.run(
    @signal_reader.machine(),
    @signal_reader.properties(),
    @signal_reader.default_config(),
  )
  finish_external_run(
    @external.signal_reader_manifest(),
    output_root,
    "feed responses match the current subscription",
    [
      "SelectSubscription(2)", "SelectSubscription(1)", "ItemsLoaded(request=1, subscription=2)",
    ],
    report,
  )
}

///|
async fn run_editor_file_tree(output_root : String) -> RunSummary {
  let report = @proped.run(
    @editor_file_tree.machine(),
    @editor_file_tree.properties(),
    @editor_file_tree.default_config(),
  )
  finish_external_run(
    @external.editor_file_tree_manifest(),
    output_root,
    "asynchronous resolve responses preserve newer tree intent",
    [
      "ToggleDirectory(\"readonly-remote://workspace/tests\")", "SetActive(\"readonly-remote://workspace/src/lib/util.mbt\")",
      "DirectoryResolveFailed(request=1, uri=\"readonly-remote://workspace/tests\")",
    ],
    report,
  )
}

///|
async fn run_canopy_components(output_root : String) -> RunSummary {
  let report = @proped.run(
    @canopy_components.machine(),
    @canopy_components.properties(),
    @canopy_components.default_config(),
  )
  finish_external_run(
    @external.canopy_components_manifest(),
    output_root,
    "positive resize nudges do not decrease width",
    ["ResizeNudge(dw=2147483647, dh=0)"],
    report,
  )
}

///|
async fn run_incr_typed_spreadsheet(output_root : String) -> RunSummary {
  let report = @proped.run(
    @incr_sheet.machine(),
    @incr_sheet.properties(),
    @incr_sheet.default_config(),
  )
  finish_external_run(
    @external.incr_typed_spreadsheet_manifest(),
    output_root,
    "positive formula addition does not wrap backward",
    ["UpdateDraft(A1, \"2147483647\")", "ApplySelected"],
    report,
  )
}

///|
fn summaries_json_for(
  command : String,
  summaries : Array[RunSummary],
) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"ok\":")
  let mut ok = true
  for summary in summaries {
    if !expectation_met(summary) {
      ok = false
    }
  }
  output.write_object(ok)
  output.write_string(",\"command\":")
  output.write_string(json_string(command))
  output.write_string(",\"runs\":[")
  for index, summary in summaries {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string(summary_to_json(summary))
  }
  output.write_string("]}")
  output.to_string()
}

///|
fn summaries_json(summaries : Array[RunSummary]) -> String {
  summaries_json_for("demo run", summaries)
}

///|
fn print_summaries(summaries : Array[RunSummary]) -> Unit {
  for summary in summaries {
    let status = if expectation_met(summary) { "ok" } else { "mismatch" }
    let expectation = if summary.expected_failure { "failure" } else { "pass" }
    println(
      "\{summary.id} \{status} expected=\{expectation} states=\{summary.states} transitions=\{summary.transitions} failures=\{summary.failures} diagnostics=\{summary.diagnostics} output=\{summary.output}",
    )
    match summary.first_failure {
      Some(failure) => {
        let trace = failure.trace.join(" -> ")
        println("  minimal failure: \{failure.property}: \{trace}")
      }
      None => ()
    }
  }
}

///|
fn handoff_spec(id : String) -> @disclosure.FindingHandoff? {
  if id == "proton-demo-todo" {
    Some(@external.proton_todo_handoff())
  } else if id == "ensenzu-app" {
    Some(@external.ensenzu_handoff())
  } else if id == "signal-reader" {
    Some(@external.signal_reader_handoff())
  } else if id == "moonbit-editor-file-tree" {
    Some(@external.editor_file_tree_handoff())
  } else if id == "canopy-components" {
    Some(@external.canopy_components_handoff())
  } else if id == "incr-typed-spreadsheet" {
    Some(@external.incr_typed_spreadsheet_handoff())
  } else {
    None
  }
}

///|
async fn write_handoff_files(
  root : String,
  files : Array[@disclosure.HandoffFile],
) -> Unit {
  if !@fs.exists(root) {
    @fs.mkdir(root, recursive=true)
  }
  for file in files {
    @fs.write_file(
      "\{root}/\{file.name}",
      file.content,
      create_mode=@fs.CreateMode::CreateOrTruncate,
    )
  }
}

///|
async fn generate_handoff(
  output_root : String,
  spec : @disclosure.FindingHandoff,
) -> String {
  match spec.visibility {
    @disclosure.PublicBug => {
      let output = "\{output_root}/handoff/\{spec.id}"
      match @disclosure.public_handoff_files(spec) {
        Ok(files) => write_handoff_files(output, files)
        Err(_) => ()
      }
      @disclosure.safe_status_json(spec, output)
    }
    @disclosure.PrivateSecurity => {
      let output = ".private/disclosures/\{spec.id}"
      write_handoff_files(output, @disclosure.private_handoff_files(spec))
      @disclosure.safe_status_json(spec, output)
    }
  }
}

///|
fn handoff_envelope(statuses : Array[String]) -> String {
  "{\"ok\":true,\"command\":\"external handoff\",\"handoffs\":[" +
  statuses.join(",") +
  "]}"
}

///|
fn usage_error(message : String, json : Bool) -> Unit {
  if json {
    println(
      "{\"ok\":false,\"error\":{\"code\":\"usage_error\",\"message\":\{json_string(message)}}}",
    )
  } else {
    println("error: \{message}")
  }
  @sys.exit(2)
}

///|
async fn main {
  let parsed = parse_args(@env.args())
  match parsed.error {
    Some(message) => {
      usage_error(message, parsed.json)
      return
    }
    None => ()
  }
  let args = parsed.positionals
  if parsed.help ||
    args.length() == 0 ||
    (args.length() == 1 && args[0] == "help") {
    print_help()
    return
  }
  if args[0] == "version" {
    if args.length() != 1 {
      usage_error("version does not accept positional arguments", parsed.json)
      return
    }
    if parsed.json {
      println("{\"ok\":true,\"version\":\"0.10.0\"}")
    } else {
      println("proped-rabbita 0.10.0")
    }
    return
  }
  if args[0] == "schema" {
    if args.length() != 1 {
      usage_error("schema does not accept positional arguments", parsed.json)
      return
    }
    println(schema_json())
    return
  }
  if args[0] == "external" {
    if args.length() < 2 {
      usage_error(
        "use external list, inspect, inspect-source, handoff, or run",
        parsed.json,
      )
      return
    }
    if args[1] == "list" {
      if args.length() != 2 {
        usage_error(
          "external list does not accept positional arguments",
          parsed.json,
        )
        return
      }
      if parsed.json {
        println(external_list_json())
      } else {
        println(
          "proton-demo-todo\tjustjavac/proton-demo\tsubscription-model\tfailure\tSnapshot-order exploration",
        )
        println(
          "ensenzu-app\tshiguri-01/ensenzu\teffect-model\tfailure\tNon-finite numeric input exploration",
        )
        println(
          "signal-reader\tCAIMEOX/signal_reader\teffect-model\tfailure\tResponse-order exploration",
        )
        println(
          "moonbit-editor-file-tree\tmoonbitlang/editor\teffect-model\tfailure\tFile-tree resolve race exploration",
        )
        println(
          "canopy-components\tdowdiness/canopy\tpure\tfailure\tResizable, menu, and tabs exploration",
        )
        println(
          "incr-typed-spreadsheet\tdowdiness/incr\tpure\tfailure\tFormula overflow and backdating exploration",
        )
        println(
          "incr-typed-spreadsheet\tdowdiness/incr\tpure\tfailure\tFormula overflow and backdating exploration",
        )
      }
      return
    }

    if args[1] == "handoff" {
      if args.length() != 3 {
        usage_error(
          "external handoff requires exactly one id or all",
          parsed.json,
        )
        return
      }
      let requested = args[2]
      let statuses : Array[String] = []
      if requested == "all" {
        statuses.push(
          generate_handoff(parsed.output, @external.proton_todo_handoff()),
        )
        statuses.push(
          generate_handoff(parsed.output, @external.ensenzu_handoff()),
        )
        statuses.push(
          generate_handoff(parsed.output, @external.signal_reader_handoff()),
        )
        statuses.push(
          generate_handoff(parsed.output, @external.editor_file_tree_handoff()),
        )
        statuses.push(
          generate_handoff(parsed.output, @external.canopy_components_handoff()),
        )
        statuses.push(
          generate_handoff(
            parsed.output,
            @external.incr_typed_spreadsheet_handoff(),
          ),
        )
      } else {
        match handoff_spec(requested) {
          Some(spec) => statuses.push(generate_handoff(parsed.output, spec))
          None => {
            usage_error("unknown external id: \{requested}", parsed.json)
            return
          }
        }
      }
      if parsed.json {
        println(handoff_envelope(statuses))
      } else {
        for status in statuses {
          println(status)
        }
      }
      return
    }
    if args[1] == "inspect-source" {
      if args.length() != 3 {
        usage_error(
          "external inspect-source requires exactly one file",
          parsed.json,
        )
        return
      }
      let path = args[2]
      let source = try @fs.read_file(path).text() catch {
        _ => {
          usage_error("cannot read source file: \{path}", parsed.json)
          return
        }
      } noraise {
        text => text
      }
      let inspection = @external.inspect_source(source)
      if parsed.json {
        println(source_inspection_json(path, inspection))
      } else {
        print_source_inspection(path, inspection)
      }
      return
    }
    if args[1] == "inspect" {
      if args.length() != 3 {
        usage_error("external inspect requires exactly one id", parsed.json)
        return
      }
      let inspect_id = args[2]
      if inspect_id == "proton-demo-todo" {
        if parsed.json {
          println(proton_external_inspection_json())
        } else {
          print_proton_external_inspection()
        }
      } else if inspect_id == "ensenzu-app" {
        if parsed.json {
          println(ensenzu_external_inspection_json())
        } else {
          print_ensenzu_external_inspection()
        }
      } else if inspect_id == "signal-reader" {
        if parsed.json {
          println(signal_reader_external_inspection_json())
        } else {
          print_signal_reader_external_inspection()
        }
      } else if inspect_id == "moonbit-editor-file-tree" {
        if parsed.json {
          println(editor_file_tree_external_inspection_json())
        } else {
          print_editor_file_tree_external_inspection()
        }
      } else if inspect_id == "canopy-components" {
        if parsed.json {
          println(canopy_components_external_inspection_json())
        } else {
          print_canopy_components_external_inspection()
        }
      } else if inspect_id == "incr-typed-spreadsheet" {
        if parsed.json {
          println(incr_typed_spreadsheet_external_inspection_json())
        } else {
          print_incr_typed_spreadsheet_external_inspection()
        }
      } else {
        usage_error("unknown external id: \{inspect_id}", parsed.json)
        return
      }
      return
    }
    if args[1] != "run" || args.length() != 3 {
      usage_error(
        "use external list, inspect, inspect-source, handoff, or run",
        parsed.json,
      )
      return
    }
    let external_id = args[2]
    let external_summaries : Array[RunSummary] = []
    let external_root = "\{parsed.output}/external"
    if external_id == "proton-demo-todo" {
      external_summaries.push(run_proton_todo(external_root))
    } else if external_id == "ensenzu-app" {
      external_summaries.push(run_ensenzu(external_root))
    } else if external_id == "signal-reader" {
      external_summaries.push(run_signal_reader(external_root))
    } else if external_id == "moonbit-editor-file-tree" {
      external_summaries.push(run_editor_file_tree(external_root))
    } else if external_id == "canopy-components" {
      external_summaries.push(run_canopy_components(external_root))
    } else if external_id == "incr-typed-spreadsheet" {
      external_summaries.push(run_incr_typed_spreadsheet(external_root))
    } else if external_id == "all" {
      external_summaries.push(run_proton_todo(external_root))
      external_summaries.push(run_ensenzu(external_root))
      external_summaries.push(run_signal_reader(external_root))
      external_summaries.push(run_editor_file_tree(external_root))
      external_summaries.push(run_canopy_components(external_root))
      external_summaries.push(run_incr_typed_spreadsheet(external_root))
    } else {
      usage_error("unknown external id: \{external_id}", parsed.json)
      return
    }
    if parsed.json {
      println(summaries_json_for("external run", external_summaries))
    } else {
      print_summaries(external_summaries)
    }
    for summary in external_summaries {
      if !expectation_met(summary) {
        @sys.exit(3)
      }
    }
    return
  }
  if args[0] != "demo" || args.length() < 2 {
    usage_error("unknown command; use help or schema", parsed.json)
    return
  }
  if args[1] == "list" {
    if args.length() != 2 {
      usage_error("demo list does not accept positional arguments", parsed.json)
      return
    }
    if parsed.json {
      println(demo_list_json())
    } else {
      println("newsletter\tproject\tpass\tNewsletter form state exploration")
      println(
        "rabbita-counter\tvendored\tpass\tOfficial Rabbita counter state exploration",
      )
      println(
        "rabbita-todo\tvendored\tfailure\tOfficial Rabbita TODO minimal-failure exploration",
      )
      println(
        "rabbita-sokoban\tvendored\tfailure\tSokoban malformed timeline exploration",
      )
      println(
        "rabbita-subscriptions\tvendored\tfailure\tSubscriptions stale timer exploration",
      )
      println(
        "rabbita-websocket\tvendored\tfailure\tWebSocket duplicate disconnect exploration",
      )
    }
    return
  }
  if args[1] == "describe" {
    if args.length() != 3 {
      usage_error("demo describe requires exactly one demo id", parsed.json)
      return
    }
    let id = args[2]
    if parsed.json {
      match demo_description_json(id) {
        Some(description) => println(description)
        None => {
          usage_error("unknown demo id: \{id}", true)
          return
        }
      }
    } else if !print_demo_description(id) {
      usage_error("unknown demo id: \{id}", false)
      return
    }
    return
  }
  if args[1] != "run" || args.length() != 3 {
    usage_error(
      "use demo list, demo describe <id>, or demo run <id|all>",
      parsed.json,
    )
    return
  }
  let id = args[2]
  let summaries : Array[RunSummary] = []
  if id == "newsletter" {
    summaries.push(run_newsletter(parsed.output))
  } else if id == "rabbita-counter" {
    summaries.push(run_counter(parsed.output))
  } else if id == "rabbita-todo" {
    summaries.push(run_todo(parsed.output))
  } else if id == "rabbita-sokoban" {
    summaries.push(run_sokoban(parsed.output))
  } else if id == "rabbita-subscriptions" {
    summaries.push(run_subscriptions(parsed.output))
  } else if id == "rabbita-websocket" {
    summaries.push(run_websocket(parsed.output))
  } else if id == "all" {
    summaries.push(run_newsletter(parsed.output))
    summaries.push(run_counter(parsed.output))
    summaries.push(run_todo(parsed.output))
    summaries.push(run_sokoban(parsed.output))
    summaries.push(run_subscriptions(parsed.output))
    summaries.push(run_websocket(parsed.output))
  } else {
    usage_error("unknown demo id: \{id}", parsed.json)
    return
  }
  if parsed.json {
    println(summaries_json(summaries))
  } else {
    print_summaries(summaries)
  }
  for summary in summaries {
    if !expectation_met(summary) {
      @sys.exit(3)
    }
  }
}
