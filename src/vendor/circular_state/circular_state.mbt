///|
// Clean-room finite adapter for CAIMEOX/circular at revision
// bf8549a9c13505f3dc5632347acfffbba864c406.
//
// No upstream source is copied. See UPSTREAM.md for behavioral provenance.
pub(all) struct Task {
  id : String
  title : String
} derive(Debug, Eq)

///|
pub(all) struct WorkspaceSnapshot {
  revision : Int
  tasks : Array[Task]
} derive(Debug, Eq)

///|
pub(all) enum ActiveModal {
  NoModal
  TaskModal
  TaskCompleteModal
  ComposerModal
  FocusModal
} derive(Debug, Eq)

///|
pub(all) enum MutationKind {
  TaskQuickMutation
  TaskDetailsMutation
  CompleteMutation
  ComposerMutation
} derive(Debug, Eq)

///|
pub(all) struct Model {
  workspace_revision : Int
  tasks : Array[Task]
  selection_task_id : String?
  task_menu_task_id : String?
  modal : ActiveModal
  route : String
  composer_title : String
  evidence_text : String
  pending_effects : Array[@external.EffectDescriptor]
  next_effect_id : Int
  error : String?
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  NoOp
  SelectTask(String)
  OpenTaskCompletion(String)
  ToggleTaskMenu(String)
  CloseModal
  EscapePressed
  RouteChanged(String)
  DraftChanged(String)
  RequestTaskState(String, String)
  WorkspaceMutated(MutationKind, WorkspaceSnapshot)
  WorkspaceMutationFailed(MutationKind, String)
} derive(Debug, Eq)

///|
fn seed_tasks() -> Array[Task] {
  [
    { id: "TSK-1", title: "Read paper" },
    { id: "TSK-2", title: "Write summary" },
  ]
}

///|
pub fn initial() -> Model {
  {
    workspace_revision: 0,
    tasks: seed_tasks(),
    selection_task_id: None,
    task_menu_task_id: None,
    modal: NoModal,
    route: "home",
    composer_title: "",
    evidence_text: "",
    pending_effects: [],
    next_effect_id: 1,
    error: None,
  }
}

///|
fn task_exists(tasks : Array[Task], id : String) -> Bool {
  tasks.any(task => task.id == id)
}

///|
fn keep_task(current : String?, tasks : Array[Task]) -> String? {
  match current {
    Some(id) if task_exists(tasks, id) => Some(id)
    _ => None
  }
}

///|
fn close_modal(model : Model) -> Model {
  {
    ..model,
    selection_task_id: None,
    task_menu_task_id: None,
    modal: NoModal,
    composer_title: "",
    evidence_text: "",
  }
}

///|
fn record_effect(model : Model, operation : String, payload : String) -> Model {
  let effects = model.pending_effects.copy()
  effects.push({
    id: model.next_effect_id,
    kind: @external.NativeInvoke,
    operation,
    payload,
  })
  {
    ..model,
    pending_effects: effects,
    next_effect_id: model.next_effect_id + 1,
  }
}

///|
fn clear_after_mutation(kind : MutationKind, model : Model) -> Model {
  match kind {
    TaskQuickMutation => { ..model, task_menu_task_id: None }
    TaskDetailsMutation | CompleteMutation | ComposerMutation =>
      close_modal(model)
  }
}

///|
fn sync_workspace(model : Model, snapshot : WorkspaceSnapshot) -> Model {
  {
    ..model,
    workspace_revision: snapshot.revision,
    tasks: snapshot.tasks.copy(),
    selection_task_id: keep_task(model.selection_task_id, snapshot.tasks),
    task_menu_task_id: keep_task(model.task_menu_task_id, snapshot.tasks),
    error: None,
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    NoOp => model
    SelectTask(id) =>
      if task_exists(model.tasks, id) {
        {
          ..model,
          selection_task_id: Some(id),
          task_menu_task_id: None,
          modal: TaskModal,
          error: None,
        }
      } else {
        model
      }
    OpenTaskCompletion(id) =>
      if task_exists(model.tasks, id) {
        {
          ..model,
          selection_task_id: Some(id),
          task_menu_task_id: None,
          modal: TaskCompleteModal,
          evidence_text: "",
          error: None,
        }
      } else {
        model
      }
    ToggleTaskMenu(id) =>
      if task_exists(model.tasks, id) {
        {
          ..model,
          selection_task_id: None,
          task_menu_task_id: if model.task_menu_task_id == Some(id) {
            None
          } else {
            Some(id)
          },
          modal: NoModal,
        }
      } else {
        model
      }
    CloseModal | EscapePressed => close_modal(model)
    RouteChanged(route) => { ..close_modal(model), route, }
    DraftChanged(title) => { ..model, composer_title: title }
    RequestTaskState(id, state) =>
      if task_exists(model.tasks, id) {
        record_effect(
          { ..model, task_menu_task_id: None, error: None },
          "set_task_state",
          "task_id=\{id};state=\{state}",
        )
      } else {
        model
      }
    WorkspaceMutated(kind, snapshot) =>
      clear_after_mutation(kind, sync_workspace(model, snapshot))
    WorkspaceMutationFailed(_, error) => { ..model, error: Some(error) }
  }
}

///|
fn snapshot(revision : Int, include_first : Bool) -> WorkspaceSnapshot {
  {
    revision,
    tasks: if include_first {
      seed_tasks()
    } else {
      [{ id: "TSK-2", title: "Write summary" }]
    },
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = [NoOp]
  for task in model.tasks {
    result.push(SelectTask(task.id))
    result.push(OpenTaskCompletion(task.id))
    result.push(ToggleTaskMenu(task.id))
    result.push(RequestTaskState(task.id, "done"))
  }
  if model.modal != NoModal || model.task_menu_task_id is Some(_) {
    result.push(CloseModal)
    result.push(EscapePressed)
  }
  if model.route != "today" {
    result.push(RouteChanged("today"))
  }
  if model.composer_title != "draft" {
    result.push(DraftChanged("draft"))
  }
  result.push(WorkspaceMutated(TaskQuickMutation, snapshot(1, false)))
  result.push(WorkspaceMutated(TaskQuickMutation, snapshot(2, true)))
  result.push(WorkspaceMutated(TaskDetailsMutation, snapshot(3, true)))
  result.push(
    WorkspaceMutationFailed(TaskQuickMutation, "workspace unavailable"),
  )
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SelectTask(id) if id != "TSK-1" => [SelectTask("TSK-1")]
    OpenTaskCompletion(id) if id != "TSK-1" => [OpenTaskCompletion("TSK-1")]
    ToggleTaskMenu(id) if id != "TSK-1" => [ToggleTaskMenu("TSK-1")]
    RouteChanged(route) if route != "today" => [RouteChanged("today")]
    DraftChanged(value) if value != "" => [DraftChanged("")]
    RequestTaskState(id, state) if id != "TSK-1" || state != "done" =>
      [RequestTaskState("TSK-1", "done")]
    WorkspaceMutationFailed(kind, error) if error != "failed" =>
      [WorkspaceMutationFailed(kind, "failed")]
    _ => []
  }
}

///|
fn mutation_name(kind : MutationKind) -> String {
  match kind {
    TaskQuickMutation => "TaskQuickMutation"
    TaskDetailsMutation => "TaskDetailsMutation"
    CompleteMutation => "CompleteMutation"
    ComposerMutation => "ComposerMutation"
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    NoOp => "noop"
    SelectTask(id) => "select-task:\{id.length()}:\{id}"
    OpenTaskCompletion(id) => "open-completion:\{id.length()}:\{id}"
    ToggleTaskMenu(id) => "toggle-menu:\{id.length()}:\{id}"
    CloseModal => "close-modal"
    EscapePressed => "escape"
    RouteChanged(route) => "route:\{route.length()}:\{route}"
    DraftChanged(value) => "draft:\{value.length()}:\{value}"
    RequestTaskState(id, state) => "task-state:\{id}:\{state}"
    WorkspaceMutated(kind, snapshot) =>
      "workspace-mutated:\{mutation_name(kind)}:\{snapshot.revision}:\{snapshot.tasks.length()}"
    WorkspaceMutationFailed(kind, error) =>
      "workspace-failed:\{mutation_name(kind)}:\{error.length()}:\{error}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    NoOp => "NoOp"
    SelectTask(id) => "SelectTask(\{id.escape(quote=true)})"
    OpenTaskCompletion(id) => "OpenTaskCompletion(\{id.escape(quote=true)})"
    ToggleTaskMenu(id) => "ToggleTaskMenu(\{id.escape(quote=true)})"
    CloseModal => "CloseModal"
    EscapePressed => "EscapePressed"
    RouteChanged(route) => "RouteChanged(\{route.escape(quote=true)})"
    DraftChanged(value) => "DraftChanged(\{value.escape(quote=true)})"
    RequestTaskState(id, state) =>
      "RequestTaskState(\{id.escape(quote=true)}, \{state.escape(quote=true)})"
    WorkspaceMutated(kind, snapshot) =>
      "WorkspaceMutated(kind=\{mutation_name(kind)}, revision=\{snapshot.revision}, tasks=\{snapshot.tasks.length()})"
    WorkspaceMutationFailed(kind, error) =>
      "WorkspaceMutationFailed(kind=\{mutation_name(kind)}, error=\{error.escape(quote=true)})"
  }
}

///|
fn modal_name(modal : ActiveModal) -> String {
  match modal {
    NoModal => "none"
    TaskModal => "task"
    TaskCompleteModal => "task-complete"
    ComposerModal => "composer"
    FocusModal => "focus"
  }
}

///|
fn option_string(output : StringBuilder, value : String?) -> Unit {
  match value {
    Some(text) => {
      output.write_object(text.length())
      output.write_char(':')
      output.write_string(text)
    }
    None => output.write_string("none")
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("circular-state|revision=")
  output.write_object(model.workspace_revision)
  output.write_string("|route=")
  output.write_string(model.route)
  output.write_string("|modal=")
  output.write_string(modal_name(model.modal))
  output.write_string("|selection=")
  option_string(output, model.selection_task_id)
  output.write_string("|menu=")
  option_string(output, model.task_menu_task_id)
  output.write_string("|draft=")
  output.write_object(model.composer_title.length())
  output.write_char(':')
  output.write_string(model.composer_title)
  output.write_string("|evidence=")
  output.write_object(model.evidence_text.length())
  output.write_char(':')
  output.write_string(model.evidence_text)
  for task in model.tasks {
    output.write_string("|task=")
    output.write_object(task.id.length())
    output.write_char(':')
    output.write_string(task.id)
  }
  for effect in model.pending_effects {
    output.write_string("|effect=")
    output.write_object(effect.id)
    output.write_char(':')
    output.write_string(effect.operation)
    output.write_char(':')
    output.write_string(effect.payload)
  }
  output.write_string("|error=")
  option_string(output, model.error)
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let tasks : Array[@rabbita.Html] = []
  for task in model.tasks {
    tasks.push(@html.li(class="task-row", task.id + ": " + task.title))
  }
  let selection = match model.selection_task_id {
    Some(id) => id
    None => "none"
  }
  let error = match model.error {
    Some(message) => @html.p(class="error", message)
    None => @html.nothing
  }
  @rabbita.Val::constant(
    @html.main_(class="circular-shell", [
      @html.h1("Circular"),
      @html.p(class="route", "route=" + model.route),
      @html.p(class="modal", "modal=" + modal_name(model.modal)),
      @html.p(class="selection", "selected=" + selection),
      @html.p(
        class="revision",
        "revision=" + model.workspace_revision.to_string(),
      ),
      error,
      @html.ul(class="tasks", tasks),
    ]),
  )
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "external/manifests/circular-state.json", "src/vendor/circular_state/circular_state.mbt",
    "src/vendor/circular_state/UPSTREAM.md",
  ]
}

///|
fn modal_requires_task(modal : ActiveModal) -> Bool {
  modal == TaskModal || modal == TaskCompleteModal
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("task modals retain an existing selected task", fn(
      model,
      _,
    ) {
      if modal_requires_task(model.modal) &&
        (
          model.selection_task_id is None ||
          !task_exists(model.tasks, model.selection_task_id.unwrap())
        ) {
        @proped.Fail(
          "task modal remained open after its selected task disappeared",
        )
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("task menu references an existing task", fn(
      model,
      _,
    ) {
      match model.task_menu_task_id {
        Some(id) if !task_exists(model.tasks, id) =>
          @proped.Fail("task menu references a missing task")
        _ => @proped.Pass
      }
    }),
    @proped.transition_property("NoOp preserves state", fn(before, msg, after) {
      if msg is NoOp && before != after {
        @proped.Fail("NoOp changed the model")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("route changes close task surfaces", fn(
      _,
      msg,
      after,
    ) {
      if msg is RouteChanged(_) &&
        (after.modal != NoModal || after.selection_task_id is Some(_)) {
        @proped.Fail("route change retained a task modal or selection")
      } else {
        @proped.Pass
      }
    }),
    @external.unique_effect_ids_property("pending effect IDs remain unique", model => {
      model.pending_effects
    }),
    @proped.state_property("rendered modal and selection match model", fn(
      model,
      html,
    ) {
      let selected = match model.selection_task_id {
        Some(id) => id
        None => "none"
      }
      if !html.contains("modal=" + modal_name(model.modal)) {
        @proped.Fail("rendered modal does not match model")
      } else if !html.contains("selected=" + selected) {
        @proped.Fail("rendered task selection does not match model")
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
  { cases: 256, max_depth: 10, max_states: 720, seed: 89, shrink_budget: 4096 }
}
