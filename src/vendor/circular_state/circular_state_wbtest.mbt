///|
test "workspace sync leaves a task modal without its selected task" {
  let opened = update(initial(), SelectTask("TSK-1"))
  assert_eq(opened.selection_task_id, Some("TSK-1"))
  assert_eq(opened.modal, TaskModal)
  let synced = update(
    opened,
    WorkspaceMutated(TaskQuickMutation, {
      revision: 1,
      tasks: [{ id: "TSK-2", title: "Write summary" }],
    }),
  )
  assert_eq(synced.selection_task_id, None)
  assert_eq(synced.modal, TaskModal)
}

///|
test "Circular exploration minimizes dangling task modal" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_eq(report.failures.length(), 1)
  let failure = report.failures[0]
  assert_eq(failure.property, "task modals retain an existing selected task")
  assert_eq(failure.trace, [
    "SelectTask(\"TSK-1\")", "WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)",
  ])
  assert_eq(failure.structured_trace.length(), 2)
}

///|
test "Circular exploration covers modal route menu and mutation paths" {
  let report = @proped.run(machine(), properties(), default_config())
  assert_true(report.states.length() >= 300)
  let prefixes = [
    "select-task:", "open-completion:", "toggle-menu:", "route:", "task-state:",
    "workspace-mutated:", "workspace-failed:",
  ]
  for prefix in prefixes {
    assert_true(
      report.transitions.any(transition => {
        transition.action_id.has_prefix(prefix)
      }),
    )
  }
}

///|
test "Circular NoOp and route changes preserve generic invariants" {
  let model = update(initial(), SelectTask("TSK-1"))
  assert_eq(update(model, NoOp), model)
  let moved = update(model, RouteChanged("today"))
  assert_eq(moved.modal, NoModal)
  assert_eq(moved.selection_task_id, None)
}
