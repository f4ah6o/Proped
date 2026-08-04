///|
// Adapted from moonbit-community/rabbita examples/todo at revision
// 67e8169efa1bb2e8bd17018b62b41211cbc4c357.
//
// Changes from upstream:
// - expose the model, messages, update, and view as a reusable library;
// - use a small array-backed item store for deterministic native exploration;
// - bound generated titles and item count so exploration remains finite;
// - preserve the upstream `Add if title == ""` guard, which permits
//   whitespace-only titles and is intentionally detected by a property.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.
pub(all) struct Todo {
  id : Int
  title : String
  done : Bool
} derive(Debug, Eq)

///|
pub(all) enum TodoTab {
  All
  Active
  Done
  Stats
} derive(Debug, Eq)

///|
pub(all) struct Model {
  title : String
  items : Array[Todo]
  next : Int
  tab : TodoTab
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  TitleChanged(String)
  Add
  Delete(Int)
  Toggle(Int)
  SetTab(TodoTab)
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  { title: "", items: [], next: 0, tab: All }
}

///|
pub fn TodoTab::tag(self : TodoTab) -> String {
  match self {
    All => "all"
    Active => "active"
    Done => "done"
    Stats => "stats"
  }
}

///|
pub fn TodoTab::label(self : TodoTab) -> String {
  match self {
    All => "All"
    Active => "Active"
    Done => "Done"
    Stats => "Stats"
  }
}

///|
fn item_index(items : Array[Todo], id : Int) -> Int? {
  for index, item in items {
    if item.id == id {
      return Some(index)
    }
  }
  None
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    TitleChanged(title) => { ..model, title, }
    SetTab(tab) => { ..model, tab, }
    Add if model.title == "" => model
    Add => {
      let items = model.items.copy()
      items.push({ id: model.next, title: model.title, done: false })
      { ..model, title: "", items, next: model.next + 1 }
    }
    Delete(id) =>
      match item_index(model.items, id) {
        Some(index) => {
          let items = model.items.copy()
          ignore(items.remove(index))
          { ..model, items, }
        }
        None => model
      }
    Toggle(id) =>
      match item_index(model.items, id) {
        Some(index) => {
          let items = model.items.copy()
          let item = items[index]
          items[index] = { ..item, done: !item.done }
          { ..model, items, }
        }
        None => model
      }
  }
}

///|
fn push_title_candidate(
  actions : Array[Msg],
  current : String,
  value : String,
) -> Unit {
  if current != value {
    actions.push(TitleChanged(value))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  if model.title != "" && model.items.length() < 2 {
    result.push(Add)
  }
  push_title_candidate(result, model.title, " ")
  push_title_candidate(result, model.title, "Buy milk")
  push_title_candidate(
    result,
    model.title,
    "Prepare the quarterly release verification checklist",
  )
  push_title_candidate(result, model.title, "")
  for item in model.items {
    result.push(Toggle(item.id))
    result.push(Delete(item.id))
  }
  if model.tab != All {
    result.push(SetTab(All))
  }
  if model.tab != Active {
    result.push(SetTab(Active))
  }
  if model.tab != Done {
    result.push(SetTab(Done))
  }
  if model.tab != Stats {
    result.push(SetTab(Stats))
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    TitleChanged(value) if value != " " => [TitleChanged(" ")]
    SetTab(tab) if tab != All => [SetTab(All)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    TitleChanged(value) => "title:\{value.length()}:\{value}"
    Add => "add"
    Delete(id) => "delete:\{id}"
    Toggle(id) => "toggle:\{id}"
    SetTab(tab) => "tab:\{tab.tag()}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    TitleChanged(value) => "TitleChanged(\{value.escape(quote=true)})"
    Add => "Add"
    Delete(id) => "Delete(\{id})"
    Toggle(id) => "Toggle(\{id})"
    SetTab(tab) => "SetTab(\{tab.label()})"
  }
}

///|
fn write_fingerprint_string(output : StringBuilder, value : String) -> Unit {
  output.write_object(value.length())
  output.write_char(':')
  output.write_string(value)
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("rabbita-todo|")
  write_fingerprint_string(output, model.title)
  output.write_string("|next=")
  output.write_object(model.next)
  output.write_string("|tab=")
  output.write_string(model.tab.tag())
  for item in model.items {
    output.write_string("|item=")
    output.write_object(item.id)
    output.write_char(':')
    output.write_object(item.done)
    output.write_char(':')
    write_fingerprint_string(output, item.title)
  }
  output.to_string()
}

///|
fn completed_count(model : Model) -> Int {
  let mut completed = 0
  for item in model.items {
    if item.done {
      completed = completed + 1
    }
  }
  completed
}

///|
fn visible_items(model : Model) -> Array[Todo] {
  match model.tab {
    All => model.items.copy()
    Active => model.items.filter(item => !item.done)
    Done => model.items.filter(item => item.done)
    Stats => []
  }
}

///|
fn tab_button(model : Model, tab : TodoTab, count : Int) -> @rabbita.Html {
  let class = if model.tab == tab { "tab is-active" } else { "tab" }
  @html.button(class~, [
    @html.span(class="tab-label", tab.label()),
    @html.span(class="tab-count", count.to_string()),
  ])
}

///|
fn item_view(item : Todo) -> @rabbita.Html {
  @html.li(class=if item.done { "todo-row is-done" } else { "todo-row" }, [
    @html.button(
      class=if item.done { "status-toggle is-done" } else { "status-toggle" },
      if item.done {
        "done"
      } else {
        "open"
      },
    ),
    @html.span(class="todo-title", item.title),
    @html.button(class="delete-button", "delete"),
  ])
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let total = model.items.length()
  let completed = completed_count(model)
  let active = total - completed
  let content = if model.tab == Stats {
    @html.div(class="stats-grid", [
      @html.div(class="metric-card", "total \{total}"),
      @html.div(class="metric-card", "active \{active}"),
      @html.div(class="metric-card", "done \{completed}"),
    ])
  } else {
    let rows : Array[@rabbita.Html] = []
    for item in visible_items(model) {
      rows.push(item_view(item))
    }
    if rows.is_empty() {
      @html.p(class="empty", "No todos in this view.")
    } else {
      @html.ul(class="todo-list", rows)
    }
  }
  let page = @html.div(class="panel", [
    @html.div(class="panel-header", [
      @html.h1("Todos"),
      @html.span(class="panel-kicker", "\{active} active"),
    ]),
    @html.form([
      @html.input(value=model.title, placeholder="What needs doing?"),
      @html.input(input_type=@html.InputType::Submit, value="add"),
    ]),
    @html.nav(class="tabs", [
      tab_button(model, All, total),
      tab_button(model, Active, active),
      tab_button(model, Done, completed),
      tab_button(model, Stats, total),
    ]),
    content,
  ])
  @rabbita.Val::constant(page)
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "src/vendor/rabbita_todo/upstream/main.mbt.txt", "src/vendor/rabbita_todo/upstream/styles.css",
    "src/vendor/rabbita_todo/todo.mbt",
  ]
}

///|
fn title_is_blank(title : String) -> Bool {
  title.trim().is_empty()
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("stored todo titles are not blank", fn(model, _) {
      for item in model.items {
        if title_is_blank(item.title) {
          return @proped.Fail("todo \{item.id} has a blank title")
        }
      }
      @proped.Pass
    }),
    @proped.state_property("next id remains ahead of stored ids", fn(model, _) {
      for item in model.items {
        if item.id >= model.next {
          return @proped.Fail("todo id is not below the next id")
        }
      }
      @proped.Pass
    }),
    @proped.state_property("rendered header reports active count", fn(
      model,
      html,
    ) {
      let active = model.items.length() - completed_count(model)
      if html.contains("\{active} active") {
        @proped.Pass
      } else {
        @proped.Fail("rendered header did not contain the active count")
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
  { cases: 192, max_depth: 14, max_states: 320, seed: 29, shrink_budget: 4096 }
}
