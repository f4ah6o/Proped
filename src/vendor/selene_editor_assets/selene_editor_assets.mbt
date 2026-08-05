///|
// Finite adapter for Selene Editor asset, preview-selection, and initialization
// boundaries. See UPSTREAM.md for the pinned source and modeling limits.
pub(all) enum AssetFixture {
  Older
  Newer
  Empty
} derive(Debug, Eq)

///|
pub fn AssetFixture::to_string(self : AssetFixture) -> String {
  match self {
    Older => "older"
    Newer => "newer"
    Empty => "empty"
  }
}

///|
pub(all) enum RequestDomain {
  Assets
  ProjectCurrent
} derive(Debug, Eq)

///|
fn RequestDomain::to_string(self : RequestDomain) -> String {
  match self {
    Assets => "assets"
    ProjectCurrent => "project-current"
  }
}

///|
pub(all) struct PendingRequest {
  effect : @external.EffectDescriptor
  domain : RequestDomain
} derive(Debug, Eq)

///|
pub(all) struct Model {
  assets : Array[String]
  selected_resource : String?
  scene_entities : Array[String]
  selected_entity_id : String?
  selected_entity_ids : Array[String]
  asset_panel_open : Bool
  initialized_count : Int
  subscriptions : Array[@external.EffectDescriptor]
  pending_requests : Array[PendingRequest]
  next_effect_id : Int
  last_asset_response_id : Int
  status : String
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  Initialize
  AssetFileChanged
  AssetsLoaded(Int, AssetFixture)
  AssetsFailed(Int)
  SelectResource(String?)
  SelectEntity(String?)
  PreviewSelectionChanged(String?, Array[String])
  DeleteSelected
  SetAssetPanelOpen(Bool)
} derive(Debug, Eq)

///|
fn fixture_assets(fixture : AssetFixture) -> Array[String] {
  match fixture {
    Older => ["assets/hero.png", "assets/legacy.png"]
    Newer => ["assets/hero-v2.png", "assets/new.png"]
    Empty => []
  }
}

///|
fn contains(values : Array[String], expected : String) -> Bool {
  values.any(value => value == expected)
}

///|
fn dedup_existing(
  entities : Array[String],
  ids : Array[String],
) -> Array[String] {
  let output : Array[String] = []
  for id in ids {
    if contains(entities, id) && !contains(output, id) {
      output.push(id)
    }
  }
  output
}

///|
fn normalize_entity_selection(
  model : Model,
  primary : String?,
  ids : Array[String],
) -> (String?, Array[String]) {
  let existing = dedup_existing(model.scene_entities, ids)
  let normalized_primary = match primary {
    Some(id) if contains(model.scene_entities, id) => Some(id)
    _ => if existing.is_empty() { None } else { Some(existing[0]) }
  }
  let normalized_ids = match normalized_primary {
    Some(id) => if contains(existing, id) { existing } else { [id] + existing }
    None => existing
  }
  (normalized_primary, normalized_ids)
}

///|
fn with_entity_selection(
  model : Model,
  primary : String?,
  ids : Array[String],
) -> Model {
  let (selected_entity_id, selected_entity_ids) = normalize_entity_selection(
    model, primary, ids,
  )
  { ..model, selected_entity_id, selected_entity_ids }
}

///|
fn pending_without(model : Model, request_id : Int) -> Array[PendingRequest] {
  model.pending_requests.filter(request => request.effect.id != request_id)
}

///|
fn record_asset_request(model : Model, operation : String) -> Model {
  let id = model.next_effect_id
  let pending = model.pending_requests.copy()
  pending.push({
    effect: {
      id,
      kind: @external.HttpRequest,
      operation,
      payload: "assets.list",
    },
    domain: Assets,
  })
  { ..model, pending_requests: pending, next_effect_id: id + 1 }
}

///|
fn record_project_current_request(model : Model) -> Model {
  let id = model.next_effect_id
  let pending = model.pending_requests.copy()
  pending.push({
    effect: {
      id,
      kind: @external.HttpRequest,
      operation: "project-current",
      payload: "project.current",
    },
    domain: ProjectCurrent,
  })
  { ..model, pending_requests: pending, next_effect_id: id + 1 }
}

///|
fn install_subscription(
  effects : Array[@external.EffectDescriptor],
  next_id : Int,
  operation : String,
) -> Int {
  effects.push({
    id: next_id,
    kind: @external.SubscriptionInstalled,
    operation,
    payload: "selene-editor",
  })
  next_id + 1
}

///|
pub fn initial() -> Model {
  record_asset_request(
    {
      assets: ["assets/hero.png"],
      selected_resource: Some("assets/hero.png"),
      scene_entities: ["entity-1", "entity-2"],
      selected_entity_id: Some("entity-1"),
      selected_entity_ids: ["entity-1"],
      asset_panel_open: true,
      initialized_count: 0,
      subscriptions: [],
      pending_requests: [],
      next_effect_id: 1,
      last_asset_response_id: 0,
      status: "Project loaded",
    },
    "initial-assets-list",
  )
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Initialize => {
      let subscriptions = model.subscriptions.copy()
      let mut next_id = model.next_effect_id
      next_id = install_subscription(subscriptions, next_id, "service-events")
      next_id = install_subscription(subscriptions, next_id, "preview-events")
      next_id = install_subscription(
        subscriptions, next_id, "keyboard-shortcuts",
      )
      next_id = install_subscription(subscriptions, next_id, "sidebar-layout")
      record_project_current_request({
        ..model,
        initialized_count: model.initialized_count + 1,
        subscriptions,
        next_effect_id: next_id,
        status: "Initialized",
      })
    }
    AssetFileChanged =>
      record_asset_request(
        { ..model, status: "Asset file changed" },
        "assets-list",
      )
    AssetsLoaded(request_id, fixture) => {
      let assets = fixture_assets(fixture)
      let selected_resource = match model.selected_resource {
        Some(path) if contains(assets, path) => Some(path)
        _ => None
      }
      {
        ..model,
        assets,
        selected_resource,
        pending_requests: pending_without(model, request_id),
        last_asset_response_id: request_id,
        status: "Assets loaded: \{fixture.to_string()}",
      }
    }
    AssetsFailed(request_id) =>
      {
        ..model,
        pending_requests: pending_without(model, request_id),
        last_asset_response_id: request_id,
        status: "Assets load failed",
      }
    SelectResource(resource) => {
      let selected_resource = match resource {
        Some(path) if contains(model.assets, path) => Some(path)
        _ => None
      }
      {
        ..with_entity_selection(model, None, []),
        selected_resource,
        status: match selected_resource {
          Some(path) => "Selected resource: \{path}"
          None => "Selection cleared"
        },
      }
    }
    SelectEntity(id) => {
      let selected = match id {
        Some(entity_id) =>
          with_entity_selection(model, Some(entity_id), [entity_id])
        None => with_entity_selection(model, None, [])
      }
      {
        ..selected,
        selected_resource: if selected.selected_entity_id is Some(_) {
          None
        } else {
          model.selected_resource
        },
        status: "Entity selection changed",
      }
    }
    PreviewSelectionChanged(primary, ids) => {
      let selected = with_entity_selection(model, primary, ids)
      {
        ..selected,
        selected_resource: if selected.selected_entity_id is Some(_) {
          None
        } else {
          model.selected_resource
        },
        status: "Preview selection changed",
      }
    }
    DeleteSelected => {
      let remaining = model.scene_entities.filter(entity => {
        !contains(model.selected_entity_ids, entity)
      })
      {
        ..model,
        scene_entities: remaining,
        selected_entity_id: None,
        selected_entity_ids: [],
        status: "Deleted selected entities",
      }
    }
    SetAssetPanelOpen(open) =>
      {
        ..model,
        asset_panel_open: open,
        status: if open {
          "Assets open"
        } else {
          "Assets closed"
        },
      }
  }
}

///|
fn asset_request_count(model : Model) -> Int {
  model.pending_requests.fold(init=0, fn(count, request) {
    if request.domain == Assets {
      count + 1
    } else {
      count
    }
  })
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = []
  if model.initialized_count < 2 {
    actions.push(Initialize)
  }
  if asset_request_count(model) < 2 {
    actions.push(AssetFileChanged)
  }
  for request in model.pending_requests {
    match request.domain {
      Assets => {
        actions.push(AssetsLoaded(request.effect.id, Older))
        actions.push(AssetsLoaded(request.effect.id, Newer))
        actions.push(AssetsLoaded(request.effect.id, Empty))
        actions.push(AssetsFailed(request.effect.id))
      }
      ProjectCurrent => ()
    }
  }
  actions.push(SetAssetPanelOpen(!model.asset_panel_open))
  actions.push(SelectResource(None))
  for asset in model.assets {
    actions.push(SelectResource(Some(asset)))
  }
  actions.push(SelectEntity(None))
  for entity in model.scene_entities {
    actions.push(SelectEntity(Some(entity)))
    actions.push(PreviewSelectionChanged(Some(entity), [entity]))
  }
  actions.push(
    PreviewSelectionChanged(Some("missing-entity"), ["missing-entity"]),
  )
  if !model.selected_entity_ids.is_empty() {
    actions.push(DeleteSelected)
  }
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    AssetsLoaded(request_id, fixture) if fixture != Older =>
      [AssetsLoaded(request_id, Older)]
    SelectResource(Some(_)) => [SelectResource(None)]
    SelectEntity(Some(_)) => [SelectEntity(None)]
    PreviewSelectionChanged(Some(_), _) => [PreviewSelectionChanged(None, [])]
    SetAssetPanelOpen(true) => [SetAssetPanelOpen(false)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Initialize => "initialize"
    AssetFileChanged => "asset-file-changed"
    AssetsLoaded(request_id, fixture) =>
      "assets-loaded:\{request_id}:\{fixture.to_string()}"
    AssetsFailed(request_id) => "assets-failed:\{request_id}"
    SelectResource(resource) => "select-resource:\{resource.unwrap_or("none")}"
    SelectEntity(id) => "select-entity:\{id.unwrap_or("none")}"
    PreviewSelectionChanged(primary, ids) =>
      "preview-selection:\{primary.unwrap_or("none")}:\{ids.join(",")}"
    DeleteSelected => "delete-selected"
    SetAssetPanelOpen(open) => "asset-panel:\{open}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Initialize => "Initialize"
    AssetFileChanged => "AssetFileChanged"
    AssetsLoaded(request_id, fixture) =>
      "AssetsLoaded(request=\{request_id}, fixture=\{fixture.to_string()})"
    AssetsFailed(request_id) => "AssetsFailed(request=\{request_id})"
    SelectResource(resource) =>
      "SelectResource(\{resource.unwrap_or("none").escape(quote=true)})"
    SelectEntity(id) =>
      "SelectEntity(\{id.unwrap_or("none").escape(quote=true)})"
    PreviewSelectionChanged(primary, ids) =>
      "PreviewSelectionChanged(primary=\{primary.unwrap_or("none").escape(quote=true)}, ids=\{ids.join(",")})"
    DeleteSelected => "DeleteSelected"
    SetAssetPanelOpen(open) => "SetAssetPanelOpen(\{open})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("selene-editor-assets|assets=")
  output.write_string(model.assets.join(","))
  output.write_string("|resource=")
  output.write_string(model.selected_resource.unwrap_or("none"))
  output.write_string("|entities=")
  output.write_string(model.scene_entities.join(","))
  output.write_string("|entity=")
  output.write_string(model.selected_entity_id.unwrap_or("none"))
  output.write_string("|entity-ids=")
  output.write_string(model.selected_entity_ids.join(","))
  output.write_string("|panel=")
  output.write_object(model.asset_panel_open)
  output.write_string("|init=")
  output.write_object(model.initialized_count)
  output.write_string("|status=")
  output.write_string(model.status)
  output.write_string("|last-assets=")
  output.write_object(model.last_asset_response_id)
  output.write_string("|next=")
  output.write_object(model.next_effect_id)
  for request in model.pending_requests {
    output.write_string("|request=")
    output.write_object(request.effect.id)
    output.write_char(':')
    output.write_string(request.domain.to_string())
  }
  for subscription in model.subscriptions {
    output.write_string("|subscription=")
    output.write_object(subscription.id)
    output.write_char(':')
    output.write_string(subscription.operation)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Selene Editor asset panel"),
      @html.div(class="asset-panel", "open=\{model.asset_panel_open}"),
      @html.div(class="assets", "assets=\{model.assets.join(",")}"),
      @html.div(
        class="selected-resource",
        "resource=\{model.selected_resource.unwrap_or("none")}",
      ),
      @html.div(class="entities", "entities=\{model.scene_entities.join(",")}"),
      @html.div(
        class="selected-entity",
        "entity=\{model.selected_entity_id.unwrap_or("none")}",
      ),
      @html.div(class="status", "status=\{model.status}"),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/selene-editor-assets.json", "src/vendor/selene_editor_assets/upstream/app_top.mbt.txt",
    "src/vendor/selene_editor_assets/upstream/update_main.mbt.txt", "src/vendor/selene_editor_assets/upstream/update_project_runtime.mbt.txt",
    "src/vendor/selene_editor_assets/upstream/update_project_runtime_handlers.mbt.txt",
    "src/vendor/selene_editor_assets/upstream/update_selection_history_tools.mbt.txt",
    "src/vendor/selene_editor_assets/upstream/selection_component_helpers.mbt.txt",
    "src/vendor/selene_editor_assets/upstream/view_asset_panel.mbt.txt", "src/vendor/selene_editor_assets/upstream/view_shell.mbt.txt",
    "src/vendor/selene_editor_assets/selene_editor_assets.mbt",
  ]
}

///|
fn all_effects(model : Model) -> Array[@external.EffectDescriptor] {
  let effects = model.subscriptions.copy()
  for request in model.pending_requests {
    effects.push(request.effect)
  }
  effects
}

///|
fn subscriptions_unique_by_operation(model : Model) -> Bool {
  for index, subscription in model.subscriptions {
    for other_index = index + 1
        other_index < model.subscriptions.length()
        other_index = other_index + 1 {
      if model.subscriptions[other_index].operation == subscription.operation {
        return false
      }
    }
  }
  true
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "older asset responses do not replace newer asset lists",
      fn(before, msg, after) {
        let response_id = match msg {
          AssetsLoaded(request_id, _) | AssetsFailed(request_id) =>
            Some(request_id)
          _ => None
        }
        match response_id {
          Some(request_id) if request_id < before.last_asset_response_id &&
            after.last_asset_response_id == request_id &&
            after.assets != before.assets =>
            @proped.Fail(
              "older asset request \{request_id} replaced accepted request \{before.last_asset_response_id}",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("initialization installs each subscription once", fn(
      model,
      _,
    ) {
      if subscriptions_unique_by_operation(model) {
        @proped.Pass
      } else {
        @proped.Fail("Initialize installed duplicate editor subscriptions")
      }
    }),
    @proped.state_property("selected resources reference existing assets", fn(
      model,
      _,
    ) {
      match model.selected_resource {
        Some(path) if !contains(model.assets, path) =>
          @proped.Fail("selected resource no longer exists")
        _ => @proped.Pass
      }
    }),
    @proped.state_property(
      "selected entities reference existing scene entities",
      fn(model, _) {
        match model.selected_entity_id {
          Some(id) if !contains(model.scene_entities, id) =>
            @proped.Fail("primary selected entity no longer exists")
          _ => {
            for id in model.selected_entity_ids {
              if !contains(model.scene_entities, id) {
                return @proped.Fail(
                  "selected entity set contains a missing entity",
                )
              }
            }
            @proped.Pass
          }
        }
      },
    ),
    @proped.transition_property("preview selections ignore missing entities", fn(
      _,
      msg,
      after,
    ) {
      match msg {
        PreviewSelectionChanged(Some(id), _) if !contains(
            after.scene_entities,
            id,
          ) &&
          after.selected_entity_id == Some(id) =>
          @proped.Fail("preview selected a missing entity")
        _ => @proped.Pass
      }
    }),
    @external.unique_effect_ids_property(
      "pending effect IDs remain unique", all_effects,
    ),
    @proped.state_property("rendered asset panel matches model", fn(
      model,
      html,
    ) {
      if !html.contains("open=\{model.asset_panel_open}") {
        @proped.Fail("rendered panel visibility does not match model")
      } else if !html.contains(
          "resource=\{model.selected_resource.unwrap_or("none")}",
        ) {
        @proped.Fail("rendered resource selection does not match model")
      } else if !html.contains(
          "entity=\{model.selected_entity_id.unwrap_or("none")}",
        ) {
        @proped.Fail("rendered entity selection does not match model")
      } else {
        @proped.Pass
      }
    }),
  ]
}

///|
pub fn machine() -> @proped.Machine[Model, Msg] {
  @proped.rabbita_machine_with_action_id(
    initial(),
    update,
    actions,
    shrink,
    view,
    fingerprint,
    action_id,
    describe,
    dependencies,
  )
}

///|
pub fn default_config() -> @proped.RunConfig {
  { cases: 512, max_depth: 9, max_states: 920, seed: 131, shrink_budget: 4096 }
}
