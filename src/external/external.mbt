///|
/// How an external Rabbita application can be adapted for deterministic
/// exploration. The classification is intentionally conservative.
pub(all) enum AdapterStrategy {
  Pure
  EffectModel
  SubscriptionModel
  BrowserReplay
  Unsupported
} derive(Debug, Eq)

///|
pub fn AdapterStrategy::to_string(self : AdapterStrategy) -> String {
  match self {
    Pure => "pure"
    EffectModel => "effect-model"
    SubscriptionModel => "subscription-model"
    BrowserReplay => "browser-replay"
    Unsupported => "unsupported"
  }
}

///|
/// A manifest is reviewed project metadata, not executable upstream code.
pub(all) struct ExternalManifest {
  id : String
  repository : String
  revision : String
  license : String
  packages : Array[String]
  model_entry : String
  message_entry : String
  update_entry : String
  view_entry : String
  strategy : AdapterStrategy
  effect_policy : String
  source_sha256 : String
  properties : Array[String]
  finding_visibility : @disclosure.FindingVisibility
} derive(Debug, Eq)

///|
pub(all) enum ManifestError {
  MissingId
  InvalidRepository(String)
  InvalidRevision(String)
  MissingLicense
  MissingPackage
  MissingSourceHash
  MissingProperty
} derive(Debug, Eq)

///|
pub fn validate_manifest(manifest : ExternalManifest) -> Array[ManifestError] {
  let errors : Array[ManifestError] = []
  if manifest.id.trim().is_empty() {
    errors.push(MissingId)
  }
  if !manifest.repository.contains("/") ||
    manifest.repository.has_prefix("/") ||
    manifest.repository.has_suffix("/") {
    errors.push(InvalidRepository(manifest.repository))
  }
  if manifest.revision.length() != 40 {
    errors.push(InvalidRevision(manifest.revision))
  }
  if manifest.license.trim().is_empty() {
    errors.push(MissingLicense)
  }
  if manifest.packages.is_empty() {
    errors.push(MissingPackage)
  }
  if manifest.source_sha256.length() != 64 {
    errors.push(MissingSourceHash)
  }
  if manifest.properties.is_empty() {
    errors.push(MissingProperty)
  }
  errors
}

///|
pub(all) struct SourceInspection {
  has_rabbita_import : Bool
  has_create_state : Bool
  has_create_state_with_init : Bool
  has_cell_with_dispatch : Bool
  has_model : Bool
  has_message : Bool
  has_update : Bool
  has_view : Bool
  has_subscription : Bool
  has_command : Bool
  strategy : AdapterStrategy
}

///|
/// Detect the common Rabbita application boundaries from source text. This is
/// deliberately a scanner rather than a parser; explicit manifest entries stay
/// authoritative when source layout is ambiguous.
pub fn inspect_source(source : String) -> SourceInspection {
  let has_rabbita_import = source.contains("moonbit-community/rabbita") ||
    source.contains("@rabbita")
  let has_create_state = source.contains("create_state(")
  let has_create_state_with_init = source.contains("create_state_with_init(")
  let has_cell_with_dispatch = source.contains("cell_with_dispatch(")
  let has_model = source.contains("struct Model") ||
    source.contains("type Model") ||
    source.contains("Model {") ||
    source.contains("Model::")
  let has_message = source.contains("enum Msg") ||
    source.contains("type Msg") ||
    source.contains("Msg {")
  let has_update = source.contains("fn update") ||
    source.contains(".update(") ||
    source.contains("::update(")
  let has_view = source.contains("fn view") ||
    source.contains(".view(") ||
    source.contains("::view(")
  let has_subscription = source.contains("fn subscriptions") ||
    source.contains("@sub.") ||
    source.contains("subscribe(")
  let has_command = source.contains("type Cmd") ||
    source.contains("@rabbita.Cmd") ||
    source.contains("@cmd.") ||
    source.contains("invoke(")
  let strategy = if !has_rabbita_import ||
    !has_model ||
    !has_message ||
    !has_update {
    Unsupported
  } else if source.contains("document.") ||
    source.contains("window.") ||
    source.contains("pointer_capture") {
    BrowserReplay
  } else if has_subscription {
    SubscriptionModel
  } else if has_command {
    EffectModel
  } else if has_view &&
    (has_create_state || has_create_state_with_init || has_cell_with_dispatch) {
    Pure
  } else {
    Unsupported
  }
  {
    has_rabbita_import,
    has_create_state,
    has_create_state_with_init,
    has_cell_with_dispatch,
    has_model,
    has_message,
    has_update,
    has_view,
    has_subscription,
    has_command,
    strategy,
  }
}

///|
pub(all) enum EffectKind {
  HttpRequest
  TimerScheduled
  SubscriptionInstalled
  NativeInvoke
  WebSocketCommand
  DomCommand
} derive(Debug, Eq)

///|
pub fn EffectKind::to_string(self : EffectKind) -> String {
  match self {
    HttpRequest => "http-request"
    TimerScheduled => "timer-scheduled"
    SubscriptionInstalled => "subscription-installed"
    NativeInvoke => "native-invoke"
    WebSocketCommand => "websocket-command"
    DomCommand => "dom-command"
  }
}

///|
/// Deterministic replacement for an external side effect.
pub(all) struct EffectDescriptor {
  id : Int
  kind : EffectKind
  operation : String
  payload : String
} derive(Debug, Eq)

///|
pub fn effect_ids_unique(effects : Array[EffectDescriptor]) -> Bool {
  for index, effect in effects {
    for other_index = index + 1
        other_index < effects.length()
        other_index = other_index + 1 {
      if effects[other_index].id == effect.id {
        return false
      }
    }
  }
  true
}

///|
fn without_int_index(values : Array[Int], removed : Int) -> Array[Int] {
  let result : Array[Int] = []
  for index, value in values {
    if index != removed {
      result.push(value)
    }
  }
  result
}

///|
fn response_orders_loop(
  prefix : Array[Int],
  remaining : Array[Int],
  output : Array[Array[Int]],
) -> Unit {
  if remaining.is_empty() {
    output.push(prefix)
    return
  }
  for index, id in remaining {
    let next = prefix.copy()
    next.push(id)
    response_orders_loop(next, without_int_index(remaining, index), output)
  }
}

///|
/// Generate every response ordering for a bounded set of effects. The caller
/// must keep the input small; six effects already produce 720 orderings.
pub fn response_orders(effects : Array[EffectDescriptor]) -> Array[Array[Int]] {
  let ids : Array[Int] = []
  for effect in effects {
    ids.push(effect.id)
  }
  let output : Array[Array[Int]] = []
  response_orders_loop([], ids, output)
  output
}

///|
/// Reusable manifest-declared monotonic integer property.
pub fn[Model, Msg] monotonic_int_property(
  name : String,
  read : (Model) -> Int,
  applies : (Msg) -> Bool,
) -> @proped.Property[Model, Msg] {
  @proped.transition_property(name, fn(before, msg, after) {
    if applies(msg) && read(after) < read(before) {
      @proped.Fail(
        "declared monotonic value decreased from \{read(before)} to \{read(after)}",
      )
    } else {
      @proped.Pass
    }
  })
}

///|
/// Reusable pending-effect identity property.
pub fn[Model, Msg] unique_effect_ids_property(
  name : String,
  read : (Model) -> Array[EffectDescriptor],
) -> @proped.Property[Model, Msg] {
  @proped.state_property(name, fn(model, _) {
    if effect_ids_unique(read(model)) {
      @proped.Pass
    } else {
      @proped.Fail("pending effect IDs are not unique")
    }
  })
}

///|
pub fn proton_todo_manifest() -> ExternalManifest {
  {
    id: "proton-demo-todo",
    repository: "justjavac/proton-demo",
    revision: "5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d",
    license: "MIT",
    packages: ["frontend/main"],
    model_entry: "Model",
    message_entry: "Msg",
    update_entry: "update",
    view_entry: "view",
    strategy: SubscriptionModel,
    effect_policy: "record-and-inject",
    source_sha256: "69787a7a175b323ba0c6e01ea2acfc8692379ed938217bcf00c7d3a8c1f79c8b",
    properties: [
      "snapshot version never decreases", "pending effect IDs remain unique", "rendered revision matches snapshot",
    ],
    finding_visibility: @disclosure.PublicBug,
  }
}

///|
pub fn ensenzu_manifest() -> ExternalManifest {
  {
    id: "ensenzu-app",
    repository: "shiguri-01/ensenzu",
    revision: "f1fbec776a393e7023c8fa8324ea26c0774752e5",
    license: "Apache-2.0",
    packages: ["app/src"],
    model_entry: "Model",
    message_entry: "Msg",
    update_entry: "update",
    view_entry: "view",
    strategy: EffectModel,
    effect_policy: "record-download-command",
    source_sha256: "a580832dc58cd030ee22091abf58be8a1542c0696e57eae6f223d0e1c9bfd14b",
    properties: [
      "active numeric fields reject non-finite input", "pending input and error are mutually exclusive",
      "invalid input preserves previous result", "advanced toggle preserves calculation",
      "download effect IDs remain unique", "rendered status matches validation state",
    ],
    finding_visibility: @disclosure.PublicBug,
  }
}

///|
pub fn proton_todo_handoff() -> @disclosure.FindingHandoff {
  {
    id: "proton-demo-todo",
    repository: "justjavac/proton-demo",
    revision: "5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d",
    title: "Ignore stale Todo snapshots that would roll back the visible revision",
    summary: "The frontend accepts every SnapshotReceived value without correlating it to the request or rejecting an older revision.",
    impact: "A late response or subscription delivery can replace newer Todo state with older data, making the UI revision and rows move backward.",
    expected: "After revision 1 is visible, a later delivery of revision 0 is ignored or otherwise prevented from replacing the newer snapshot.",
    actual: "SnapshotReceived(version=0) replaces SnapshotReceived(version=1).",
    property: "snapshot version never decreases",
    minimal_trace: [
      "SnapshotReceived(version=1)", "SnapshotReceived(version=0)",
    ],
    action_ids: ["snapshot:1", "snapshot:0"],
    evidence: [
      "320 reachable states and 618 transitions explored deterministically.", "The failure shrinks to two response deliveries with zero runner diagnostics.",
    ],
    suggested_fix: [
      "Carry a request/generation identifier through snapshot deliveries, or reject snapshots older than the current revision.",
      "Keep the newest accepted snapshot when responses arrive out of order.",
    ],
    verification: [
      "Add a regression test that delivers revision 1 and then revision 0.", "Add a reverse-order response test for concurrent list/create/update operations.",
      "Confirm the rendered revision never decreases.",
    ],
    visibility: @disclosure.PublicBug,
  }
}

///|
pub fn ensenzu_handoff() -> @disclosure.FindingHandoff {
  {
    id: "ensenzu-app",
    repository: "shiguri-01/ensenzu",
    revision: "f1fbec776a393e7023c8fa8324ea26c0774752e5",
    title: "Reject non-finite numeric input in the interactive circle-diagram form",
    summary: "The frequency field accepts the JavaScript/MoonBit numeric literal Infinity because parsing succeeds and the validation checks only whether the value is positive.",
    impact: "The form can enter a state reported as valid even though a non-finite value cannot represent a usable physical parameter and may produce unstable downstream calculations.",
    expected: "Every active numeric field rejects NaN and positive or negative infinity before calculation and rendering.",
    actual: "Change(Frequency, \"Infinity\") results in pending_input=false and error=None.",
    property: "active numeric fields reject non-finite input",
    minimal_trace: ["Change(Frequency, \"Infinity\")"],
    action_ids: ["change:Frequency:8:Infinity"],
    evidence: [
      "All 19 field keys were explored with empty, partial, zero, negative, finite, NaN, and Infinity inputs.",
      "834 states and 1,900 transitions were explored with zero runner diagnostics.",
    ],
    suggested_fix: [
      "Reject non-finite Double values immediately after parsing.", "Use a shared finite-number guard for every interactive decimal field.",
    ],
    verification: [
      "Add table-driven tests for NaN, Infinity, and -Infinity across active numeric fields.",
      "Preserve the previous SVG and calculation result while reporting a validation error.",
      "Confirm ordinary finite values and partial input behavior remain unchanged.",
    ],
    visibility: @disclosure.PublicBug,
  }
}

///|
pub fn editor_file_tree_manifest() -> ExternalManifest {
  {
    id: "moonbit-editor-file-tree",
    repository: "moonbitlang/editor",
    revision: "001c9db52bcdc543c2bec8689b70e97941cecc18",
    license: "Apache-2.0",
    packages: ["internal/shell/widgets/file_tree", "internal/shell/workbench"],
    model_entry: "FileTreeModel",
    message_entry: "FileTreeMsg",
    update_entry: "FileTreeModel::update",
    view_entry: "FileTreeModel::view",
    strategy: EffectModel,
    effect_policy: "record-and-inject",
    source_sha256: "ebb0b018ae049c1f182c7c74d0361aaee0c439761d00a8ead5f20e94e1968547",
    properties: [
      "asynchronous resolve responses preserve newer tree intent", "pending resolve IDs remain unique",
      "outside targets terminate auto reveal", "open file selects the same URI",
      "late resolve does not re-expand a collapsed directory", "rendered tree status matches model",
    ],
    finding_visibility: @disclosure.PublicBug,
  }
}

///|
pub fn editor_file_tree_handoff() -> @disclosure.FindingHandoff {
  {
    id: "moonbit-editor-file-tree",
    repository: "moonbitlang/editor",
    revision: "001c9db52bcdc543c2bec8689b70e97941cecc18",
    title: "Keep a newer file-tree auto-reveal pending when an unrelated resolve fails",
    summary: "FileTreeMsg::DirectoryResolved carries a URI and result but no request or reveal generation. The error branch clears pending_reveal even when the failed directory belongs to an older unrelated request.",
    impact: "A late failure from a folder expansion can cancel auto-reveal for the currently active file. The editor keeps the new file selected, but its ancestor resolution stops before the file becomes visible in the tree.",
    expected: "A resolve failure clears or retries only the reveal operation associated with that request. An unrelated older failure leaves the newer pending reveal target intact.",
    actual: "A stale failure for readonly-remote://workspace/tests clears the pending reveal for readonly-remote://workspace/src/lib/util.mbt.",
    property: "asynchronous resolve responses preserve newer tree intent",
    minimal_trace: [
      "ToggleDirectory(\"readonly-remote://workspace/tests\")", "SetActive(\"readonly-remote://workspace/src/lib/util.mbt\")",
      "DirectoryResolveFailed(request=1, uri=\"readonly-remote://workspace/tests\")",
    ],
    action_ids: [
      "toggle:33:readonly-remote://workspace/tests", "set-active:44:readonly-remote://workspace/src/lib/util.mbt",
      "resolve-failure:1:33:readonly-remote://workspace/tests",
    ],
    evidence: [
      "The adapter preserves the private FileTreeModel update, reveal, toggle, and resolve semantics over two finite provider snapshots.",
      "The failure shrinks to three actions and uses two valid overlapping resolve operations.",
      "The deterministic run explores 1,600 states and 2,646 transitions, retaining two failures with zero runner diagnostics.",
      "A separate bounded test shows that an older root snapshot can also replace a newer accepted root because responses carry no generation.",
    ],
    suggested_fix: [
      "Carry a request or reveal generation through DirectoryResolved and ignore responses that do not match the current operation.",
      "On failure, clear pending_reveal only when the failed URI is the ancestor currently being resolved for that target.",
      "Apply the same generation check to root refresh responses so stale roots cannot replace a newer workspace snapshot.",
    ],
    verification: [
      "Start a resolve for tests, switch the active file to src/lib/util.mbt, and deliver the tests failure last.",
      "Confirm pending_reveal still points to src/lib/util.mbt and subsequent src/lib responses complete the reveal.",
      "Deliver two root refresh responses in reverse order and confirm the newest generation remains visible.",
      "Confirm a failure for the current reveal path still clears or exposes a retry state as designed.",
    ],
    visibility: @disclosure.PublicBug,
  }
}

///|
pub fn signal_reader_manifest() -> ExternalManifest {
  {
    id: "signal-reader",
    repository: "CAIMEOX/signal_reader",
    revision: "e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a",
    license: "MIT",
    packages: ["frontend"],
    model_entry: "Model",
    message_entry: "Msg",
    update_entry: "update",
    view_entry: "view",
    strategy: EffectModel,
    effect_policy: "record-and-inject",
    source_sha256: "df8dd9c5382d0acdcee335ec8cc3ba88b386b47c4ab15cd178a352e1812b617e",
    properties: [
      "feed responses match the current subscription", "search responses match the current query",
      "latest saved intent wins", "pending request IDs remain unique", "rendered selection and query match model",
    ],
    finding_visibility: @disclosure.PublicBug,
  }
}

///|
pub fn signal_reader_handoff() -> @disclosure.FindingHandoff {
  {
    id: "signal-reader",
    repository: "CAIMEOX/signal_reader",
    revision: "e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a",
    title: "Correlate asynchronous feed, search, and saved-state responses",
    summary: "The frontend response messages do not carry request or generation identity, so a late response can overwrite state created by a newer user action.",
    impact: "The visible feed can show another subscription's items, live-search results can move back to an older query, and a stale saved-state callback can reverse the user's latest intent.",
    expected: "Only the response associated with the latest relevant feed selection, search criteria, or saved-state intent updates the visible model.",
    actual: "Responses are applied by response type alone, even when the current selection, query, or saved intent has changed.",
    property: "feed responses match the current subscription",
    minimal_trace: [
      "SelectSubscription(2)", "SelectSubscription(1)", "ItemsLoaded(request=1, subscription=2)",
    ],
    action_ids: [
      "select-subscription:2", "select-subscription:1", "items-loaded:1:2",
    ],
    evidence: [
      "Saved-state race: ToggleItemSaved(1, true) -> ToggleItemSaved(1, false) -> ItemSavedSet(request=1, item=1, saved=true, success=true).",
      "Search race: OpenSearchModal -> UpdateSearchQuery(\"alpha\") -> UpdateSearchQuery(\"beta\") -> SearchLoaded(request=1, query=\"alpha\").",
      "All HTTP work is modeled as descriptors; no upstream service or network request is executed.",
      "No upstream source is copied because the pinned revision has no standalone LICENSE file; MIT is declared in moon.mod.json.",
    ],
    suggested_fix: [
      "Add a generation or request ID to ItemsLoaded and SearchLoaded, and ignore responses older than the latest request for that domain.",
      "Track the latest saved-state request per item and ignore stale success or rollback callbacks.",
      "Keep feed, search, and item mutation correlation independent so one domain cannot invalidate another.",
    ],
    verification: [
      "Select feed A, then feed B, then deliver A's response and confirm B remains visible.",
      "Issue searches for alpha and beta, deliver alpha last, and confirm beta results remain visible.",
      "Save then unsave an item, deliver the save callback last, and confirm the item remains unsaved.",
      "Repeat each case with success and failure responses in both delivery orders.",
    ],
    visibility: @disclosure.PublicBug,
  }
}
