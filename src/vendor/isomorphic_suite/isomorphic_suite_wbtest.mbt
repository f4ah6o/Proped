///|
test "Kanban direct move can create a missing-column reference" {
  let selected = update(initial(), KanbanSelectCardToMove(1))
  let moved = update(selected, KanbanMoveCardTo(99, 0))
  assert_true(
    moved.kanban.cards.any(card => card.id == 1 && card.column_id == 99),
  )
}

///|
test "stale Kanban load restores an optimistically deleted card" {
  let loading = update(initial(), KanbanInit)
  let deleted = update(loading, KanbanDeleteCard(1))
  assert_true(!deleted.kanban.cards.any(card => card.id == 1))
  let restored = update(deleted, KanbanBoardLoaded(101, 0))
  assert_true(restored.kanban.cards.any(card => card.id == 1))
}

///|
test "stale Todo list overwrites a newer toggle result" {
  let base = update(initial(), SwitchApp(Todo))
  let loading = update(base, TodoInit)
  let toggling = update(loading, TodoToggle(1))
  let toggled = update(
    toggling,
    TodoToggled(2201, { id: 1, text: "Review", done: true }, true),
  )
  assert_true(toggled.todo.todos[0].done)
  let stale = update(toggled, TodoListLoaded(201, 0))
  assert_true(!stale.todo.todos[0].done)
}

///|
test "Note load can leave a dangling selected note" {
  let base = update(initial(), SwitchApp(Note))
  let loading = update(base, NoteInit)
  let selected = update(loading, NoteSelect(1))
  let stale = update(selected, NoteListLoaded(301, 1))
  assert_eq(stale.note.selected_note_id, 1)
  assert_true(!stale.note.notes.any(note => note.id == 1))
}

///|
test "Isomorphic suite exploration retains exact app-specific failures" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.states.length(), 1400)
  assert_eq(report.transitions.length(), 2288)
  assert_eq(report.failures.length(), 4)
  assert_eq(report.diagnostics.length(), 0)
  let failures = report.failures
  assert_eq(failures[0].property, "kanban cards reference existing columns")
  assert_eq(failures[0].trace, [
    "KanbanSelectCardToMove(1)", "KanbanMoveCardTo(column=99, index=0)",
  ])
  assert_eq(
    failures[1].property,
    "stale kanban board responses preserve newer board intent",
  )
  assert_eq(failures[1].trace, [
    "KanbanInit", "KanbanDeleteCard(1)", "KanbanBoardLoaded(request=101, fixture=0)",
  ])
  assert_eq(failures[2].property, "selected note remains present")
  assert_eq(failures[2].trace, [
    "SwitchApp(note)", "NoteInit", "NoteSelect(1)", "NoteListLoaded(request=301, fixture=1)",
  ])
  assert_eq(
    failures[3].property,
    "stale todo list responses preserve newer todo mutations",
  )
  assert_eq(failures[3].trace, [
    "SwitchApp(todo)", "TodoDelete(1)", "TodoInit", "TodoDeleted(request=2301, todo=1, success=true)",
    "TodoListLoaded(request=201, fixture=0)",
  ])
}
