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
    source.contains("type Model")
  let has_message = source.contains("enum Msg") || source.contains("type Msg")
  let has_update = source.contains("fn update") || source.contains(".update(")
  let has_view = source.contains("fn view") || source.contains(".view(")
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
  }
}
