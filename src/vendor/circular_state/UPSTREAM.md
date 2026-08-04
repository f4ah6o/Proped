# Circular state adapter provenance

- Repository: `CAIMEOX/circular`
- Revision: `bf8549a9c13505f3dc5632347acfffbba864c406`
- Module-declared license: Apache-2.0
- Relevant upstream paths:
  - `web/state/model.mbt`
  - `web/state/messages.mbt`
  - `web/updater/update.mbt`
  - `web/updater/task.mbt`
  - `web/updater/modal_update.mbt`
  - `web/updater/workspace_sync.mbt`
  - `web/updater/workspace_update.mbt`
  - `web/updater/overlay.mbt`
- Primary source hash: `web/updater/workspace_sync.mbt`
- SHA-256: dafc8ae49184ffa6793d6a301d62429a8d4446f5bb7669c323e32165bce01e35

The pinned revision declares Apache-2.0 in `moon.mod` but does not include a standalone license file. No upstream source is copied into this directory. `circular_state.mbt` is a clean-room finite behavioral adapter based on the public message and state boundaries.

The adapter preserves these observed semantics:

- selecting an existing task opens `TaskModal` and stores its task ID;
- successful workspace synchronization keeps a selected task only when the returned workspace still contains it;
- workspace synchronization preserves the current modal before mutation-specific cleanup;
- `TaskQuickMutation` clears the task menu but does not close a task modal;
- route changes and explicit modal closure clear task selection and modal state;
- command execution is replaced by deterministic `EffectDescriptor` records.

The temporary pinned-source probe executed `open_task_editor` followed by `sync_workspace` with a task-free workspace and observed `modal=TaskModal` with `selection.task_id=None`.
