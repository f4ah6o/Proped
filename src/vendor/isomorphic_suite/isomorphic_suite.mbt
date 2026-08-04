///|
// Clean-room deterministic adapter for moonbit-community/isomorphic at
// revision 590ac1c4de71050419cc6643942e0d1f181301aa.
//
// Covered applications:
// - kanban/frontend/app
// - todoapp/frontend/app
// - noteapp/frontend/app
//
// HTTP commands are represented as PendingRequest records. Response messages
// carry adapter-local request IDs so the finite runner can generate only
// causally possible responses. The application update semantics intentionally
// do not reject an older generation, matching the pinned response branches.
//
// The upstream modules declare Apache-2.0 in each moon.mod.json, but the pinned
// repository has no standalone license file. No upstream source is copied.

///|
pub(all) enum SuiteApp {
  Kanban
  Todo
  Note
} derive(Debug, Eq)

///|
pub fn SuiteApp::to_string(self : SuiteApp) -> String {
  match self {
    Kanban => "kanban"
    Todo => "todo"
    Note => "note"
  }
}

///|
pub(all) struct Column {
  id : Int
  title : String
  position : Int
} derive(Debug, Eq)

///|
pub(all) struct Card {
  id : Int
  column_id : Int
  title : String
  position : Int
} derive(Debug, Eq)

///|
pub(all) struct KanbanState {
  columns : Array[Column]
  cards : Array[Card]
  moving_card : Int
  generation : Int
} derive(Debug, Eq)

///|
pub(all) struct TodoItem {
  id : Int
  text : String
  done : Bool
} derive(Debug, Eq)

///|
pub(all) struct TodoState {
  todos : Array[TodoItem]
  input : String
  generation : Int
} derive(Debug, Eq)

///|
pub(all) struct NoteItem {
  id : Int
  title : String
  pinned : Bool
} derive(Debug, Eq)

///|
pub(all) struct NoteState {
  notes : Array[NoteItem]
  title_input : String
  content_input : String
  selected_note_id : Int
  generation : Int
} derive(Debug, Eq)

///|
pub(all) enum RequestDomain {
  KanbanBoard
  KanbanDeleteCard
  TodoList
  TodoAdd
  TodoToggle
  TodoDelete
  NoteList
  NotePin
  NoteDelete
} derive(Debug, Eq)

///|
pub fn RequestDomain::to_string(self : RequestDomain) -> String {
  match self {
    KanbanBoard => "kanban-board"
    KanbanDeleteCard => "kanban-delete-card"
    TodoList => "todo-list"
    TodoAdd => "todo-add"
    TodoToggle => "todo-toggle"
    TodoDelete => "todo-delete"
    NoteList => "note-list"
    NotePin => "note-pin"
    NoteDelete => "note-delete"
  }
}

///|
pub(all) struct PendingRequest {
  id : Int
  domain : RequestDomain
  generation : Int
  entity_id : Int
} derive(Debug, Eq)

///|
pub(all) struct Model {
  active : SuiteApp
  kanban : KanbanState
  todo : TodoState
  note : NoteState
  pending : Array[PendingRequest]
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SwitchApp(SuiteApp)
  KanbanInit
  KanbanSelectCardToMove(Int)
  KanbanCancelMove
  KanbanMoveCardTo(Int, Int)
  KanbanDeleteCard(Int)
  KanbanBoardLoaded(Int, Int)
  KanbanDeleteCompleted(Int, Int, Bool)
  TodoInit
  TodoInputChanged(String)
  TodoAdd
  TodoAdded(Int, TodoItem, Bool)
  TodoToggle(Int)
  TodoToggled(Int, TodoItem, Bool)
  TodoDelete(Int)
  TodoDeleted(Int, Int, Bool)
  TodoListLoaded(Int, Int)
  NoteInit
  NoteSelect(Int)
  NoteDeselect
  NoteTogglePin(Int)
  NotePinToggled(Int, NoteItem, Bool)
  NoteDelete(Int)
  NoteDeleted(Int, Int, Bool)
  NoteListLoaded(Int, Int)
} derive(Debug, Eq)

///|
fn kanban_fixture(index : Int) -> KanbanState {
  let columns = [
    { id: 1, title: "Backlog", position: 1000 },
    { id: 2, title: "Done", position: 2000 },
  ]
  let cards = if index == 0 {
    [
      { id: 1, column_id: 1, title: "Draft", position: 1000 },
      { id: 2, column_id: 2, title: "Ship", position: 1000 },
    ]
  } else {
    [{ id: 2, column_id: 2, title: "Ship", position: 1000 }]
  }
  { columns, cards, moving_card: 0, generation: 0 }
}

///|
fn todo_fixture(index : Int) -> Array[TodoItem] {
  if index == 0 {
    [{ id: 1, text: "Review", done: false }]
  } else {
    [{ id: 1, text: "Review", done: true }]
  }
}

///|
fn note_fixture(index : Int) -> Array[NoteItem] {
  if index == 0 {
    [
      { id: 1, title: "First", pinned: false },
      { id: 2, title: "Pinned", pinned: true },
    ]
  } else {
    [{ id: 2, title: "Pinned", pinned: true }]
  }
}

///|
pub fn initial() -> Model {
  {
    active: Kanban,
    kanban: kanban_fixture(0),
    todo: { todos: todo_fixture(0), input: "", generation: 0 },
    note: {
      notes: note_fixture(0),
      title_input: "",
      content_input: "",
      selected_note_id: 0,
      generation: 0,
    },
    pending: [],
  }
}

///|
fn has_request(model : Model, domain : RequestDomain) -> Bool {
  model.pending.any(request => request.domain == domain)
}

///|
fn find_request(
  model : Model,
  id : Int,
  domain : RequestDomain,
) -> PendingRequest? {
  for request in model.pending {
    if request.id == id && request.domain == domain {
      return Some(request)
    }
  }
  None
}

///|
fn remove_request(model : Model, id : Int) -> Array[PendingRequest] {
  model.pending.filter(request => request.id != id)
}

///|
fn request_generation(model : Model, domain : RequestDomain) -> Int {
  match domain {
    KanbanBoard | KanbanDeleteCard => model.kanban.generation
    TodoList | TodoAdd | TodoToggle | TodoDelete => model.todo.generation
    NoteList | NotePin | NoteDelete => model.note.generation
  }
}

///|
fn request_id_for(domain : RequestDomain, entity_id : Int) -> Int {
  match domain {
    KanbanBoard => 101
    KanbanDeleteCard => 1100 + entity_id
    TodoList => 201
    TodoAdd => 2101
    TodoToggle => 2200 + entity_id
    TodoDelete => 2300 + entity_id
    NoteList => 301
    NotePin => 3200 + entity_id
    NoteDelete => 3300 + entity_id
  }
}

///|
fn record_request(
  model : Model,
  domain : RequestDomain,
  entity_id : Int,
) -> Model {
  let pending = model.pending.copy()
  pending.push({
    id: request_id_for(domain, entity_id),
    domain,
    generation: request_generation(model, domain),
    entity_id,
  })
  { ..model, pending, }
}

///|
fn column_exists(state : KanbanState, id : Int) -> Bool {
  state.columns.any(column => column.id == id)
}

///|
fn card_exists(state : KanbanState, id : Int) -> Bool {
  state.cards.any(card => card.id == id)
}

///|
fn todo_exists(state : TodoState, id : Int) -> Bool {
  state.todos.any(todo => todo.id == id)
}

///|
fn note_exists(state : NoteState, id : Int) -> Bool {
  state.notes.any(note => note.id == id)
}

///|
fn todo_by_id(state : TodoState, id : Int) -> TodoItem? {
  for todo in state.todos {
    if todo.id == id {
      return Some(todo)
    }
  }
  None
}

///|
fn note_by_id(state : NoteState, id : Int) -> NoteItem? {
  for note in state.notes {
    if note.id == id {
      return Some(note)
    }
  }
  None
}

///|
fn next_position(cards : Array[Card], column_id : Int) -> Int {
  let mut maximum = 0
  for card in cards {
    if card.column_id == column_id && card.position > maximum {
      maximum = card.position
    }
  }
  maximum + 1000
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SwitchApp(app) => { ..model, active: app }
    KanbanInit => record_request(model, KanbanBoard, 0)
    KanbanSelectCardToMove(id) =>
      if card_exists(model.kanban, id) {
        { ..model, kanban: { ..model.kanban, moving_card: id } }
      } else {
        model
      }
    KanbanCancelMove => { ..model, kanban: { ..model.kanban, moving_card: 0 } }
    KanbanMoveCardTo(column_id, _target_index) => {
      let card_id = model.kanban.moving_card
      if card_id == 0 {
        return model
      }
      let cards = model.kanban.cards.map(card => {
        if card.id == card_id {
          {
            ..card,
            column_id,
            position: next_position(model.kanban.cards, column_id),
          }
        } else {
          card
        }
      })
      {
        ..model,
        kanban: {
          ..model.kanban,
          cards,
          moving_card: 0,
          generation: model.kanban.generation + 1,
        },
      }
    }
    KanbanDeleteCard(id) => {
      if !card_exists(model.kanban, id) {
        return model
      }
      let next = record_request(model, KanbanDeleteCard, id)
      {
        ..next,
        kanban: {
          ..next.kanban,
          cards: next.kanban.cards.filter(card => card.id != id),
          moving_card: if next.kanban.moving_card == id {
            0
          } else {
            next.kanban.moving_card
          },
          generation: next.kanban.generation + 1,
        },
      }
    }
    KanbanBoardLoaded(request_id, fixture) =>
      match find_request(model, request_id, KanbanBoard) {
        Some(_) => {
          let loaded = kanban_fixture(fixture)
          {
            ..model,
            kanban: { ..loaded, generation: model.kanban.generation },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    KanbanDeleteCompleted(request_id, _id, _success) =>
      match find_request(model, request_id, KanbanDeleteCard) {
        Some(_) => { ..model, pending: remove_request(model, request_id) }
        None => model
      }
    TodoInit => record_request(model, TodoList, 0)
    TodoInputChanged(value) => { ..model, todo: { ..model.todo, input: value } }
    TodoAdd => {
      if model.todo.input.is_empty() || model.todo.input.char_length() > 256 {
        return model
      }
      let next = record_request(model, TodoAdd, 0)
      { ..next, todo: { ..next.todo, input: "" } }
    }
    TodoAdded(request_id, todo, success) =>
      match find_request(model, request_id, TodoAdd) {
        Some(_) => {
          let todos = if success {
            let result = model.todo.todos.copy()
            result.push(todo)
            result
          } else {
            model.todo.todos
          }
          {
            ..model,
            todo: {
              ..model.todo,
              todos,
              generation: if success {
                model.todo.generation + 1
              } else {
                model.todo.generation
              },
            },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    TodoToggle(id) =>
      if todo_exists(model.todo, id) {
        record_request(model, TodoToggle, id)
      } else {
        model
      }
    TodoToggled(request_id, updated, success) =>
      match find_request(model, request_id, TodoToggle) {
        Some(_) => {
          let todos = if success {
            model.todo.todos.map(todo => {
              if todo.id == updated.id {
                updated
              } else {
                todo
              }
            })
          } else {
            model.todo.todos
          }
          {
            ..model,
            todo: {
              ..model.todo,
              todos,
              generation: if success {
                model.todo.generation + 1
              } else {
                model.todo.generation
              },
            },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    TodoDelete(id) =>
      if todo_exists(model.todo, id) {
        record_request(model, TodoDelete, id)
      } else {
        model
      }
    TodoDeleted(request_id, id, success) =>
      match find_request(model, request_id, TodoDelete) {
        Some(_) => {
          let todos = if success {
            model.todo.todos.filter(todo => todo.id != id)
          } else {
            model.todo.todos
          }
          {
            ..model,
            todo: {
              ..model.todo,
              todos,
              generation: if success {
                model.todo.generation + 1
              } else {
                model.todo.generation
              },
            },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    TodoListLoaded(request_id, fixture) =>
      match find_request(model, request_id, TodoList) {
        Some(_) =>
          {
            ..model,
            todo: { ..model.todo, todos: todo_fixture(fixture) },
            pending: remove_request(model, request_id),
          }
        None => model
      }
    NoteInit => record_request(model, NoteList, 0)
    NoteSelect(id) =>
      if note_exists(model.note, id) {
        { ..model, note: { ..model.note, selected_note_id: id } }
      } else {
        model
      }
    NoteDeselect => { ..model, note: { ..model.note, selected_note_id: 0 } }
    NoteTogglePin(id) =>
      if note_exists(model.note, id) {
        record_request(model, NotePin, id)
      } else {
        model
      }
    NotePinToggled(request_id, updated, success) =>
      match find_request(model, request_id, NotePin) {
        Some(_) => {
          let notes = if success {
            model.note.notes.map(note => {
              if note.id == updated.id {
                updated
              } else {
                note
              }
            })
          } else {
            model.note.notes
          }
          {
            ..model,
            note: {
              ..model.note,
              notes,
              generation: if success {
                model.note.generation + 1
              } else {
                model.note.generation
              },
            },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    NoteDelete(id) =>
      if note_exists(model.note, id) {
        record_request(model, NoteDelete, id)
      } else {
        model
      }
    NoteDeleted(request_id, id, success) =>
      match find_request(model, request_id, NoteDelete) {
        Some(_) => {
          let notes = if success {
            model.note.notes.filter(note => note.id != id)
          } else {
            model.note.notes
          }
          let selected_note_id = if success && model.note.selected_note_id == id {
            0
          } else {
            model.note.selected_note_id
          }
          {
            ..model,
            note: {
              ..model.note,
              notes,
              selected_note_id,
              generation: if success {
                model.note.generation + 1
              } else {
                model.note.generation
              },
            },
            pending: remove_request(model, request_id),
          }
        }
        None => model
      }
    NoteListLoaded(request_id, fixture) =>
      match find_request(model, request_id, NoteList) {
        Some(_) =>
          {
            ..model,
            note: { ..model.note, notes: note_fixture(fixture) },
            pending: remove_request(model, request_id),
          }
        None => model
      }
  }
}

///|
fn response_actions(model : Model, result : Array[Msg]) -> Unit {
  for request in model.pending {
    match request.domain {
      KanbanBoard => {
        result.push(KanbanBoardLoaded(request.id, 0))
        result.push(KanbanBoardLoaded(request.id, 1))
      }
      KanbanDeleteCard => {
        result.push(KanbanDeleteCompleted(request.id, request.entity_id, true))
        result.push(KanbanDeleteCompleted(request.id, request.entity_id, false))
      }
      TodoList => {
        result.push(TodoListLoaded(request.id, 0))
        result.push(TodoListLoaded(request.id, 1))
      }
      TodoAdd => {
        result.push(
          TodoAdded(request.id, { id: 2, text: "New todo", done: false }, true),
        )
        result.push(
          TodoAdded(request.id, { id: 2, text: "New todo", done: false }, false),
        )
      }
      TodoToggle => {
        let current = todo_by_id(model.todo, request.entity_id)
        match current {
          Some(todo) => {
            let updated = { ..todo, done: !todo.done }
            result.push(TodoToggled(request.id, updated, true))
            result.push(TodoToggled(request.id, updated, false))
          }
          None => ()
        }
      }
      TodoDelete => {
        result.push(TodoDeleted(request.id, request.entity_id, true))
        result.push(TodoDeleted(request.id, request.entity_id, false))
      }
      NoteList => {
        result.push(NoteListLoaded(request.id, 0))
        result.push(NoteListLoaded(request.id, 1))
      }
      NotePin => {
        let current = note_by_id(model.note, request.entity_id)
        match current {
          Some(note) => {
            let updated = { ..note, pinned: !note.pinned }
            result.push(NotePinToggled(request.id, updated, true))
            result.push(NotePinToggled(request.id, updated, false))
          }
          None => ()
        }
      }
      NoteDelete => {
        result.push(NoteDeleted(request.id, request.entity_id, true))
        result.push(NoteDeleted(request.id, request.entity_id, false))
      }
    }
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  for app in [Kanban, Todo, Note] {
    if app != model.active {
      result.push(SwitchApp(app))
    }
  }
  match model.active {
    Kanban => {
      if !has_request(model, KanbanBoard) {
        result.push(KanbanInit)
      }
      for card in model.kanban.cards {
        if !model.pending.any(request => {
            request.domain == KanbanDeleteCard && request.entity_id == card.id
          }) {
          result.push(KanbanDeleteCard(card.id))
        }
        if model.kanban.moving_card == 0 {
          result.push(KanbanSelectCardToMove(card.id))
        }
      }
      if model.kanban.moving_card != 0 {
        result.push(KanbanCancelMove)
        for column in model.kanban.columns {
          result.push(KanbanMoveCardTo(column.id, 0))
        }
        result.push(KanbanMoveCardTo(99, 0))
      }
    }
    Todo => {
      if !has_request(model, TodoList) {
        result.push(TodoInit)
      }
      if model.todo.input != "" {
        result.push(TodoInputChanged(""))
      }
      if model.todo.input != "New todo" {
        result.push(TodoInputChanged("New todo"))
      }
      if !model.todo.input.is_empty() && !has_request(model, TodoAdd) {
        result.push(TodoAdd)
      }
      for todo in model.todo.todos {
        if !model.pending.any(request => {
            request.domain == TodoToggle && request.entity_id == todo.id
          }) {
          result.push(TodoToggle(todo.id))
        }
        if !model.pending.any(request => {
            request.domain == TodoDelete && request.entity_id == todo.id
          }) {
          result.push(TodoDelete(todo.id))
        }
      }
    }
    Note => {
      if !has_request(model, NoteList) {
        result.push(NoteInit)
      }
      if model.note.selected_note_id != 0 {
        result.push(NoteDeselect)
      }
      for note in model.note.notes {
        if model.note.selected_note_id != note.id {
          result.push(NoteSelect(note.id))
        }
        if !model.pending.any(request => {
            request.domain == NotePin && request.entity_id == note.id
          }) {
          result.push(NoteTogglePin(note.id))
        }
        if !model.pending.any(request => {
            request.domain == NoteDelete && request.entity_id == note.id
          }) {
          result.push(NoteDelete(note.id))
        }
      }
    }
  }
  response_actions(model, result)
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SwitchApp(app) if app != Kanban => [SwitchApp(Kanban)]
    KanbanSelectCardToMove(id) if id != 1 => [KanbanSelectCardToMove(1)]
    KanbanMoveCardTo(column, index) if index != 0 =>
      [KanbanMoveCardTo(column, 0)]
    KanbanMoveCardTo(column, _) if column != 99 => [KanbanMoveCardTo(99, 0)]
    KanbanDeleteCard(id) if id != 1 => [KanbanDeleteCard(1)]
    KanbanBoardLoaded(request, fixture) if fixture != 0 =>
      [KanbanBoardLoaded(request, 0)]
    TodoInputChanged(value) if value != "" => [TodoInputChanged("")]
    TodoToggle(id) if id != 1 => [TodoToggle(1)]
    TodoDelete(id) if id != 1 => [TodoDelete(1)]
    TodoListLoaded(request, fixture) if fixture != 0 =>
      [TodoListLoaded(request, 0)]
    NoteSelect(id) if id != 1 => [NoteSelect(1)]
    NoteDelete(id) if id != 1 => [NoteDelete(1)]
    NoteListLoaded(request, fixture) if fixture != 1 =>
      [NoteListLoaded(request, 1)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SwitchApp(app) => "switch:\{app.to_string()}"
    KanbanInit => "kanban-init"
    KanbanSelectCardToMove(id) => "kanban-select-move:\{id}"
    KanbanCancelMove => "kanban-cancel-move"
    KanbanMoveCardTo(column, index) => "kanban-move:\{column}:\{index}"
    KanbanDeleteCard(id) => "kanban-delete:\{id}"
    KanbanBoardLoaded(request, fixture) => "kanban-board:\{request}:\{fixture}"
    KanbanDeleteCompleted(request, id, success) =>
      "kanban-delete-result:\{request}:\{id}:\{success}"
    TodoInit => "todo-init"
    TodoInputChanged(value) => "todo-input:\{value.length()}:\{value}"
    TodoAdd => "todo-add"
    TodoAdded(request, todo, success) =>
      "todo-added:\{request}:\{todo.id}:\{success}"
    TodoToggle(id) => "todo-toggle:\{id}"
    TodoToggled(request, todo, success) =>
      "todo-toggled:\{request}:\{todo.id}:\{todo.done}:\{success}"
    TodoDelete(id) => "todo-delete:\{id}"
    TodoDeleted(request, id, success) =>
      "todo-deleted:\{request}:\{id}:\{success}"
    TodoListLoaded(request, fixture) => "todo-list:\{request}:\{fixture}"
    NoteInit => "note-init"
    NoteSelect(id) => "note-select:\{id}"
    NoteDeselect => "note-deselect"
    NoteTogglePin(id) => "note-pin:\{id}"
    NotePinToggled(request, note, success) =>
      "note-pin-result:\{request}:\{note.id}:\{note.pinned}:\{success}"
    NoteDelete(id) => "note-delete:\{id}"
    NoteDeleted(request, id, success) =>
      "note-deleted:\{request}:\{id}:\{success}"
    NoteListLoaded(request, fixture) => "note-list:\{request}:\{fixture}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SwitchApp(app) => "SwitchApp(\{app.to_string()})"
    KanbanInit => "KanbanInit"
    KanbanSelectCardToMove(id) => "KanbanSelectCardToMove(\{id})"
    KanbanCancelMove => "KanbanCancelMove"
    KanbanMoveCardTo(column, index) =>
      "KanbanMoveCardTo(column=\{column}, index=\{index})"
    KanbanDeleteCard(id) => "KanbanDeleteCard(\{id})"
    KanbanBoardLoaded(request, fixture) =>
      "KanbanBoardLoaded(request=\{request}, fixture=\{fixture})"
    KanbanDeleteCompleted(request, id, success) =>
      "KanbanDeleteCompleted(request=\{request}, card=\{id}, success=\{success})"
    TodoInit => "TodoInit"
    TodoInputChanged(value) => "TodoInputChanged(\{value.escape(quote=true)})"
    TodoAdd => "TodoAdd"
    TodoAdded(request, todo, success) =>
      "TodoAdded(request=\{request}, todo=\{todo.id}, success=\{success})"
    TodoToggle(id) => "TodoToggle(\{id})"
    TodoToggled(request, todo, success) =>
      "TodoToggled(request=\{request}, todo=\{todo.id}, done=\{todo.done}, success=\{success})"
    TodoDelete(id) => "TodoDelete(\{id})"
    TodoDeleted(request, id, success) =>
      "TodoDeleted(request=\{request}, todo=\{id}, success=\{success})"
    TodoListLoaded(request, fixture) =>
      "TodoListLoaded(request=\{request}, fixture=\{fixture})"
    NoteInit => "NoteInit"
    NoteSelect(id) => "NoteSelect(\{id})"
    NoteDeselect => "NoteDeselect"
    NoteTogglePin(id) => "NoteTogglePin(\{id})"
    NotePinToggled(request, note, success) =>
      "NotePinToggled(request=\{request}, note=\{note.id}, pinned=\{note.pinned}, success=\{success})"
    NoteDelete(id) => "NoteDelete(\{id})"
    NoteDeleted(request, id, success) =>
      "NoteDeleted(request=\{request}, note=\{id}, success=\{success})"
    NoteListLoaded(request, fixture) =>
      "NoteListLoaded(request=\{request}, fixture=\{fixture})"
  }
}

///|
fn[T] write_ids(
  output : StringBuilder,
  values : Array[T],
  read : (T) -> Int,
) -> Unit {
  for value in values {
    output.write_char(':')
    output.write_object(read(value))
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("isomorphic-suite|active=")
  output.write_string(model.active.to_string())
  output.write_string("|kanban=")
  output.write_object(model.kanban.generation)
  output.write_char(':')
  output.write_object(model.kanban.moving_card)
  output.write_string("|columns")
  write_ids(output, model.kanban.columns, column => column.id)
  output.write_string("|cards")
  for card in model.kanban.cards {
    output.write_char(':')
    output.write_object(card.id)
    output.write_char('@')
    output.write_object(card.column_id)
  }
  output.write_string("|todo=")
  output.write_object(model.todo.generation)
  output.write_char(':')
  output.write_object(model.todo.input.length())
  for todo in model.todo.todos {
    output.write_char(':')
    output.write_object(todo.id)
    output.write_char('=')
    output.write_object(todo.done)
  }
  output.write_string("|note=")
  output.write_object(model.note.generation)
  output.write_char(':')
  output.write_object(model.note.selected_note_id)
  for note in model.note.notes {
    output.write_char(':')
    output.write_object(note.id)
    output.write_char('=')
    output.write_object(note.pinned)
  }
  output.write_string("|pending")
  for request in model.pending {
    output.write_char(':')
    output.write_object(request.id)
    output.write_char('@')
    output.write_string(request.domain.to_string())
    output.write_char('@')
    output.write_object(request.generation)
    output.write_char('@')
    output.write_object(request.entity_id)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let detail = match model.active {
    Kanban =>
      @html.div(class="kanban", [
        @html.p("columns=\{model.kanban.columns.length()}"),
        @html.p("cards=\{model.kanban.cards.length()}"),
        @html.p("moving=\{model.kanban.moving_card}"),
      ])
    Todo =>
      @html.div(class="todo", [
        @html.p("todos=\{model.todo.todos.length()}"),
        @html.p("input=\{model.todo.input}"),
      ])
    Note =>
      @html.div(class="note", [
        @html.p("notes=\{model.note.notes.length()}"),
        @html.p("selected=\{model.note.selected_note_id}"),
      ])
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Isomorphic suite"),
      @html.p(class="active", "active=\{model.active.to_string()}"),
      @html.p(class="pending", "pending=\{model.pending.length()}"),
      detail,
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/isomorphic-suite.json", "src/vendor/isomorphic_suite/isomorphic_suite.mbt",
  ]
}

///|
fn request_for(
  model : Model,
  id : Int,
  domain : RequestDomain,
) -> PendingRequest? {
  find_request(model, id, domain)
}

///|
fn unique_ints(values : Array[Int]) -> Bool {
  for index, value in values {
    for other_index = index + 1
        other_index < values.length()
        other_index = other_index + 1 {
      if values[other_index] == value {
        return false
      }
    }
  }
  true
}

///|
fn entity_ids_unique(model : Model) -> Bool {
  unique_ints(model.kanban.columns.map(column => column.id)) &&
  unique_ints(model.kanban.cards.map(card => card.id)) &&
  unique_ints(model.todo.todos.map(todo => todo.id)) &&
  unique_ints(model.note.notes.map(note => note.id))
}

///|
fn pending_ids_unique(model : Model) -> Bool {
  unique_ints(model.pending.map(request => request.id))
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("common CRUD entity identifiers remain unique", fn(
      model,
      _,
    ) {
      if entity_ids_unique(model) {
        @proped.Pass
      } else {
        @proped.Fail("duplicate entity identifier in suite state")
      }
    }),
    @proped.state_property("kanban cards reference existing columns", fn(
      model,
      _,
    ) {
      for card in model.kanban.cards {
        if !column_exists(model.kanban, card.column_id) {
          return @proped.Fail(
            "card \{card.id} references missing column \{card.column_id}",
          )
        }
      }
      @proped.Pass
    }),
    @proped.transition_property(
      "stale kanban board responses preserve newer board intent",
      fn(before, msg, after) {
        match msg {
          KanbanBoardLoaded(request_id, _) =>
            match request_for(before, request_id, KanbanBoard) {
              Some(request) if request.generation < before.kanban.generation &&
                after.kanban != before.kanban =>
                @proped.Fail(
                  "older board response overwrote a newer optimistic mutation",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "stale todo list responses preserve newer todo mutations",
      fn(before, msg, after) {
        match msg {
          TodoListLoaded(request_id, _) =>
            match request_for(before, request_id, TodoList) {
              Some(request) if request.generation < before.todo.generation &&
                after.todo != before.todo =>
                @proped.Fail(
                  "older todo list response overwrote a newer mutation result",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("selected note remains present", fn(model, _) {
      if model.note.selected_note_id == 0 ||
        note_exists(model.note, model.note.selected_note_id) {
        @proped.Pass
      } else {
        @proped.Fail("selected note ID does not exist in the loaded note list")
      }
    }),
    @proped.state_property("pending request IDs remain unique", fn(model, _) {
      if pending_ids_unique(model) {
        @proped.Pass
      } else {
        @proped.Fail("pending request IDs are not unique")
      }
    }),
    @proped.state_property("rendered active app matches suite model", fn(
      model,
      html,
    ) {
      if !html.contains("active=\{model.active.to_string()}") {
        @proped.Fail("rendered active application does not match model")
      } else if !html.contains("pending=\{model.pending.length()}") {
        @proped.Fail("rendered pending request count does not match model")
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
  { cases: 512, max_depth: 14, max_states: 1400, seed: 97, shrink_budget: 8192 }
}
