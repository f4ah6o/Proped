///|
// Finite adapter for official MoonBit Rabbita UIs.
// See UPSTREAM.md for pinned revisions and exact source fixtures.
pub(all) enum Surface {
  BuildQueue
  WebsiteHome
  Tutorial
} derive(Debug, Eq)

///|
pub fn Surface::to_string(self : Surface) -> String {
  match self {
    BuildQueue => "build-queue"
    WebsiteHome => "website-home"
    Tutorial => "tutorial"
  }
}

///|
pub(all) enum BuildState {
  Loading
  Failed
  Success(String)
} derive(Debug, Eq)

///|
pub(all) enum BuildFixture {
  Older
  Newer
} derive(Debug, Eq)

///|
pub fn BuildFixture::to_string(self : BuildFixture) -> String {
  match self {
    Older => "older"
    Newer => "newer"
  }
}

///|
pub(all) enum DecodeCorpus {
  MissingCollections
  InvalidQueuedItem
  InvalidRecentItem
} derive(Debug, Eq)

///|
pub fn DecodeCorpus::to_string(self : DecodeCorpus) -> String {
  match self {
    MissingCollections => "missing-collections"
    InvalidQueuedItem => "invalid-queued-item"
    InvalidRecentItem => "invalid-recent-item"
  }
}

///|
pub(all) enum RequestDomain {
  Builds
  SubmitTitle(String)
} derive(Debug, Eq)

///|
pub(all) struct PendingRequest {
  effect : @external.EffectDescriptor
  domain : RequestDomain
} derive(Debug, Eq)

///|
pub(all) struct Model {
  surface : Surface
  queue : BuildState
  recent : BuildState
  theme_dark : Bool
  hero_tab : Int
  carousel_index : Int
  tutorial_title : String
  tutorial_warning : String?
  tutorial_server_message : String?
  pending_requests : Array[PendingRequest]
  next_request_id : Int
  last_build_response_id : Int
  last_tutorial_response_id : Int
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  ShowSurface(Surface)
  ReloadBuilds
  BuildsLoaded(Int, BuildFixture)
  BuildsDecodeFailed(Int, DecodeCorpus)
  BuildsFailed(Int)
  ToggleTheme
  SelectHeroTab(Int)
  SelectCarousel(Int)
  EditTitle(String)
  SubmitTitle
  TutorialReply(Int, String, Bool)
  TutorialMalformedReply(Int, String)
} derive(Debug, Eq)

///|
fn record_request(model : Model, domain : RequestDomain) -> Model {
  let id = model.next_request_id
  let requests = model.pending_requests.copy()
  let (operation, payload) = match domain {
    Builds => ("fetch-builds", "/api/v0/builds")
    SubmitTitle(title) => ("submit-title", "title=\{title}")
  }
  requests.push({
    effect: { id, kind: @external.HttpRequest, operation, payload },
    domain,
  })
  { ..model, pending_requests: requests, next_request_id: id + 1 }
}

///|
pub fn initial() -> Model {
  record_request(
    {
      surface: BuildQueue,
      queue: Loading,
      recent: Loading,
      theme_dark: false,
      hero_tab: 0,
      carousel_index: 0,
      tutorial_title: "",
      tutorial_warning: Some("title is required"),
      tutorial_server_message: None,
      pending_requests: [],
      next_request_id: 1,
      last_build_response_id: 0,
      last_tutorial_response_id: 0,
    },
    Builds,
  )
}

///|
fn pending_without(model : Model, request_id : Int) -> Array[PendingRequest] {
  model.pending_requests.filter(request => request.effect.id != request_id)
}

///|
fn title_warning(title : String) -> String? {
  if title.trim().is_empty() {
    Some("title is required")
  } else {
    None
  }
}

///|
fn apply_build_failure(model : Model, request_id : Int) -> Model {
  {
    ..model,
    queue: Failed,
    recent: Failed,
    pending_requests: pending_without(model, request_id),
    last_build_response_id: request_id,
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    ShowSurface(surface) => { ..model, surface, }
    ReloadBuilds =>
      record_request({ ..model, queue: Loading, recent: Loading }, Builds)
    BuildsLoaded(request_id, fixture) => {
      let label = fixture.to_string()
      {
        ..model,
        queue: Success("queue-\{label}"),
        recent: Success("recent-\{label}"),
        pending_requests: pending_without(model, request_id),
        last_build_response_id: request_id,
      }
    }
    BuildsDecodeFailed(request_id, _) | BuildsFailed(request_id) =>
      apply_build_failure(model, request_id)
    ToggleTheme => { ..model, theme_dark: !model.theme_dark }
    SelectHeroTab(index) => { ..model, hero_tab: index }
    SelectCarousel(index) => { ..model, carousel_index: index }
    EditTitle(title) =>
      {
        ..model,
        tutorial_title: title,
        tutorial_warning: title_warning(title),
        tutorial_server_message: None,
      }
    SubmitTitle =>
      match model.tutorial_warning {
        Some(message) =>
          { ..model, tutorial_server_message: Some("not sent: \{message}") }
        None =>
          record_request(
            {
              ..model,
              tutorial_server_message: Some("sending json request..."),
            },
            SubmitTitle(model.tutorial_title),
          )
      }
    TutorialReply(request_id, title, success) => {
      let message = if success {
        "accepted: \{title}"
      } else {
        "request failed: \{title}"
      }
      {
        ..model,
        tutorial_server_message: Some(message),
        pending_requests: pending_without(model, request_id),
        last_tutorial_response_id: request_id,
      }
    }
    TutorialMalformedReply(request_id, _) =>
      {
        ..model,
        tutorial_server_message: Some("invalid backend response json"),
        pending_requests: pending_without(model, request_id),
        last_tutorial_response_id: request_id,
      }
  }
}

///|
fn build_requests(model : Model) -> Int {
  model.pending_requests.fold(init=0, fn(count, request) {
    match request.domain {
      Builds => count + 1
      _ => count
    }
  })
}

///|
fn tutorial_requests(model : Model) -> Int {
  model.pending_requests.fold(init=0, fn(count, request) {
    match request.domain {
      SubmitTitle(_) => count + 1
      _ => count
    }
  })
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = [ToggleTheme]
  if model.surface != BuildQueue {
    actions.push(ShowSurface(BuildQueue))
  }
  if model.surface != WebsiteHome {
    actions.push(ShowSurface(WebsiteHome))
  }
  if model.surface != Tutorial {
    actions.push(ShowSurface(Tutorial))
  }
  if build_requests(model) < 2 {
    actions.push(ReloadBuilds)
  }
  for request in model.pending_requests {
    match request.domain {
      Builds => {
        actions.push(BuildsLoaded(request.effect.id, Older))
        actions.push(BuildsLoaded(request.effect.id, Newer))
        actions.push(BuildsDecodeFailed(request.effect.id, MissingCollections))
        actions.push(BuildsDecodeFailed(request.effect.id, InvalidQueuedItem))
        actions.push(BuildsDecodeFailed(request.effect.id, InvalidRecentItem))
        actions.push(BuildsFailed(request.effect.id))
      }
      SubmitTitle(title) => {
        actions.push(TutorialReply(request.effect.id, title, true))
        actions.push(TutorialReply(request.effect.id, title, false))
        actions.push(TutorialMalformedReply(request.effect.id, title))
      }
    }
  }
  if model.surface == WebsiteHome {
    if model.hero_tab != 0 {
      actions.push(SelectHeroTab(0))
    }
    if model.hero_tab != 3 {
      actions.push(SelectHeroTab(3))
    }
    if model.carousel_index != 0 {
      actions.push(SelectCarousel(0))
    }
    if model.carousel_index != 1 {
      actions.push(SelectCarousel(1))
    }
  }
  if model.surface == Tutorial {
    if model.tutorial_title != "alpha" {
      actions.push(EditTitle("alpha"))
    }
    if model.tutorial_title != "beta" {
      actions.push(EditTitle("beta"))
    }
    if model.tutorial_warning is None && tutorial_requests(model) < 2 {
      actions.push(SubmitTitle)
    }
  }
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    ShowSurface(surface) if surface != BuildQueue => [ShowSurface(BuildQueue)]
    BuildsLoaded(request_id, Newer) => [BuildsLoaded(request_id, Older)]
    BuildsDecodeFailed(request_id, corpus) if corpus != MissingCollections =>
      [BuildsDecodeFailed(request_id, MissingCollections)]
    SelectHeroTab(index) if index != 0 => [SelectHeroTab(0)]
    SelectCarousel(index) if index != 0 => [SelectCarousel(0)]
    EditTitle(title) if title != "alpha" => [EditTitle("alpha")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    ShowSurface(surface) => "surface:\{surface.to_string()}"
    ReloadBuilds => "reload-builds"
    BuildsLoaded(request_id, fixture) =>
      "builds-loaded:\{request_id}:\{fixture.to_string()}"
    BuildsDecodeFailed(request_id, corpus) =>
      "builds-decode-failed:\{request_id}:\{corpus.to_string()}"
    BuildsFailed(request_id) => "builds-failed:\{request_id}"
    ToggleTheme => "toggle-theme"
    SelectHeroTab(index) => "select-hero-tab:\{index}"
    SelectCarousel(index) => "select-carousel:\{index}"
    EditTitle(title) => "edit-title:\{title.length()}:\{title}"
    SubmitTitle => "submit-title"
    TutorialReply(request_id, title, success) =>
      "tutorial-reply:\{request_id}:\{title.length()}:\{title}:\{success}"
    TutorialMalformedReply(request_id, title) =>
      "tutorial-malformed:\{request_id}:\{title.length()}:\{title}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    ShowSurface(surface) => "ShowSurface(\{surface.to_string()})"
    ReloadBuilds => "ReloadBuilds"
    BuildsLoaded(request_id, fixture) =>
      "BuildsLoaded(request=\{request_id}, fixture=\{fixture.to_string()})"
    BuildsDecodeFailed(request_id, corpus) =>
      "BuildsDecodeFailed(request=\{request_id}, corpus=\{corpus.to_string()})"
    BuildsFailed(request_id) => "BuildsFailed(request=\{request_id})"
    ToggleTheme => "ToggleTheme"
    SelectHeroTab(index) => "SelectHeroTab(\{index})"
    SelectCarousel(index) => "SelectCarousel(\{index})"
    EditTitle(title) => "EditTitle(\{title.escape(quote=true)})"
    SubmitTitle => "SubmitTitle"
    TutorialReply(request_id, title, success) =>
      "TutorialReply(request=\{request_id}, title=\{title.escape(quote=true)}, success=\{success})"
    TutorialMalformedReply(request_id, title) =>
      "TutorialMalformedReply(request=\{request_id}, title=\{title.escape(quote=true)})"
  }
}

///|
fn write_build_state(output : StringBuilder, state : BuildState) -> Unit {
  match state {
    Loading => output.write_string("loading")
    Failed => output.write_string("failed")
    Success(value) => {
      output.write_string("success:")
      output.write_string(value)
    }
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("mooncakes-official-ui|surface=")
  output.write_string(model.surface.to_string())
  output.write_string("|queue=")
  write_build_state(output, model.queue)
  output.write_string("|recent=")
  write_build_state(output, model.recent)
  output.write_string("|theme=")
  output.write_object(model.theme_dark)
  output.write_string("|hero=")
  output.write_object(model.hero_tab)
  output.write_string("|carousel=")
  output.write_object(model.carousel_index)
  output.write_string("|title=")
  output.write_string(model.tutorial_title)
  output.write_string("|warning=")
  output.write_string(model.tutorial_warning.unwrap_or("none"))
  output.write_string("|server=")
  output.write_string(model.tutorial_server_message.unwrap_or("none"))
  output.write_string("|last-build=")
  output.write_object(model.last_build_response_id)
  output.write_string("|last-tutorial=")
  output.write_object(model.last_tutorial_response_id)
  output.write_string("|next=")
  output.write_object(model.next_request_id)
  for request in model.pending_requests {
    output.write_string("|request=")
    output.write_object(request.effect.id)
    output.write_char(':')
    match request.domain {
      Builds => output.write_string("builds")
      SubmitTitle(title) => {
        output.write_string("title:")
        output.write_string(title)
      }
    }
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let queue = match model.queue {
    Loading => "loading"
    Failed => "failed"
    Success(value) => value
  }
  let recent = match model.recent {
    Loading => "loading"
    Failed => "failed"
    Success(value) => value
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Official Rabbita UI suite"),
      @html.div(class="surface", "surface=\{model.surface.to_string()}"),
      @html.div(class="queue", "queue=\{queue}"),
      @html.div(class="recent", "recent=\{recent}"),
      @html.div(class="hero", "hero-tab=\{model.hero_tab}"),
      @html.div(class="carousel", "carousel=\{model.carousel_index}"),
      @html.div(class="tutorial-title", "title=\{model.tutorial_title}"),
      @html.div(
        class="tutorial-server",
        "server=\{model.tutorial_server_message.unwrap_or("none")}",
      ),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/mooncakes-official-ui.json", "src/vendor/mooncakes_official_ui/upstream/build_queue_state.mbt.txt",
    "src/vendor/mooncakes_official_ui/upstream/build_queue_view.mbt.txt", "src/vendor/mooncakes_official_ui/upstream/website_home_main.mbt.txt",
    "src/vendor/mooncakes_official_ui/upstream/tutorial_frontend_main.mbt.txt", "src/vendor/mooncakes_official_ui/mooncakes_official_ui.mbt",
  ]
}

///|
fn pending_effects(model : Model) -> Array[@external.EffectDescriptor] {
  model.pending_requests.map(request => request.effect)
}

///|
fn build_states_aligned(model : Model) -> Bool {
  match (model.queue, model.recent) {
    (Loading, Loading) | (Failed, Failed) | (Success(_), Success(_)) => true
    _ => false
  }
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "older build responses do not replace newer Build Queue results",
      fn(before, msg, after) {
        let response_id = match msg {
          BuildsLoaded(request_id, _)
          | BuildsDecodeFailed(request_id, _)
          | BuildsFailed(request_id) => Some(request_id)
          _ => None
        }
        match response_id {
          Some(request_id) if request_id < before.last_build_response_id &&
            after.last_build_response_id == request_id =>
            @proped.Fail(
              "older build request \{request_id} replaced accepted request \{before.last_build_response_id}",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "tutorial replies match the current edited title",
      fn(before, msg, after) {
        match msg {
          TutorialReply(_, response_title, _) =>
            if response_title != before.tutorial_title &&
              after.tutorial_server_message is Some(_) {
              @proped.Fail(
                "reply for \{response_title} replaced the response state for \{before.tutorial_title}",
              )
            } else {
              @proped.Pass
            }
          TutorialMalformedReply(_, response_title) =>
            if response_title != before.tutorial_title &&
              after.tutorial_server_message is Some(_) {
              @proped.Fail(
                "malformed reply for \{response_title} replaced the response state for \{before.tutorial_title}",
              )
            } else {
              @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property(
      "Build Queue queue and recent statuses remain aligned",
      fn(model, _) {
        if build_states_aligned(model) {
          @proped.Pass
        } else {
          @proped.Fail("queue and recent are in different load states")
        }
      },
    ),
    @proped.state_property("official website indices remain in range", fn(
      model,
      _,
    ) {
      if model.hero_tab < 0 || model.hero_tab >= 4 {
        @proped.Fail(
          "website hero tab is outside the four-entry source fixture",
        )
      } else if model.carousel_index < 0 || model.carousel_index >= 2 {
        @proped.Fail("website carousel index is outside the bounded fixture")
      } else {
        @proped.Pass
      }
    }),
    @external.unique_effect_ids_property(
      "pending request IDs remain unique", pending_effects,
    ),
    @proped.state_property("rendered official UI state matches model", fn(
      model,
      html,
    ) {
      if !html.contains("surface=\{model.surface.to_string()}") {
        @proped.Fail("rendered surface does not match model")
      } else if !html.contains("hero-tab=\{model.hero_tab}") {
        @proped.Fail("rendered hero tab does not match model")
      } else if !html.contains("title=\{model.tutorial_title}") {
        @proped.Fail("rendered tutorial title does not match model")
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
  { cases: 512, max_depth: 10, max_states: 960, seed: 107, shrink_budget: 4096 }
}
