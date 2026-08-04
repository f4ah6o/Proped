///|
// Adapted from dowdiness/incr's typed spreadsheet and Rabbita demo at revision
// afc715b261d99f35245f1a14a2390ae8ad86d7d0 (published incr 0.15.0).
//
// Every transition reconstructs an isolated incremental runtime from the plain
// committed cell text before applying one operation. This preserves the pinned
// Worksheet, parser, trace, equality-backdating, and no-backdate semantics while
// preventing mutable graph objects from leaking between exploration branches.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.

///|
pub(all) struct CellDraft {
  cell : String
  text : String
} derive(Debug, Eq)

///|
pub(all) enum CellValueView {
  IntValue(Int)
  BoolValue(Bool)
  TextValue(String)
  BlankValue
  ErrorValue(String)
} derive(Debug, Eq)

///|
pub(all) struct CellSnapshotView {
  cell : String
  present : Bool
  kind : String
  result : String
  value : CellValueView
} derive(Debug, Eq)

///|
pub(all) struct TraceView {
  recomputed : Array[String]
  changed : Array[String]
  unchanged : Array[String]
} derive(Debug, Eq)

///|
pub(all) struct BackdateProbe {
  history : Array[Int]
  eq_middle_count : Int
  eq_downstream_count : Int
  no_backdate_middle_count : Int
  no_backdate_downstream_count : Int
  eq_value : String
  no_backdate_value : String
} derive(Debug, Eq)

///|
pub(all) struct Model {
  drafts : Array[CellDraft]
  committed : Array[CellDraft]
  selected_cell : String
  editing_cell : String?
  snapshots : Array[CellSnapshotView]
  trace : TraceView
  status : String
  error : String?
  last_edit : String
  probe : BackdateProbe
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SelectCell(String)
  UpdateDraft(String, String)
  ApplySelected
  DeleteSelected
  ResetSheet
  CancelSelected
  BeginInlineEdit(String)
  ApplyInlineEdit(String)
  SetProbeInput(Int)
  ResetProbe
} derive(Debug, Eq)

///|
fn cell_names() -> Array[String] {
  ["A1", "B1", "C1"]
}

///|
fn empty_trace() -> TraceView {
  { recomputed: [], changed: [], unchanged: [] }
}

///|
fn seed_committed() -> Array[CellDraft] {
  [
    { cell: "A1", text: "10" },
    { cell: "B1", text: "=A1 + 1" },
    { cell: "C1", text: "" },
  ]
}

///|
fn text_from(values : Array[CellDraft], cell : String) -> String {
  match values.search_by(value => value.cell == cell) {
    Some(index) => values[index].text
    None => ""
  }
}

///|
fn update_text(
  values : Array[CellDraft],
  cell : String,
  text : String,
) -> Array[CellDraft] {
  match values.search_by(value => value.cell == cell) {
    Some(_) =>
      values.map(value => {
        if value.cell == cell {
          { ..value, text, }
        } else {
          value
        }
      })
    None => {
      let next = values.copy()
      next.push({ cell, text })
      next
    }
  }
}

///|
fn cell_id(sheet : @sheet.Worksheet, cell : String) -> @sheet.CellId {
  @sheet.CellId::of(sheet.sheet_id(), cell)
}

///|
fn all_cell_ids(sheet : @sheet.Worksheet) -> Array[@sheet.CellId] {
  cell_names().map(cell => cell_id(sheet, cell))
}

///|
fn build_worksheet(committed : Array[CellDraft]) -> @sheet.Worksheet {
  let runtime = @incr.Runtime()
  let worksheet = @sheet.Worksheet(runtime, @sheet.SheetId(1))
  for cell in cell_names() {
    let text = text_from(committed, cell)
    if !text.is_empty() {
      match @demo.parse_cell_text_op(cell_id(worksheet, cell), text) {
        Ok(operation) =>
          ignore(
            @demo.run_op(
              worksheet,
              operation,
              capture=all_cell_ids(worksheet),
              trace_cells=all_cell_ids(worksheet),
            ),
          )
        Err(_) => abort("committed spreadsheet text failed to replay: " + cell)
      }
    }
  }
  worksheet
}

///|
fn value_view(result : @sheet.CellResult) -> CellValueView {
  match result {
    @sheet.CellResult::Ok(@sheet.CellValue::Int(value)) => IntValue(value)
    @sheet.CellResult::Ok(@sheet.CellValue::Bool(value)) => BoolValue(value)
    @sheet.CellResult::Ok(@sheet.CellValue::Text(value)) => TextValue(value)
    @sheet.CellResult::Ok(@sheet.CellValue::Blank) => BlankValue
    @sheet.CellResult::ParseError(message) =>
      ErrorValue("ParseError(" + message + ")")
    @sheet.CellResult::TypeError(message) =>
      ErrorValue("TypeError(" + message + ")")
    @sheet.CellResult::RefError(message) =>
      ErrorValue("RefError(" + message + ")")
    @sheet.CellResult::CycleError(message) =>
      ErrorValue("CycleError(" + message + ")")
  }
}

///|
fn snapshot_view(snapshot : @sheet.CellSnapshot) -> CellSnapshotView {
  {
    cell: snapshot.id.address,
    present: snapshot.present,
    kind: @demo.snapshot_kind(snapshot),
    result: @demo.format_cell_result(snapshot.result),
    value: value_view(snapshot.result),
  }
}

///|
fn snapshots_for(worksheet : @sheet.Worksheet) -> Array[CellSnapshotView] {
  cell_names().map(cell => {
    snapshot_view(worksheet.inspect_cell(cell_id(worksheet, cell)))
  })
}

///|
fn trace_view(trace : @sheet.WorksheetTrace) -> TraceView {
  {
    recomputed: @demo.cell_id_strings(trace.recomputed),
    changed: @demo.cell_id_strings(trace.changed),
    unchanged: @demo.cell_id_strings(trace.unchanged),
  }
}

///|
fn snapshot_committed(committed : Array[CellDraft]) -> Array[CellSnapshotView] {
  let worksheet = build_worksheet(committed)
  let snapshots = snapshots_for(worksheet)
  worksheet.dispose()
  snapshots
}

///|
fn parse_error_text(error : @demo.FormulaTextParseError) -> String {
  match error {
    @demo.FormulaTextParseError::EmptyInput => "empty input"
    @demo.FormulaTextParseError::InvalidInteger(value) =>
      "invalid integer: " + value
    @demo.FormulaTextParseError::InvalidCellReference(value) =>
      "invalid cell reference: " + value
    @demo.FormulaTextParseError::UnsupportedFormula(value) =>
      "unsupported formula: " + value
  }
}

///|
fn apply_text_edit(model : Model, cell : String, text : String) -> Model {
  let trimmed = text.trim().to_owned()
  if trimmed.is_empty() {
    return {
      ..model,
      selected_cell: cell,
      drafts: update_text(model.drafts, cell, text_from(model.committed, cell)),
      editing_cell: None,
      trace: empty_trace(),
      status: "Left " + cell + " unchanged.",
      error: None,
    }
  }
  let worksheet = build_worksheet(model.committed)
  match @demo.parse_cell_text_op(cell_id(worksheet, cell), trimmed) {
    Err(error) => {
      worksheet.dispose()
      {
        ..model,
        selected_cell: cell,
        editing_cell: None,
        trace: empty_trace(),
        status: "Edit not applied.",
        error: Some(parse_error_text(error)),
      }
    }
    Ok(operation) => {
      let result = @demo.run_op(
        worksheet,
        operation,
        capture=all_cell_ids(worksheet),
        trace_cells=all_cell_ids(worksheet),
      )
      let committed = update_text(model.committed, cell, trimmed)
      let snapshots = snapshots_for(worksheet)
      let trace = trace_view(result.trace)
      worksheet.dispose()
      {
        ..model,
        drafts: update_text(model.drafts, cell, trimmed),
        committed,
        selected_cell: cell,
        editing_cell: None,
        snapshots,
        trace,
        status: "Applied " + cell + " <- " + trimmed + ".",
        error: None,
        last_edit: cell + " <- " + trimmed,
      }
    }
  }
}

///|
fn delete_selected(model : Model) -> Model {
  let cell = model.selected_cell
  let worksheet = build_worksheet(model.committed)
  let result = @demo.run_op(
    worksheet,
    @demo.SheetOp::Delete(cell_id(worksheet, cell)),
    capture=all_cell_ids(worksheet),
    trace_cells=all_cell_ids(worksheet),
  )
  let committed = update_text(model.committed, cell, "")
  let snapshots = snapshots_for(worksheet)
  let trace = trace_view(result.trace)
  worksheet.dispose()
  {
    ..model,
    drafts: update_text(model.drafts, cell, ""),
    committed,
    editing_cell: None,
    snapshots,
    trace,
    status: "Deleted " + cell + ".",
    error: None,
    last_edit: "delete " + cell,
  }
}

///|
fn downstream_label(flag : Bool) -> String {
  if flag {
    "even"
  } else {
    "odd"
  }
}

///|
fn replay_probe(history : Array[Int]) -> BackdateProbe {
  let eq_runtime = @incr.Runtime()
  let eq_input = @incr.Input(eq_runtime, 4, label="eq-input")
  let mut eq_middle_count = 0
  let eq_middle = @incr.Derived(
    eq_runtime,
    () => {
      eq_middle_count = eq_middle_count + 1
      eq_input.get() % 2 == 0
    },
    label="eq-middle",
  )
  let mut eq_downstream_count = 0
  let eq_downstream = @incr.Derived(
    eq_runtime,
    () => {
      eq_downstream_count = eq_downstream_count + 1
      downstream_label(eq_middle.get_or_abort())
    },
    label="eq-downstream",
  )
  let mut eq_value = eq_downstream.read_or_abort()
  for value in history {
    eq_input.set(value)
    eq_value = eq_downstream.read_or_abort()
  }

  let no_runtime = @incr.Runtime()
  let no_input = @incr.Input(no_runtime, 4, label="no-backdate-input")
  let mut no_backdate_middle_count = 0
  let no_middle = @incr.Derived::derived_no_backdate(
    no_runtime,
    () => {
      no_backdate_middle_count = no_backdate_middle_count + 1
      no_input.get() % 2 == 0
    },
    label="no-backdate-middle",
  )
  let mut no_backdate_downstream_count = 0
  let no_downstream = @incr.Derived(
    no_runtime,
    () => {
      no_backdate_downstream_count = no_backdate_downstream_count + 1
      downstream_label(no_middle.get_or_abort())
    },
    label="no-backdate-downstream",
  )
  let mut no_backdate_value = no_downstream.read_or_abort()
  for value in history {
    no_input.set(value)
    no_backdate_value = no_downstream.read_or_abort()
  }
  {
    history: history.copy(),
    eq_middle_count,
    eq_downstream_count,
    no_backdate_middle_count,
    no_backdate_downstream_count,
    eq_value,
    no_backdate_value,
  }
}

///|
pub fn initial() -> Model {
  let committed = seed_committed()
  {
    drafts: committed.copy(),
    committed,
    selected_cell: "B1",
    editing_cell: None,
    snapshots: snapshot_committed(seed_committed()),
    trace: empty_trace(),
    status: "Ready.",
    error: None,
    last_edit: "Seed sheet",
    probe: replay_probe([]),
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SelectCell(cell) =>
      {
        ..model,
        selected_cell: cell,
        editing_cell: None,
        status: "Selected " + cell + ".",
        error: None,
      }
    UpdateDraft(cell, text) =>
      {
        ..model,
        drafts: update_text(model.drafts, cell, text),
        selected_cell: cell,
        status: "Drafting " + cell + ".",
        error: None,
      }
    ApplySelected =>
      apply_text_edit(
        model,
        model.selected_cell,
        text_from(model.drafts, model.selected_cell),
      )
    DeleteSelected => delete_selected(model)
    ResetSheet => initial()
    CancelSelected => {
      let cell = model.selected_cell
      {
        ..model,
        drafts: update_text(
          model.drafts,
          cell,
          text_from(model.committed, cell),
        ),
        editing_cell: None,
        trace: empty_trace(),
        status: "Reverted " + cell + ".",
        error: None,
      }
    }
    BeginInlineEdit(cell) =>
      {
        ..model,
        selected_cell: cell,
        editing_cell: Some(cell),
        status: "Inline editing " + cell + ".",
        error: None,
      }
    ApplyInlineEdit(cell) =>
      if model.editing_cell == Some(cell) {
        apply_text_edit(model, cell, text_from(model.drafts, cell))
      } else {
        model
      }
    SetProbeInput(value) => {
      let history = model.probe.history.copy()
      if history.length() < 3 {
        history.push(value)
        {
          ..model,
          probe: replay_probe(history),
          status: "Probed input " + value.to_string() + ".",
        }
      } else {
        model
      }
    }
    ResetProbe =>
      { ..model, probe: replay_probe([]), status: "Reset backdating probe." }
  }
}

///|
fn draft_is_dirty(model : Model, cell : String) -> Bool {
  text_from(model.drafts, cell) != text_from(model.committed, cell)
}

///|
fn push_draft_action(
  actions : Array[Msg],
  model : Model,
  cell : String,
  text : String,
) -> Unit {
  if text_from(model.drafts, cell) != text {
    actions.push(UpdateDraft(cell, text))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  for cell in cell_names() {
    if model.selected_cell != cell {
      result.push(SelectCell(cell))
    }
  }
  for value in ["", "oops", "0", "1", "6", "10", "2147483647"] {
    push_draft_action(result, model, "A1", value)
  }
  for value in ["=A1", "=A1 + 1", "=A1 * 2", "=if(A1 > 10, 1, 0)", "=hello"] {
    push_draft_action(result, model, "B1", value)
    push_draft_action(result, model, "C1", value)
  }
  if draft_is_dirty(model, model.selected_cell) {
    result.push(ApplySelected)
    result.push(CancelSelected)
  }
  if !text_from(model.committed, model.selected_cell).is_empty() {
    result.push(DeleteSelected)
  }
  match model.editing_cell {
    Some(cell) => result.push(ApplyInlineEdit(cell))
    None =>
      for cell in cell_names() {
        result.push(BeginInlineEdit(cell))
      }
  }
  if model.committed != seed_committed() ||
    model.drafts != seed_committed() ||
    model.error is Some(_) {
    result.push(ResetSheet)
  }
  if model.probe.history.length() < 3 {
    for value in [4, 5, 6] {
      result.push(SetProbeInput(value))
    }
  }
  if !model.probe.history.is_empty() {
    result.push(ResetProbe)
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    UpdateDraft(cell, value) if value != "" =>
      [UpdateDraft(cell, ""), UpdateDraft(cell, "0"), UpdateDraft(cell, "1")]
    SelectCell(cell) if cell != "A1" => [SelectCell("A1")]
    BeginInlineEdit(cell) if cell != "A1" => [BeginInlineEdit("A1")]
    ApplyInlineEdit(cell) if cell != "A1" => [ApplyInlineEdit("A1")]
    SetProbeInput(value) if value != 4 => [SetProbeInput(4)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SelectCell(cell) => "select:" + cell
    UpdateDraft(cell, value) =>
      "draft:" + cell + ":" + value.length().to_string() + ":" + value
    ApplySelected => "apply-selected"
    DeleteSelected => "delete-selected"
    ResetSheet => "reset-sheet"
    CancelSelected => "cancel-selected"
    BeginInlineEdit(cell) => "begin-inline:" + cell
    ApplyInlineEdit(cell) => "apply-inline:" + cell
    SetProbeInput(value) => "probe-input:" + value.to_string()
    ResetProbe => "reset-probe"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SelectCell(cell) => "SelectCell(" + cell + ")"
    UpdateDraft(cell, value) =>
      "UpdateDraft(" + cell + ", " + value.escape(quote=true) + ")"
    ApplySelected => "ApplySelected"
    DeleteSelected => "DeleteSelected"
    ResetSheet => "ResetSheet"
    CancelSelected => "CancelSelected"
    BeginInlineEdit(cell) => "BeginInlineEdit(" + cell + ")"
    ApplyInlineEdit(cell) => "ApplyInlineEdit(" + cell + ")"
    SetProbeInput(value) => "SetProbeInput(" + value.to_string() + ")"
    ResetProbe => "ResetProbe"
  }
}

///|
fn write_value(output : StringBuilder, value : CellValueView) -> Unit {
  match value {
    IntValue(value) => {
      output.write_string("int:")
      output.write_object(value)
    }
    BoolValue(value) => {
      output.write_string("bool:")
      output.write_object(value)
    }
    TextValue(value) => {
      output.write_string("text:")
      output.write_object(value.length())
      output.write_char(':')
      output.write_string(value)
    }
    BlankValue => output.write_string("blank")
    ErrorValue(value) => {
      output.write_string("error:")
      output.write_object(value.length())
      output.write_char(':')
      output.write_string(value)
    }
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("incr-typed-spreadsheet|selected=")
  output.write_string(model.selected_cell)
  output.write_string("|editing=")
  match model.editing_cell {
    Some(cell) => output.write_string(cell)
    None => output.write_string("none")
  }
  for value in model.drafts {
    output.write_string("|draft=")
    output.write_string(value.cell)
    output.write_char(':')
    output.write_object(value.text.length())
    output.write_char(':')
    output.write_string(value.text)
  }
  for value in model.committed {
    output.write_string("|committed=")
    output.write_string(value.cell)
    output.write_char(':')
    output.write_object(value.text.length())
    output.write_char(':')
    output.write_string(value.text)
  }
  for snapshot in model.snapshots {
    output.write_string("|snapshot=")
    output.write_string(snapshot.cell)
    output.write_char(':')
    output.write_object(snapshot.present)
    output.write_char(':')
    output.write_string(snapshot.kind)
    output.write_char(':')
    write_value(output, snapshot.value)
  }
  output.write_string("|trace-r=")
  output.write_string(model.trace.recomputed.join(","))
  output.write_string("|trace-c=")
  output.write_string(model.trace.changed.join(","))
  output.write_string("|trace-u=")
  output.write_string(model.trace.unchanged.join(","))
  output.write_string("|probe=")
  for value in model.probe.history {
    output.write_object(value)
    output.write_char(',')
  }
  output.write_object(model.probe.eq_middle_count)
  output.write_char(':')
  output.write_object(model.probe.eq_downstream_count)
  output.write_char(':')
  output.write_object(model.probe.no_backdate_middle_count)
  output.write_char(':')
  output.write_object(model.probe.no_backdate_downstream_count)
  output.write_string("|error=")
  match model.error {
    Some(error) => output.write_string(error)
    None => output.write_string("none")
  }
  output.to_string()
}

///|
fn snapshot_for(model : Model, cell : String) -> CellSnapshotView? {
  match model.snapshots.search_by(snapshot => snapshot.cell == cell) {
    Some(index) => Some(model.snapshots[index])
    None => None
  }
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let rows : Array[@rabbita.Html] = []
  for snapshot in model.snapshots {
    rows.push(
      @html.li(
        class="cell " + snapshot.kind,
        snapshot.cell + "=" + snapshot.result,
      ),
    )
  }
  let error = match model.error {
    Some(message) => @html.p(class="error", message)
    None => @html.nothing
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("incr typed spreadsheet"),
      @html.p(class="selection", "selected=" + model.selected_cell),
      @html.ul(class="cells", rows),
      @html.p(
        class="trace",
        "recomputed=" +
        model.trace.recomputed.join(",") +
        ";changed=" +
        model.trace.changed.join(",") +
        ";unchanged=" +
        model.trace.unchanged.join(","),
      ),
      @html.p(
        class="backdating",
        "eq=" +
        model.probe.eq_middle_count.to_string() +
        "/" +
        model.probe.eq_downstream_count.to_string() +
        ";no-backdate=" +
        model.probe.no_backdate_middle_count.to_string() +
        "/" +
        model.probe.no_backdate_downstream_count.to_string(),
      ),
      error,
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/incr-typed-spreadsheet.json", "src/vendor/incr_typed_spreadsheet/upstream/model.mbt.txt",
    "src/vendor/incr_typed_spreadsheet/upstream/grid_snapshot_cache.mbt.txt", "src/vendor/incr_typed_spreadsheet_core/formula.mbt",
    "src/vendor/incr_typed_spreadsheet_core/sheet.mbt", "src/vendor/incr_typed_spreadsheet_demo/formula_text_parser.mbt",
    "src/vendor/incr_typed_spreadsheet/incr_typed_spreadsheet.mbt",
  ]
}

///|
fn addition_wrapped(model : Model) -> Bool {
  if text_from(model.committed, "B1") != "=A1 + 1" {
    return false
  }
  match (snapshot_for(model, "A1"), snapshot_for(model, "B1")) {
    (Some(a), Some(b)) =>
      match (a.value, b.value) {
        (IntValue(left), IntValue(result)) => left >= 0 && result < left
        _ => false
      }
    _ => false
  }
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("positive formula addition does not wrap backward", fn(
      model,
      _,
    ) {
      if addition_wrapped(model) {
        @proped.Fail("A1 + 1 wrapped below the non-negative A1 operand")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("parse failure preserves committed worksheet", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        ApplySelected if after.error is Some(_) =>
          if before.committed == after.committed &&
            before.snapshots == after.snapshots {
            @proped.Pass
          } else {
            @proped.Fail("invalid draft changed committed cells or snapshots")
          }
        _ => @proped.Pass
      }
    }),
    @proped.state_property("deleted input invalidates dependent formula", fn(
      model,
      _,
    ) {
      if text_from(model.committed, "A1").is_empty() &&
        text_from(model.committed, "B1") == "=A1 + 1" {
        match snapshot_for(model, "B1") {
          Some(snapshot) if snapshot.value is ErrorValue(_) => @proped.Pass
          _ => @proped.Fail("B1 did not expose an error after deleting A1")
        }
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property(
      "Eq and no-backdate probes preserve declared semantics",
      fn(model, _) {
        if model.probe.history == [6] {
          if model.probe.eq_middle_count == 2 &&
            model.probe.eq_downstream_count == 1 &&
            model.probe.no_backdate_middle_count == 2 &&
            model.probe.no_backdate_downstream_count == 2 {
            @proped.Pass
          } else {
            @proped.Fail(
              "stable parity did not distinguish Eq backdating from no-backdate",
            )
          }
        } else {
          @proped.Pass
        }
      },
    ),
    @proped.state_property(
      "worksheet trace records changed formula dependents",
      fn(model, _) {
        if model.last_edit == "A1 <- 2147483647" &&
          text_from(model.committed, "B1") == "=A1 + 1" {
          if model.trace.recomputed.contains("B1") &&
            model.trace.changed.contains("B1") {
            @proped.Pass
          } else {
            @proped.Fail("B1 was not classified as recomputed and changed")
          }
        } else {
          @proped.Pass
        }
      },
    ),
    @proped.transition_property("stale inline apply is idempotent", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        ApplyInlineEdit(cell) if before.editing_cell != Some(cell) =>
          if before == after {
            @proped.Pass
          } else {
            @proped.Fail("stale inline blur reapplied an edit")
          }
        _ => @proped.Pass
      }
    }),
    @proped.state_property("rendered spreadsheet state matches model", fn(
      model,
      html,
    ) {
      if !html.contains("selected=" + model.selected_cell) {
        @proped.Fail("rendered selection does not match model")
      } else if !html.contains(
          "eq=" +
          model.probe.eq_middle_count.to_string() +
          "/" +
          model.probe.eq_downstream_count.to_string(),
        ) {
        @proped.Fail("rendered backdating counts do not match model")
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
  { cases: 448, max_depth: 10, max_states: 900, seed: 83, shrink_budget: 8192 }
}
