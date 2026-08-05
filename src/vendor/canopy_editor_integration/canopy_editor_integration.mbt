///|
// Clean-room behavioral adapter for dowdiness/canopy's Rabbita CodeMirror
// binding and Ideal integration at revision
// cb41945b04801084e8abe1d8edc27eb0cdce4a1c.
//
// DOM/editor handles remain outside this model. Browser callbacks are recorded
// as PendingCallback values and delivered explicitly so lifecycle and response
// ordering can be explored deterministically.

///|
pub(all) enum EditorCommand {
  Mount(Int, String, String)
  SetDocument(Int, String)
  SetReadonly(Int, Bool)
  Unmount(Int)
  ForwardSelection(Int, Int, Int)
} derive(Debug, Eq)

///|
pub fn EditorCommand::to_string(self : EditorCommand) -> String {
  match self {
    Mount(generation, id, host) => "mount:g=\{generation}:id=\{id}:host=\{host}"
    SetDocument(generation, text) =>
      "set-doc:g=\{generation}:len=\{text.length()}"
    SetReadonly(generation, value) => "set-readonly:g=\{generation}:\{value}"
    Unmount(generation) => "unmount:g=\{generation}"
    ForwardSelection(generation, from, to) =>
      "selection:g=\{generation}:\{from}:\{to}"
  }
}

///|
pub(all) enum CallbackKind {
  DocumentChanged(String)
  SelectionChanged(Int, Int)
  FocusChanged(Bool)
} derive(Debug, Eq)

///|
pub(all) struct PendingCallback {
  id : Int
  generation : Int
  revision : Int
  document_id : String
  kind : CallbackKind
} derive(Debug, Eq)

///|
pub(all) struct ContextMenuState {
  open : Bool
  focused : Int?
  item_count : Int
} derive(Debug, Eq)

///|
pub(all) struct Model {
  editor_id : String
  host_id : String
  mounted : Bool
  generation : Int
  active_document : String
  document : String
  accepted_revision : Int
  next_revision : Int
  selection_from : Int
  selection_to : Int
  focused : Bool
  read_only : Bool
  pending : Array[PendingCallback]
  next_callback_id : Int
  commands : Array[EditorCommand]
  context_menu : ContextMenuState
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  MountCompleted
  MountRequested
  UnmountRequested
  BrowserDocumentChanged(String)
  BrowserSelectionChanged(Int, Int)
  BrowserFocusChanged(Bool)
  DeliverCallback(Int)
  SetDocumentRequested(String)
  ToggleReadonly
  SwitchDocument(String)
  ContextMenuOpen
  ContextMenuClose
  ContextMenuFocus(Int)
} derive(Debug, Eq)

///|
fn append_command(model : Model, command : EditorCommand) -> Model {
  let commands = model.commands.copy()
  commands.push(command)
  { ..model, commands, }
}

///|
fn remove_callback(
  pending : Array[PendingCallback],
  callback_id : Int,
) -> (Array[PendingCallback], PendingCallback?) {
  let next : Array[PendingCallback] = []
  let mut found : PendingCallback? = None
  for callback in pending {
    if callback.id == callback_id && found is None {
      found = Some(callback)
    } else {
      next.push(callback)
    }
  }
  (next, found)
}

///|
fn queue_callback(model : Model, kind : CallbackKind) -> Model {
  let pending = model.pending.copy()
  let revision = model.next_revision
  pending.push({
    id: model.next_callback_id,
    generation: model.generation,
    revision,
    document_id: model.active_document,
    kind,
  })
  {
    ..model,
    pending,
    next_callback_id: model.next_callback_id + 1,
    next_revision: revision + 1,
  }
}

///|
fn clamp_selection(value : Int, document : String) -> Int {
  value.max(0).min(document.length())
}

///|
fn apply_callback(model : Model, callback : PendingCallback) -> Model {
  // This intentionally preserves the pinned integration boundary: callbacks
  // carry neither lifecycle generation nor active-document identity through
  // the public Msg, and handle_codemirror applies them without mounted checks.
  match callback.kind {
    DocumentChanged(text) =>
      {
        ..model,
        document: text,
        accepted_revision: callback.revision,
        selection_from: clamp_selection(model.selection_from, text),
        selection_to: clamp_selection(model.selection_to, text),
      }
    SelectionChanged(from, to) => {
      let command = ForwardSelection(model.generation, from, to)
      append_command(
        {
          ..model,
          selection_from: clamp_selection(from, model.document),
          selection_to: clamp_selection(to, model.document),
        },
        command,
      )
    }
    FocusChanged(value) => { ..model, focused: value }
  }
}

///|
pub fn initial() -> Model {
  {
    editor_id: "ideal-editor",
    host_id: "ideal-editor-host",
    mounted: false,
    generation: 1,
    active_document: "doc-a",
    document: "initial",
    accepted_revision: 0,
    next_revision: 1,
    selection_from: 0,
    selection_to: 0,
    focused: false,
    read_only: false,
    pending: [],
    next_callback_id: 1,
    commands: [Mount(1, "ideal-editor", "ideal-editor-host")],
    context_menu: { open: false, focused: None, item_count: 3 },
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    MountCompleted => { ..model, mounted: true }
    MountRequested => {
      let generation = model.generation + 1
      append_command(
        { ..model, mounted: false, generation },
        Mount(generation, model.editor_id, model.host_id),
      )
    }
    UnmountRequested => {
      let generation = model.generation + 1
      append_command(
        { ..model, mounted: false, focused: false, generation },
        Unmount(model.generation),
      )
    }
    BrowserDocumentChanged(text) => queue_callback(model, DocumentChanged(text))
    BrowserSelectionChanged(from, to) =>
      queue_callback(model, SelectionChanged(from, to))
    BrowserFocusChanged(value) => queue_callback(model, FocusChanged(value))
    DeliverCallback(callback_id) => {
      let (pending, callback) = remove_callback(model.pending, callback_id)
      match callback {
        Some(callback) => apply_callback({ ..model, pending, }, callback)
        None => model
      }
    }
    SetDocumentRequested(text) =>
      append_command(
        {
          ..model,
          document: text,
          selection_from: clamp_selection(model.selection_from, text),
          selection_to: clamp_selection(model.selection_to, text),
        },
        SetDocument(model.generation, text),
      )
    ToggleReadonly => {
      let read_only = !model.read_only
      append_command(
        { ..model, read_only, },
        SetReadonly(model.generation, read_only),
      )
    }
    SwitchDocument(document_id) => {
      let generation = model.generation + 1
      let document = if document_id == "doc-a" { "alpha" } else { "beta" }
      append_command(
        {
          ..model,
          active_document: document_id,
          document,
          generation,
          accepted_revision: 0,
          selection_from: 0,
          selection_to: 0,
        },
        SetDocument(generation, document),
      )
    }
    ContextMenuOpen =>
      {
        ..model,
        context_menu: { ..model.context_menu, open: true, focused: Some(0) },
      }
    ContextMenuClose =>
      {
        ..model,
        context_menu: { ..model.context_menu, open: false, focused: None },
      }
    ContextMenuFocus(index) =>
      if model.context_menu.open &&
        index >= 0 &&
        index < model.context_menu.item_count {
        {
          ..model,
          context_menu: { ..model.context_menu, focused: Some(index) },
        }
      } else {
        model
      }
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  if model.mounted {
    result.push(BrowserDocumentChanged("draft"))
    result.push(BrowserDocumentChanged("newer"))
    result.push(BrowserSelectionChanged(0, 2))
    result.push(BrowserSelectionChanged(-1, 999))
    result.push(BrowserFocusChanged(true))
    result.push(SetDocumentRequested("programmatic"))
    result.push(ToggleReadonly)
    result.push(UnmountRequested)
    result.push(
      SwitchDocument(
        if model.active_document == "doc-a" {
          "doc-b"
        } else {
          "doc-a"
        },
      ),
    )
  } else {
    result.push(MountCompleted)
    result.push(MountRequested)
  }
  for callback in model.pending {
    result.push(DeliverCallback(callback.id))
  }
  if model.context_menu.open {
    result.push(ContextMenuFocus(0))
    result.push(ContextMenuFocus(2))
    result.push(ContextMenuFocus(99))
    result.push(ContextMenuClose)
  } else {
    result.push(ContextMenuOpen)
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    BrowserDocumentChanged(text) if text != "draft" =>
      [BrowserDocumentChanged("draft")]
    BrowserSelectionChanged(from, to) if from != 0 || to != 0 =>
      [BrowserSelectionChanged(0, 0)]
    BrowserFocusChanged(true) => [BrowserFocusChanged(false)]
    SetDocumentRequested(text) if text != "" => [SetDocumentRequested("")]
    SwitchDocument(document_id) if document_id != "doc-a" =>
      [SwitchDocument("doc-a")]
    ContextMenuFocus(index) if index != 0 => [ContextMenuFocus(0)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    MountCompleted => "mount-completed"
    MountRequested => "mount-requested"
    UnmountRequested => "unmount-requested"
    BrowserDocumentChanged(text) => "browser-doc:\{text.length()}:\{text}"
    BrowserSelectionChanged(from, to) => "browser-selection:\{from}:\{to}"
    BrowserFocusChanged(value) => "browser-focus:\{value}"
    DeliverCallback(id) => "deliver:\{id}"
    SetDocumentRequested(text) => "set-document:\{text.length()}:\{text}"
    ToggleReadonly => "toggle-readonly"
    SwitchDocument(id) => "switch-document:\{id}"
    ContextMenuOpen => "context-open"
    ContextMenuClose => "context-close"
    ContextMenuFocus(index) => "context-focus:\{index}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    MountCompleted => "MountCompleted(generation=1)"
    MountRequested => "MountRequested"
    UnmountRequested => "UnmountRequested"
    BrowserDocumentChanged(text) =>
      "BrowserDocumentChanged(\{text.escape(quote=true)})"
    BrowserSelectionChanged(from, to) =>
      "BrowserSelectionChanged(from=\{from}, to=\{to})"
    BrowserFocusChanged(value) => "BrowserFocusChanged(\{value})"
    DeliverCallback(id) => "DeliverCallback(id=\{id})"
    SetDocumentRequested(text) =>
      "SetDocumentRequested(\{text.escape(quote=true)})"
    ToggleReadonly => "ToggleReadonly"
    SwitchDocument(id) => "SwitchDocument(\{id.escape(quote=true)})"
    ContextMenuOpen => "ContextMenuOpen"
    ContextMenuClose => "ContextMenuClose"
    ContextMenuFocus(index) => "ContextMenuFocus(\{index})"
  }
}

///|
fn callback_fingerprint(
  output : StringBuilder,
  callback : PendingCallback,
) -> Unit {
  output.write_object(callback.id)
  output.write_char(':')
  output.write_object(callback.generation)
  output.write_char(':')
  output.write_object(callback.revision)
  output.write_char(':')
  output.write_string(callback.document_id)
  output.write_char(':')
  match callback.kind {
    DocumentChanged(text) => {
      output.write_string("doc:")
      output.write_string(text)
    }
    SelectionChanged(from, to) => output.write_string("selection:\{from}:\{to}")
    FocusChanged(value) => output.write_string("focus:\{value}")
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("canopy-editor|mounted=")
  output.write_object(model.mounted)
  output.write_string("|generation=")
  output.write_object(model.generation)
  output.write_string("|active=")
  output.write_string(model.active_document)
  output.write_string("|doc=")
  output.write_string(model.document)
  output.write_string("|accepted=")
  output.write_object(model.accepted_revision)
  output.write_string("|next-revision=")
  output.write_object(model.next_revision)
  output.write_string("|next-callback=")
  output.write_object(model.next_callback_id)
  output.write_string("|commands=")
  for command in model.commands {
    output.write_string(command.to_string())
    output.write_char(';')
  }
  output.write_string("|selection=")
  output.write_object(model.selection_from)
  output.write_char(':')
  output.write_object(model.selection_to)
  output.write_string("|focused=")
  output.write_object(model.focused)
  output.write_string("|readonly=")
  output.write_object(model.read_only)
  output.write_string("|pending=")
  for callback in model.pending {
    callback_fingerprint(output, callback)
    output.write_char(';')
  }
  output.write_string("|menu=")
  output.write_object(model.context_menu.open)
  output.write_char(':')
  match model.context_menu.focused {
    Some(index) => output.write_object(index)
    None => output.write_string("none")
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Canopy editor integration"),
      @html.div(
        class="editor",
        "mounted=\{model.mounted};generation=\{model.generation};document=\{model.active_document};text=\{model.document}",
      ),
      @html.div(
        class="selection",
        "selection=\{model.selection_from}:\{model.selection_to};focused=\{model.focused};readonly=\{model.read_only}",
      ),
      @html.div(
        class="callbacks",
        "pending=\{model.pending.length()};accepted-revision=\{model.accepted_revision}",
      ),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/canopy-editor-integration.json", "src/vendor/canopy_editor_integration/upstream/codemirror.mbt.txt",
    "src/vendor/canopy_editor_integration/upstream/client.mbt.txt", "src/vendor/canopy_editor_integration/upstream/update_codemirror.mbt.txt",
    "src/vendor/canopy_editor_integration/canopy_editor_integration.mbt",
  ]
}

///|
fn callback_for(before : Model, callback_id : Int) -> PendingCallback? {
  for callback in before.pending {
    if callback.id == callback_id {
      return Some(callback)
    }
  }
  None
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "callbacks queued before unmount do not mutate the detached editor",
      fn(before, msg, after) {
        match msg {
          DeliverCallback(callback_id) =>
            match callback_for(before, callback_id) {
              Some(_) if !before.mounted && after.document != before.document =>
                @proped.Fail(
                  "stale document callback changed detached or remounted editor content",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "older document callbacks do not replace newer accepted revisions",
      fn(before, msg, after) {
        match msg {
          DeliverCallback(callback_id) =>
            match callback_for(before, callback_id) {
              Some(callback) if callback.revision < before.accepted_revision &&
                after.accepted_revision < before.accepted_revision =>
                @proped.Fail(
                  "older callback rolled the visible document revision back",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("selection remains inside the visible document", fn(
      model,
      _,
    ) {
      if model.selection_from >= 0 &&
        model.selection_to >= 0 &&
        model.selection_from <= model.document.length() &&
        model.selection_to <= model.document.length() {
        @proped.Pass
      } else {
        @proped.Fail("selection escaped the visible document")
      }
    }),
    @proped.state_property("closed context menus clear focus", fn(model, _) {
      if !model.context_menu.open && model.context_menu.focused is Some(_) {
        @proped.Fail("closed context menu retained a focused item")
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("rendered editor state matches the model", fn(
      model,
      html,
    ) {
      if !html.contains(
          "mounted=\{model.mounted};generation=\{model.generation}",
        ) {
        @proped.Fail("rendered lifecycle does not match model")
      } else if !html.contains("text=\{model.document}") {
        @proped.Fail("rendered document does not match model")
      } else if !html.contains("pending=\{model.pending.length()}") {
        @proped.Fail("rendered pending callback count does not match model")
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
  { cases: 384, max_depth: 12, max_states: 900, seed: 107, shrink_budget: 4096 }
}
