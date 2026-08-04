///|
// Adapted from justjavac/proton-demo frontend/main at revision
// 5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d.
//
// Changes from upstream:
// - replace Proton native invocations and subscriptions with deterministic
//   EffectDescriptor records;
// - expose a finite native state machine and response corpus;
// - preserve the uncorrelated SnapshotReceived update branch.
//
// Licensed under MIT. See LICENSE and UPSTREAM.md in this directory.
pub(all) struct TodoItem {
  id : Int
  title : String
  completed : Bool
} derive(Debug, Eq)

///|
pub(all) struct TodoSnapshot {
  version : Int
  todos : Array[TodoItem]
} derive(Debug, Eq)

///|
pub(all) struct Model {
  draft : String
  snapshot : TodoSnapshot
  loading : Bool
  error : String?
  pending_effects : Array[@external.EffectDescriptor]
  next_effect_id : Int
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  Load
  DraftChanged(String)
  Create
  SetCompleted(Int, Bool)
  Delete(Int)
  SnapshotReceived(TodoSnapshot)
  CommandFailed(String)
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  {
    draft: "",
    snapshot: { version: 0, todos: [] },
    loading: true,
    error: None,
    pending_effects: [],
    next_effect_id: 1,
  }
}

///|
fn record_effect(model : Model, operation : String, payload : String) -> Model {
  let pending_effects = model.pending_effects.copy()
  pending_effects.push({
    id: model.next_effect_id,
    kind: @external.NativeInvoke,
    operation,
    payload,
  })
  { ..model, pending_effects, next_effect_id: model.next_effect_id + 1 }
}

///|
fn existing_todo(model : Model, id : Int) -> Bool {
  for todo in model.snapshot.todos {
    if todo.id == id {
      return true
    }
  }
  false
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Load =>
      record_effect({ ..model, loading: true, error: None }, "list_todos", "{}")
    DraftChanged(draft) => { ..model, draft, }
    Create if model.draft.trim().is_empty() => model
    Create =>
      record_effect(
        { ..model, draft: "", error: None },
        "create_todo",
        model.draft,
      )
    SetCompleted(id, completed) =>
      record_effect(
        { ..model, error: None },
        "set_todo_completed",
        "id=\{id};completed=\{completed}",
      )
    Delete(id) =>
      record_effect({ ..model, error: None }, "delete_todo", "id=\{id}")
    SnapshotReceived(snapshot) =>
      { ..model, snapshot, loading: false, error: None, pending_effects: [] }
    CommandFailed(error) =>
      { ..model, loading: false, error: Some(error), pending_effects: [] }
  }
}

///|
fn snapshot(version : Int) -> TodoSnapshot {
  let todos = if version == 0 {
    []
  } else {
    [{ id: 1, title: "todo-v\{version}", completed: version >= 2 }]
  }
  { version, todos }
}

///|
fn push_draft(actions : Array[Msg], current : String, value : String) -> Unit {
  if current != value {
    actions.push(DraftChanged(value))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  result.push(Load)
  push_draft(result, model.draft, "")
  push_draft(result, model.draft, " ")
  push_draft(result, model.draft, "new todo")
  push_draft(result, model.draft, "月")
  if !model.draft.trim().is_empty() {
    result.push(Create)
  }
  result.push(SnapshotReceived(snapshot(0)))
  result.push(SnapshotReceived(snapshot(1)))
  result.push(SnapshotReceived(snapshot(2)))
  result.push(SnapshotReceived(snapshot(3)))
  result.push(CommandFailed("bridge unavailable"))
  if existing_todo(model, 1) {
    result.push(SetCompleted(1, true))
    result.push(SetCompleted(1, false))
    result.push(Delete(1))
  }
  result.push(SetCompleted(99, true))
  result.push(Delete(99))
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    DraftChanged(value) if value != " " => [DraftChanged(" ")]
    SetCompleted(id, completed) if id != 0 => [SetCompleted(0, completed)]
    Delete(id) if id != 0 => [Delete(0)]
    SnapshotReceived(value) if value.version > 1 =>
      [SnapshotReceived(snapshot(1))]
    CommandFailed(value) if value != "failed" => [CommandFailed("failed")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Load => "load"
    DraftChanged(value) => "draft:\{value.length()}:\{value}"
    Create => "create"
    SetCompleted(id, completed) => "set-completed:\{id}:\{completed}"
    Delete(id) => "delete:\{id}"
    SnapshotReceived(value) => "snapshot:\{value.version}"
    CommandFailed(value) => "command-failed:\{value.length()}:\{value}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Load => "Load"
    DraftChanged(value) => "DraftChanged(\{value.escape(quote=true)})"
    Create => "Create"
    SetCompleted(id, completed) => "SetCompleted(\{id}, \{completed})"
    Delete(id) => "Delete(\{id})"
    SnapshotReceived(value) => "SnapshotReceived(version=\{value.version})"
    CommandFailed(value) => "CommandFailed(\{value.escape(quote=true)})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("proton-demo-todo|draft=")
  output.write_object(model.draft.length())
  output.write_char(':')
  output.write_string(model.draft)
  output.write_string("|version=")
  output.write_object(model.snapshot.version)
  output.write_string("|next-effect=")
  output.write_object(model.next_effect_id)
  output.write_string("|loading=")
  output.write_object(model.loading)
  output.write_string("|error=")
  match model.error {
    Some(error) => output.write_string(error)
    None => output.write_string("none")
  }
  for todo in model.snapshot.todos {
    output.write_string("|todo=")
    output.write_object(todo.id)
    output.write_char(':')
    output.write_object(todo.title.length())
    output.write_char(':')
    output.write_string(todo.title)
    output.write_char(':')
    output.write_object(todo.completed)
  }
  for effect in model.pending_effects {
    output.write_string("|effect=")
    output.write_object(effect.id)
    output.write_char(':')
    output.write_string(effect.operation)
    output.write_char(':')
    output.write_string(effect.payload)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let rows : Array[@rabbita.Html] = []
  for todo in model.snapshot.todos {
    rows.push(
      @html.li(
        class=if todo.completed { "todo-row is-complete" } else { "todo-row" },
        todo.title,
      ),
    )
  }
  let content = if model.loading {
    @html.p(class="status", "Loading todos...")
  } else if rows.is_empty() {
    @html.p(class="status", "No todos yet.")
  } else {
    @html.ul(class="todo-list", rows)
  }
  let error = match model.error {
    Some(message) => @html.p(class="error", message)
    None => @html.nothing
  }
  @rabbita.Val::constant(
    @html.div(class="app-shell", [
      @html.h1("Proton Starter"),
      @html.span(
        class="version",
        "Revision " + model.snapshot.version.to_string(),
      ),
      @html.input(value=model.draft),
      error,
      content,
    ]),
  )
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "external/manifests/proton-demo-todo.json", "src/vendor/proton_todo/upstream/main.mbt.txt",
    "src/vendor/proton_todo/upstream/styles.css", "src/vendor/proton_todo/proton_todo.mbt",
  ]
}

///|
fn is_snapshot(msg : Msg) -> Bool {
  msg is SnapshotReceived(_)
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @external.monotonic_int_property(
      "snapshot version never decreases",
      model => model.snapshot.version,
      is_snapshot,
    ),
    @external.unique_effect_ids_property("pending effect IDs remain unique", model => {
      model.pending_effects
    }),
    @proped.state_property("rendered revision matches snapshot", fn(
      model,
      html,
    ) {
      if html.contains("Revision " + model.snapshot.version.to_string()) {
        @proped.Pass
      } else {
        @proped.Fail("rendered revision did not match snapshot version")
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
  { cases: 192, max_depth: 10, max_states: 320, seed: 53, shrink_budget: 4096 }
}
