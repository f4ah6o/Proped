///|
// Finite clean-room adapter for the supported members of the public Rabbita
// utility batch. Exact upstream source fixtures and licenses are preserved in
// `upstream/`; browser, HTTP, filesystem, and native execution are represented
// as explicit messages and pending descriptors.

///|
pub(all) struct PendingRevision {
  id : Int
  revision : Int
  payload : String
} derive(Debug, Eq)

///|
pub(all) struct SymwebState {
  draft : String
  draft_revision : Int
  computed_revision : Int
  dirty : Bool
  settings_open : Bool
  show_structural_form : Bool
} derive(Debug, Eq)

///|
pub(all) struct IssuesState {
  selected : Int
  graph_revision : Int
  accepted_request : Int
  next_request : Int
  pending : Array[PendingRevision]
  notice : String
} derive(Debug, Eq)

///|
pub(all) struct FullstackState {
  title : String
  warning : String?
  server_message : String?
  next_request : Int
  accepted_request : Int
  pending : Array[PendingRevision]
} derive(Debug, Eq)

///|
pub(all) struct ProtonState {
  generation : Int
  subscription_active : Bool
  delivered_events : Int
  next_invoke : Int
  pending_invokes : Array[Int]
} derive(Debug, Eq)

///|
pub(all) struct Model {
  symweb : SymwebState
  issues : IssuesState
  fullstack : FullstackState
  proton : ProtonState
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SymwebEdit(String)
  SymwebDebouncedRun(Int)
  SymwebOpenSettings
  SymwebCloseSettings
  SymwebToggleStructural
  IssuesSelect(Int)
  IssuesSave
  IssuesDeliver(Int)
  FullstackEdit(String)
  FullstackSubmit
  FullstackDeliver(Int)
  ProtonInvoke
  ProtonReply(Int)
  ProtonSubscribe
  ProtonUnsubscribe
  ProtonEvent(Int)
} derive(Debug, Eq)

///|
fn remove_pending_revision(
  pending : Array[PendingRevision],
  id : Int,
) -> (Array[PendingRevision], PendingRevision?) {
  let next : Array[PendingRevision] = []
  let mut found : PendingRevision? = None
  for item in pending {
    if item.id == id && found is None {
      found = Some(item)
    } else {
      next.push(item)
    }
  }
  (next, found)
}

///|
fn remove_pending_int(pending : Array[Int], id : Int) -> (Array[Int], Bool) {
  let next : Array[Int] = []
  let mut found = false
  for item in pending {
    if item == id && !found {
      found = true
    } else {
      next.push(item)
    }
  }
  (next, found)
}

///|
fn fullstack_warning(title : String) -> String? {
  if title.length() == 0 {
    Some("title cannot be empty")
  } else if title.length() > 24 {
    Some("title cannot exceed 24 characters")
  } else {
    None
  }
}

///|
pub fn initial() -> Model {
  {
    symweb: {
      draft: "x + 1",
      draft_revision: 0,
      computed_revision: 0,
      dirty: false,
      settings_open: false,
      show_structural_form: true,
    },
    issues: {
      selected: 1,
      graph_revision: 0,
      accepted_request: 0,
      next_request: 1,
      pending: [],
      notice: "",
    },
    fullstack: {
      title: "",
      warning: None,
      server_message: None,
      next_request: 1,
      accepted_request: 0,
      pending: [],
    },
    proton: {
      generation: 1,
      subscription_active: false,
      delivered_events: 0,
      next_invoke: 1,
      pending_invokes: [],
    },
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SymwebEdit(source) => {
      let revision = model.symweb.draft_revision + 1
      {
        ..model,
        symweb: {
          ..model.symweb,
          draft: source,
          draft_revision: revision,
          dirty: true,
        },
      }
    }
    SymwebDebouncedRun(revision) =>
      if revision == model.symweb.draft_revision && model.symweb.dirty {
        {
          ..model,
          symweb: { ..model.symweb, computed_revision: revision, dirty: false },
        }
      } else {
        model
      }
    SymwebOpenSettings =>
      { ..model, symweb: { ..model.symweb, settings_open: true } }
    SymwebCloseSettings =>
      { ..model, symweb: { ..model.symweb, settings_open: false } }
    SymwebToggleStructural =>
      {
        ..model,
        symweb: {
          ..model.symweb,
          show_structural_form: !model.symweb.show_structural_form,
        },
      }
    IssuesSelect(id) =>
      if id == 1 || id == 2 {
        { ..model, issues: { ..model.issues, selected: id, notice: "" } }
      } else {
        model
      }
    IssuesSave => {
      let pending = model.issues.pending.copy()
      let request = model.issues.next_request
      pending.push({
        id: request,
        revision: request,
        payload: "selected=\{model.issues.selected}",
      })
      {
        ..model,
        issues: {
          ..model.issues,
          next_request: request + 1,
          pending,
          notice: "Saving...",
        },
      }
    }
    IssuesDeliver(id) => {
      let (pending, response) = remove_pending_revision(
        model.issues.pending,
        id,
      )
      match response {
        Some(response) =>
          {
            // The pinned GraphSaved message carries only the returned graph, so
            // the application cannot correlate it with the request that created
            // the callback. Delivery is intentionally accepted unconditionally.
            ..model,
            issues: {
              ..model.issues,
              graph_revision: response.revision,
              accepted_request: response.id,
              pending,
              notice: "Saved.",
            },
          }
        None => model
      }
    }
    FullstackEdit(title) =>
      {
        ..model,
        fullstack: {
          ..model.fullstack,
          title,
          warning: fullstack_warning(title),
          server_message: None,
        },
      }
    FullstackSubmit =>
      match model.fullstack.warning {
        Some(message) =>
          {
            ..model,
            fullstack: {
              ..model.fullstack,
              server_message: Some("not sent: \{message}"),
            },
          }
        None => {
          let request = model.fullstack.next_request
          let pending = model.fullstack.pending.copy()
          pending.push({
            id: request,
            revision: request,
            payload: model.fullstack.title,
          })
          {
            ..model,
            fullstack: {
              ..model.fullstack,
              next_request: request + 1,
              pending,
              server_message: Some("sending json request..."),
            },
          }
        }
      }
    FullstackDeliver(id) => {
      let (pending, response) = remove_pending_revision(
        model.fullstack.pending,
        id,
      )
      match response {
        Some(response) =>
          {
            // ServerReplied contains no request generation or submitted title.
            ..model,
            fullstack: {
              ..model.fullstack,
              accepted_request: response.id,
              pending,
              server_message: Some("reply for \{response.payload}"),
            },
          }
        None => model
      }
    }
    ProtonInvoke => {
      let id = model.proton.next_invoke
      let pending = model.proton.pending_invokes.copy()
      pending.push(id)
      {
        ..model,
        proton: {
          ..model.proton,
          next_invoke: id + 1,
          pending_invokes: pending,
        },
      }
    }
    ProtonReply(id) => {
      let (pending, found) = remove_pending_int(
        model.proton.pending_invokes,
        id,
      )
      if found {
        { ..model, proton: { ..model.proton, pending_invokes: pending } }
      } else {
        model
      }
    }
    ProtonSubscribe => {
      let generation = model.proton.generation + 1
      {
        ..model,
        proton: { ..model.proton, generation, subscription_active: true },
      }
    }
    ProtonUnsubscribe => {
      let generation = model.proton.generation + 1
      {
        ..model,
        proton: { ..model.proton, generation, subscription_active: false },
      }
    }
    ProtonEvent(generation) =>
      if model.proton.subscription_active &&
        generation == model.proton.generation {
        {
          ..model,
          proton: {
            ..model.proton,
            delivered_events: model.proton.delivered_events + 1,
          },
        }
      } else {
        model
      }
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = [
    SymwebEdit("x"),
    SymwebEdit("x + 2"),
    SymwebDebouncedRun(model.symweb.draft_revision),
    SymwebOpenSettings,
    SymwebCloseSettings,
    SymwebToggleStructural,
    IssuesSelect(1),
    IssuesSelect(2),
    IssuesSave,
    FullstackEdit(""),
    FullstackEdit("valid"),
    FullstackEdit("edited"),
    FullstackSubmit,
    ProtonInvoke,
    ProtonSubscribe,
    ProtonUnsubscribe,
    ProtonEvent(model.proton.generation),
    ProtonEvent(model.proton.generation - 1),
  ]
  if model.symweb.draft_revision > 0 {
    result.push(SymwebDebouncedRun(model.symweb.draft_revision - 1))
  }
  for pending in model.issues.pending {
    result.push(IssuesDeliver(pending.id))
  }
  for pending in model.fullstack.pending {
    result.push(FullstackDeliver(pending.id))
  }
  for id in model.proton.pending_invokes {
    result.push(ProtonReply(id))
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SymwebEdit(source) if source != "" => [SymwebEdit("")]
    SymwebDebouncedRun(revision) if revision != 0 => [SymwebDebouncedRun(0)]
    IssuesSelect(id) if id != 1 => [IssuesSelect(1)]
    FullstackEdit(title) if title != "" => [FullstackEdit("")]
    ProtonEvent(generation) if generation != 0 => [ProtonEvent(0)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SymwebEdit(source) => "symweb-edit:\{source.length()}:\{source}"
    SymwebDebouncedRun(revision) => "symweb-debounce:\{revision}"
    SymwebOpenSettings => "symweb-open-settings"
    SymwebCloseSettings => "symweb-close-settings"
    SymwebToggleStructural => "symweb-toggle-structural"
    IssuesSelect(id) => "issues-select:\{id}"
    IssuesSave => "issues-save"
    IssuesDeliver(id) => "issues-deliver:\{id}"
    FullstackEdit(title) => "fullstack-edit:\{title.length()}:\{title}"
    FullstackSubmit => "fullstack-submit"
    FullstackDeliver(id) => "fullstack-deliver:\{id}"
    ProtonInvoke => "proton-invoke"
    ProtonReply(id) => "proton-reply:\{id}"
    ProtonSubscribe => "proton-subscribe"
    ProtonUnsubscribe => "proton-unsubscribe"
    ProtonEvent(generation) => "proton-event:\{generation}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SymwebEdit(source) => "SymwebEdit(\{source.escape(quote=true)})"
    SymwebDebouncedRun(revision) => "SymwebDebouncedRun(revision=\{revision})"
    SymwebOpenSettings => "SymwebOpenSettings"
    SymwebCloseSettings => "SymwebCloseSettings"
    SymwebToggleStructural => "SymwebToggleStructural"
    IssuesSelect(id) => "IssuesSelect(id=\{id})"
    IssuesSave => "IssuesSave"
    IssuesDeliver(id) => "IssuesDeliver(id=\{id})"
    FullstackEdit(title) => "FullstackEdit(\{title.escape(quote=true)})"
    FullstackSubmit => "FullstackSubmit"
    FullstackDeliver(id) => "FullstackDeliver(id=\{id})"
    ProtonInvoke => "ProtonInvoke"
    ProtonReply(id) => "ProtonReply(id=\{id})"
    ProtonSubscribe => "ProtonSubscribe"
    ProtonUnsubscribe => "ProtonUnsubscribe"
    ProtonEvent(generation) => "ProtonEvent(generation=\{generation})"
  }
}

///|
fn write_pending(
  output : StringBuilder,
  pending : Array[PendingRevision],
) -> Unit {
  for item in pending {
    output.write_object(item.id)
    output.write_char(':')
    output.write_object(item.revision)
    output.write_char(':')
    output.write_string(item.payload)
    output.write_char(';')
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("utility|symweb=")
  output.write_string(model.symweb.draft)
  output.write_char(':')
  output.write_object(model.symweb.draft_revision)
  output.write_char(':')
  output.write_object(model.symweb.computed_revision)
  output.write_char(':')
  output.write_object(model.symweb.dirty)
  output.write_char(':')
  output.write_object(model.symweb.settings_open)
  output.write_char(':')
  output.write_object(model.symweb.show_structural_form)
  output.write_string("|issues=")
  output.write_object(model.issues.selected)
  output.write_char(':')
  output.write_object(model.issues.graph_revision)
  output.write_char(':')
  output.write_object(model.issues.accepted_request)
  output.write_char(':')
  output.write_object(model.issues.next_request)
  output.write_char(':')
  output.write_string(model.issues.notice)
  output.write_char(':')
  write_pending(output, model.issues.pending)
  output.write_string("|fullstack=")
  output.write_string(model.fullstack.title)
  output.write_char(':')
  match model.fullstack.warning {
    Some(value) => output.write_string(value)
    None => output.write_string("none")
  }
  output.write_char(':')
  match model.fullstack.server_message {
    Some(value) => output.write_string(value)
    None => output.write_string("none")
  }
  output.write_char(':')
  output.write_object(model.fullstack.next_request)
  output.write_char(':')
  output.write_object(model.fullstack.accepted_request)
  output.write_char(':')
  write_pending(output, model.fullstack.pending)
  output.write_string("|proton=")
  output.write_object(model.proton.generation)
  output.write_char(':')
  output.write_object(model.proton.subscription_active)
  output.write_char(':')
  output.write_object(model.proton.delivered_events)
  output.write_char(':')
  output.write_object(model.proton.next_invoke)
  output.write_char(':')
  for id in model.proton.pending_invokes {
    output.write_object(id)
    output.write_char(';')
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Rabbita utility batch"),
      @html.div(
        class="symweb",
        "draft=\{model.symweb.draft};revision=\{model.symweb.draft_revision};computed=\{model.symweb.computed_revision};dirty=\{model.symweb.dirty}",
      ),
      @html.div(
        class="issues",
        "selected=\{model.issues.selected};graph-revision=\{model.issues.graph_revision};pending=\{model.issues.pending.length()}",
      ),
      @html.div(
        class="fullstack",
        "title=\{model.fullstack.title};pending=\{model.fullstack.pending.length()};accepted=\{model.fullstack.accepted_request}",
      ),
      @html.div(
        class="proton",
        "generation=\{model.proton.generation};active=\{model.proton.subscription_active};events=\{model.proton.delivered_events};pending=\{model.proton.pending_invokes.length()}",
      ),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/utility-apps.json", "external/manifests/rabbita-utility-batch.json",
    "src/vendor/rabbita_utility_batch/upstream/symweb/app.mbt.txt", "src/vendor/rabbita_utility_batch/upstream/issues/dashboard.mbt.txt",
    "src/vendor/rabbita_utility_batch/upstream/fullstack_trial/main.mbt.txt", "src/vendor/rabbita_utility_batch/upstream/proton/adapter.mbt.txt",
    "src/vendor/rabbita_utility_batch/rabbita_utility_batch.mbt",
  ]
}

///|
fn pending_revision_for(
  pending : Array[PendingRevision],
  id : Int,
) -> PendingRevision? {
  for item in pending {
    if item.id == id {
      return Some(item)
    }
  }
  None
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("symweb revisions remain internally consistent", fn(
      model,
      _,
    ) {
      if model.symweb.computed_revision <= model.symweb.draft_revision &&
        model.symweb.draft_revision >= 0 {
        @proped.Pass
      } else {
        @proped.Fail("Symweb computed a future or negative revision")
      }
    }),
    @proped.transition_property("Symweb stale debounce callbacks are ignored", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        SymwebDebouncedRun(revision) if revision != before.symweb.draft_revision &&
          after.symweb != before.symweb =>
          @proped.Fail("stale debounce callback changed Symweb state")
        _ => @proped.Pass
      }
    }),
    @proped.state_property("Issues Dashboard selection remains valid", fn(
      model,
      _,
    ) {
      if model.issues.selected == 1 || model.issues.selected == 2 {
        @proped.Pass
      } else {
        @proped.Fail("Issues Dashboard selected an unknown issue")
      }
    }),
    @proped.transition_property(
      "Issues Dashboard older save replies do not roll back graph revision",
      fn(before, msg, after) {
        match msg {
          IssuesDeliver(id) =>
            match pending_revision_for(before.issues.pending, id) {
              Some(response) if response.id < before.issues.accepted_request &&
                after.issues.graph_revision < before.issues.graph_revision =>
                @proped.Fail("older GraphSaved callback replaced a newer graph")
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property(
      "Fullstack local warning matches the current title",
      fn(model, _) {
        if model.fullstack.warning == fullstack_warning(model.fullstack.title) ||
          (model.fullstack.title == "" && model.fullstack.warning is None) {
          @proped.Pass
        } else {
          @proped.Fail("Fullstack title warning drifted from local validation")
        }
      },
    ),
    @proped.transition_property("Fullstack invalid titles are not submitted", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        FullstackSubmit if fullstack_warning(before.fullstack.title) is Some(_) &&
          after.fullstack.pending.length() > before.fullstack.pending.length() =>
          @proped.Fail("invalid title entered the HTTP request boundary")
        _ => @proped.Pass
      }
    }),
    @proped.transition_property(
      "Fullstack replies match the current submitted title",
      fn(before, msg, after) {
        match msg {
          FullstackDeliver(id) =>
            match pending_revision_for(before.fullstack.pending, id) {
              Some(response) if response.payload != before.fullstack.title &&
                after.fullstack.server_message ==
                Some("reply for \{response.payload}") =>
                @proped.Fail(
                  "late backend reply was displayed for an older title",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "Proton stale subscription events are ignored",
      fn(before, msg, after) {
        match msg {
          ProtonEvent(generation) if (
              !before.proton.subscription_active ||
              generation != before.proton.generation
            ) &&
            after.proton.delivered_events != before.proton.delivered_events =>
            @proped.Fail("stale Proton subscription event was delivered")
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("utility pending effect sets remain bounded", fn(
      model,
      _,
    ) {
      if model.issues.pending.length() <= 12 &&
        model.fullstack.pending.length() <= 12 &&
        model.proton.pending_invokes.length() <= 12 {
        @proped.Pass
      } else {
        @proped.Fail(
          "bounded utility action corpus accumulated too many effects",
        )
      }
    }),
    @proped.state_property(
      "rendered utility state matches every supported model",
      fn(model, html) {
        if !html.contains("revision=\{model.symweb.draft_revision}") {
          @proped.Fail("rendered Symweb revision does not match model")
        } else if !html.contains(
            "graph-revision=\{model.issues.graph_revision}",
          ) {
          @proped.Fail("rendered Issues revision does not match model")
        } else if !html.contains("title=\{model.fullstack.title}") {
          @proped.Fail("rendered Fullstack title does not match model")
        } else if !html.contains("generation=\{model.proton.generation}") {
          @proped.Fail("rendered Proton generation does not match model")
        } else {
          @proped.Pass
        }
      },
    ),
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
  {
    cases: 640,
    max_depth: 14,
    max_states: 1400,
    seed: 131,
    shrink_budget: 4096,
  }
}
