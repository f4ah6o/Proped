///|
// Adapted from shiguri-01/ensenzu app/src at revision
// f1fbec776a393e7023c8fa8324ea26c0774752e5.
//
// Changes from upstream:
// - expose the update model as a deterministic native package;
// - replace browser download with a DomCommand effect descriptor;
// - use a finite field/value action corpus and browserless Rabbita view;
// - preserve upstream numeric parsing, pending-input classification, diagram
//   calculation, previous-result retention, reset, and source-switch behavior.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md.
pub(all) struct AppParams {
  input_source : InputSource
  phase_voltage : Double
  frequency : Double
  poles : Int
  phases : Int
  r1 : Double
  x1 : Double
  r2 : Double
  x2 : Double
  xm : Double
  core_loss_resistance : Double
  mechanical_loss : Double
  no_load_input_power : Double
  no_load_current : Double
  locked_rotor_voltage : Double
  locked_rotor_input_power : Double
  locked_rotor_current : Double
  width : Double
  height : Double
  output_power : Double
} derive(Debug, Eq)

///|
pub(all) struct AppFields {
  input_source : InputSource
  phase_voltage : String
  frequency : String
  poles : String
  phases : String
  r1 : String
  x1 : String
  r2 : String
  x2 : String
  xm : String
  core_loss_resistance : String
  mechanical_loss : String
  no_load_input_power : String
  no_load_current : String
  locked_rotor_voltage : String
  locked_rotor_input_power : String
  locked_rotor_current : String
  width : String
  height : String
  output_power : String
} derive(Debug, Eq)

///|
pub(all) enum InputSource {
  LTypeEquivalentCircuit
  NoLoadLockedRotorTest
} derive(Debug, Eq)

///|
pub(all) enum FieldKey {
  PhaseVoltage
  Frequency
  Poles
  Phases
  R1
  X1
  R2
  X2
  Xm
  CoreLossResistance
  MechanicalLoss
  NoLoadInputPower
  NoLoadCurrent
  LockedRotorVoltage
  LockedRotorInputPower
  LockedRotorCurrent
  Width
  Height
  OutputPower
} derive(Debug, Eq)

///|
pub(all) struct Model {
  fields : AppFields
  svg : String
  characteristics : @ensenzu.CircleDiagramCharacteristics?
  line_lengths : @ensenzu.CharacteristicLineLengths?
  error : String?
  pending_input : Bool
  show_advanced : Bool
  confirm_reset : Bool
  pending_effects : Array[@external.EffectDescriptor]
  next_effect_id : Int
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  Change(FieldKey, String)
  ChangeInputSource(InputSource)
  RequestReset
  Reset
  CancelReset
  Download
  ToggleAdvanced
} derive(Debug, Eq)

///|
pub(all) suberror AppInputError {
  InvalidField(String, String)
} derive(Debug)

///|
priv suberror RenderError {
  RenderError(String)
}

///|
priv struct RenderResult {
  svg : String
  characteristics : @ensenzu.CircleDiagramCharacteristics?
  line_lengths : @ensenzu.CharacteristicLineLengths?
}

///|
const DEFAULT_APP_POINT_COUNT : Int = 96

///|
const DEFAULT_APP_MIN_SLIP : Double = 0.01

///|
const MAX_SVG_WIDTH : Double = 1800.0

///|
const MAX_SVG_HEIGHT : Double = 1400.0

///|
pub fn default_app_params() -> AppParams {
  let sample = @ensenzu.example_params()
  {
    input_source: NoLoadLockedRotorTest,
    phase_voltage: sample.phase_voltage,
    frequency: sample.frequency,
    poles: sample.poles,
    phases: sample.phases,
    r1: sample.r1,
    x1: sample.x1,
    r2: sample.r2,
    x2: sample.x2,
    xm: sample.xm,
    core_loss_resistance: sample.core_loss_resistance,
    mechanical_loss: sample.mechanical_loss,
    no_load_input_power: 110.0,
    no_load_current: 3.65,
    locked_rotor_voltage: 46.19,
    locked_rotor_input_power: 900.0,
    locked_rotor_current: 10.0,
    width: 900.0,
    height: 640.0,
    output_power: 1000.0,
  }
}

///|
fn AppFields::from_params(params : AppParams) -> Self {
  {
    input_source: params.input_source,
    phase_voltage: params.phase_voltage.to_string(),
    frequency: params.frequency.to_string(),
    poles: params.poles.to_string(),
    phases: params.phases.to_string(),
    r1: params.r1.to_string(),
    x1: params.x1.to_string(),
    r2: params.r2.to_string(),
    x2: params.x2.to_string(),
    xm: params.xm.to_string(),
    core_loss_resistance: params.core_loss_resistance.to_string(),
    mechanical_loss: params.mechanical_loss.to_string(),
    no_load_input_power: params.no_load_input_power.to_string(),
    no_load_current: params.no_load_current.to_string(),
    locked_rotor_voltage: params.locked_rotor_voltage.to_string(),
    locked_rotor_input_power: params.locked_rotor_input_power.to_string(),
    locked_rotor_current: params.locked_rotor_current.to_string(),
    width: params.width.to_string(),
    height: params.height.to_string(),
    output_power: params.output_power.to_string(),
  }
}

///|
pub fn default_app_fields() -> AppFields {
  AppFields::from_params(default_app_params())
}

///|
fn AppFields::set(self : Self, key : FieldKey, value : String) -> Self {
  match key {
    PhaseVoltage => { ..self, phase_voltage: value }
    Frequency => { ..self, frequency: value }
    Poles => { ..self, poles: value }
    Phases => { ..self, phases: value }
    R1 => { ..self, r1: value }
    X1 => { ..self, x1: value }
    R2 => { ..self, r2: value }
    X2 => { ..self, x2: value }
    Xm => { ..self, xm: value }
    CoreLossResistance => { ..self, core_loss_resistance: value }
    MechanicalLoss => { ..self, mechanical_loss: value }
    NoLoadInputPower => { ..self, no_load_input_power: value }
    NoLoadCurrent => { ..self, no_load_current: value }
    LockedRotorVoltage => { ..self, locked_rotor_voltage: value }
    LockedRotorInputPower => { ..self, locked_rotor_input_power: value }
    LockedRotorCurrent => { ..self, locked_rotor_current: value }
    Width => { ..self, width: value }
    Height => { ..self, height: value }
    OutputPower => { ..self, output_power: value }
  }
}

///|
fn AppFields::get(self : Self, key : FieldKey) -> String {
  match key {
    PhaseVoltage => self.phase_voltage
    Frequency => self.frequency
    Poles => self.poles
    Phases => self.phases
    R1 => self.r1
    X1 => self.x1
    R2 => self.r2
    X2 => self.x2
    Xm => self.xm
    CoreLossResistance => self.core_loss_resistance
    MechanicalLoss => self.mechanical_loss
    NoLoadInputPower => self.no_load_input_power
    NoLoadCurrent => self.no_load_current
    LockedRotorVoltage => self.locked_rotor_voltage
    LockedRotorInputPower => self.locked_rotor_input_power
    LockedRotorCurrent => self.locked_rotor_current
    Width => self.width
    Height => self.height
    OutputPower => self.output_power
  }
}

///|
fn parse_double(label : String, value : String) -> Double raise AppInputError {
  try @string.parse_double(value) catch {
    _ => raise InvalidField(label, "数値を入力してください")
  } noraise {
    x => x
  }
}

///|
fn parse_int(label : String, value : String) -> Int raise AppInputError {
  try @string.parse_int(value) catch {
    _ => raise InvalidField(label, "整数を入力してください")
  } noraise {
    x => x
  }
}

///|
fn is_blank_or_partial_number(value : String) -> Bool {
  value == "" ||
  value == "." ||
  value == "0." ||
  value == "+." ||
  value == "+0."
}

///|
fn FieldKey::has_positive_decimal_constraint(self : Self) -> Bool {
  match self {
    PhaseVoltage
    | Frequency
    | R2
    | Xm
    | CoreLossResistance
    | NoLoadInputPower
    | NoLoadCurrent
    | LockedRotorVoltage
    | LockedRotorInputPower
    | LockedRotorCurrent
    | Width
    | Height
    | OutputPower => true
    _ => false
  }
}

///|
fn FieldKey::has_positive_integer_constraint(self : Self) -> Bool {
  match self {
    Poles | Phases => true
    _ => false
  }
}

///|
fn FieldKey::is_pending_value(self : Self, value : String) -> Bool {
  if self.has_positive_decimal_constraint() {
    is_blank_or_partial_number(value) || value == "0" || value == "+0"
  } else if self.has_positive_integer_constraint() {
    value == "" || value == "+"
  } else {
    is_blank_or_partial_number(value)
  }
}

///|
pub fn AppFields::to_params(self : Self) -> AppParams raise AppInputError {
  let phase_voltage = parse_double("相電圧", self.phase_voltage)
  let frequency = parse_double("周波数", self.frequency)
  let poles = parse_int("極数", self.poles)
  let phases = parse_int("相数", self.phases)
  let width = parse_double("SVG幅", self.width)
  let height = parse_double("SVG高さ", self.height)
  let output_power = parse_double("出力電力", self.output_power)
  let params : AppParams = match self.input_source {
    LTypeEquivalentCircuit =>
      {
        input_source: self.input_source,
        phase_voltage,
        frequency,
        poles,
        phases,
        width,
        height,
        output_power,
        r1: parse_double("一次抵抗 r1", self.r1),
        x1: parse_double("一次漏れリアクタンス x1", self.x1),
        r2: parse_double("二次抵抗 r2", self.r2),
        x2: parse_double("二次漏れリアクタンス x2", self.x2),
        xm: parse_double("励磁リアクタンス xm", self.xm),
        core_loss_resistance: parse_double(
          "鉄損抵抗",
          self.core_loss_resistance,
        ),
        mechanical_loss: parse_double("機械損", self.mechanical_loss),
        no_load_input_power: 0.0,
        no_load_current: 0.0,
        locked_rotor_voltage: 0.0,
        locked_rotor_input_power: 0.0,
        locked_rotor_current: 0.0,
      }
    NoLoadLockedRotorTest =>
      {
        input_source: self.input_source,
        phase_voltage,
        frequency,
        poles,
        phases,
        width,
        height,
        output_power,
        r1: parse_double("一次抵抗 r1", self.r1),
        x1: 0.0,
        r2: 0.0,
        x2: 0.0,
        xm: 0.0,
        core_loss_resistance: 0.0,
        mechanical_loss: parse_double("機械損", self.mechanical_loss),
        no_load_input_power: parse_double(
          "無負荷入力",
          self.no_load_input_power,
        ),
        no_load_current: parse_double("無負荷電流", self.no_load_current),
        locked_rotor_voltage: parse_double(
          "拘束相電圧",
          self.locked_rotor_voltage,
        ),
        locked_rotor_input_power: parse_double(
          "拘束入力",
          self.locked_rotor_input_power,
        ),
        locked_rotor_current: parse_double(
          "拘束電流",
          self.locked_rotor_current,
        ),
      }
  }
  params.validate_for_interactive_render()
  params
}

///|
fn AppParams::validate_for_interactive_render(
  self : Self,
) -> Unit raise AppInputError {
  guard self.width <= MAX_SVG_WIDTH else {
    raise InvalidField("SVG幅", "\{MAX_SVG_WIDTH}以下にしてください")
  }
  guard self.height <= MAX_SVG_HEIGHT else {
    raise InvalidField(
      "SVG高さ",
      "\{MAX_SVG_HEIGHT}以下にしてください",
    )
  }
}

///|
fn AppParams::to_circuit_params(
  self : Self,
) -> @ensenzu.CircuitParams raise @ensenzu.CircleDiagramError {
  match self.input_source {
    LTypeEquivalentCircuit =>
      {
        phase_voltage: self.phase_voltage,
        frequency: self.frequency,
        poles: self.poles,
        phases: self.phases,
        r1: self.r1,
        x1: self.x1,
        r2: self.r2,
        x2: self.x2,
        xm: self.xm,
        core_loss_resistance: self.core_loss_resistance,
        mechanical_loss: self.mechanical_loss,
      }
    NoLoadLockedRotorTest =>
      @ensenzu.circuit_params_from_tests({
        phase_voltage: self.phase_voltage,
        frequency: self.frequency,
        poles: self.poles,
        phases: self.phases,
        primary_resistance: self.r1,
        no_load_input_power: self.no_load_input_power,
        no_load_current: self.no_load_current,
        mechanical_loss: self.mechanical_loss,
        locked_rotor_voltage: self.locked_rotor_voltage,
        locked_rotor_input_power: self.locked_rotor_input_power,
        locked_rotor_current: self.locked_rotor_current,
      })
  }
}

///|
fn build_diagram(
  params : AppParams,
) -> @ensenzu.CircleDiagram raise @ensenzu.CircleDiagramError {
  @ensenzu.make_circle_diagram(
    params.to_circuit_params(),
    point_count=DEFAULT_APP_POINT_COUNT,
    min_slip=DEFAULT_APP_MIN_SLIP,
  )
}

///|
fn read_operating_values(
  diagram : @ensenzu.CircleDiagram,
  output_power~ : Double,
) -> (
  @ensenzu.CircleDiagramCharacteristics?,
  @ensenzu.CharacteristicLineLengths?,
) raise @ensenzu.CircleDiagramError {
  let readout = @ensenzu.read_at_output_power(diagram, output_power~)
  (Some(readout.characteristics()), Some(readout.characteristic_line_lengths()))
}

///|
fn render_from_params(params : AppParams) -> RenderResult raise RenderError {
  let diagram = build_diagram(params) catch {
    InvalidInput(msg) | GeometryError(msg) => raise RenderError(msg)
  }
  let svg = @ensenzu.render_svg(diagram, output_power=params.output_power, size={
    width: params.width,
    height: params.height,
  }) catch {
    InvalidInput(msg) | GeometryError(msg) => raise RenderError(msg)
  }
  let values = read_operating_values(diagram, output_power=params.output_power) catch {
    InvalidInput(msg) | GeometryError(msg) => raise RenderError(msg)
  }
  let (characteristics, line_lengths) = values
  { svg, characteristics, line_lengths }
}

///|
fn render_from_fields(fields : AppFields) -> RenderResult raise RenderError {
  let params = fields.to_params() catch {
    InvalidField(label, msg) => raise RenderError("\{label}: \{msg}")
  }
  render_from_params(params)
}

///|
fn model_from_fields_with_state(
  fields : AppFields,
  previous_svg? : String = "",
  previous_characteristics? : @ensenzu.CircleDiagramCharacteristics? = None,
  previous_line_lengths? : @ensenzu.CharacteristicLineLengths? = None,
  show_advanced? : Bool = false,
  pending_input? : Bool = false,
  pending_effects? : Array[@external.EffectDescriptor] = [],
  next_effect_id? : Int = 1,
) -> Model {
  let make_error = fn(msg : String) -> Model {
    {
      fields,
      svg: previous_svg,
      characteristics: previous_characteristics,
      line_lengths: previous_line_lengths,
      error: if pending_input {
        None
      } else {
        Some(msg)
      },
      pending_input,
      show_advanced,
      confirm_reset: false,
      pending_effects,
      next_effect_id,
    }
  }
  try render_from_fields(fields) catch {
    RenderError(msg) => make_error(msg)
  } noraise {
    result =>
      {
        fields,
        svg: result.svg,
        characteristics: result.characteristics,
        line_lengths: result.line_lengths,
        error: None,
        pending_input: false,
        show_advanced,
        confirm_reset: false,
        pending_effects,
        next_effect_id,
      }
  }
}

///|
pub fn initial() -> Model {
  model_from_fields_with_state(default_app_fields(), show_advanced=false)
}

///|
fn record_download(model : Model) -> Model {
  let pending_effects = model.pending_effects.copy()
  pending_effects.push({
    id: model.next_effect_id,
    kind: @external.DomCommand,
    operation: "download-svg",
    payload: "circle-diagram.svg;bytes=\{model.svg.length()}",
  })
  { ..model, pending_effects, next_effect_id: model.next_effect_id + 1 }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Change(key, value) => {
      let fields = model.fields.set(key, value)
      let pending_input = key.is_pending_value(value)
      model_from_fields_with_state(
        fields,
        previous_svg=model.svg,
        previous_characteristics=model.characteristics,
        previous_line_lengths=model.line_lengths,
        show_advanced=model.show_advanced,
        pending_input~,
        pending_effects=model.pending_effects,
        next_effect_id=model.next_effect_id,
      )
    }
    ChangeInputSource(source) =>
      model_from_fields_with_state(
        { ..model.fields, input_source: source },
        previous_svg=model.svg,
        previous_characteristics=model.characteristics,
        previous_line_lengths=model.line_lengths,
        show_advanced=model.show_advanced,
        pending_effects=model.pending_effects,
        next_effect_id=model.next_effect_id,
      )
    RequestReset => { ..model, confirm_reset: true }
    CancelReset => { ..model, confirm_reset: false }
    Reset =>
      model_from_fields_with_state(
        default_app_fields(),
        show_advanced=model.show_advanced,
        next_effect_id=model.next_effect_id,
      )
    Download =>
      if model.svg.length() == 0 ||
        model.error is Some(_) ||
        model.pending_input ||
        !model.pending_effects.is_empty() {
        model
      } else {
        record_download(model)
      }
    ToggleAdvanced => { ..model, show_advanced: !model.show_advanced }
  }
}

///|
pub fn all_field_keys() -> Array[FieldKey] {
  [
    PhaseVoltage,
    Frequency,
    Poles,
    Phases,
    R1,
    X1,
    R2,
    X2,
    Xm,
    CoreLossResistance,
    MechanicalLoss,
    NoLoadInputPower,
    NoLoadCurrent,
    LockedRotorVoltage,
    LockedRotorInputPower,
    LockedRotorCurrent,
    Width,
    Height,
    OutputPower,
  ]
}

///|
pub fn input_corpus() -> Array[String] {
  ["", ".", "+", "0", "-1", "1", "NaN", "Infinity"]
}

///|
fn changed_field_count(fields : AppFields) -> Int {
  let defaults = default_app_fields()
  let mut count = 0
  for key in all_field_keys() {
    if fields.get(key) != defaults.get(key) {
      count = count + 1
    }
  }
  count
}

///|
fn push_field_actions(actions : Array[Msg], fields : AppFields) -> Unit {
  for key in all_field_keys() {
    for value in input_corpus() {
      if fields.get(key) != value {
        actions.push(Change(key, value))
      }
    }
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  if model.confirm_reset {
    result.push(Reset)
    result.push(CancelReset)
    return result
  }
  let changes = changed_field_count(model.fields)
  if changes == 0 {
    push_field_actions(result, model.fields)
  }
  if changes <= 1 {
    result.push(RequestReset)
    result.push(ToggleAdvanced)
    let other = match model.fields.input_source {
      LTypeEquivalentCircuit => NoLoadLockedRotorTest
      NoLoadLockedRotorTest => LTypeEquivalentCircuit
    }
    result.push(ChangeInputSource(other))
  }
  if model.svg.length() > 0 &&
    model.error is None &&
    !model.pending_input &&
    model.pending_effects.is_empty() {
    result.push(Download)
  }
  result
}

///|
pub fn field_name(key : FieldKey) -> String {
  match key {
    PhaseVoltage => "PhaseVoltage"
    Frequency => "Frequency"
    Poles => "Poles"
    Phases => "Phases"
    R1 => "R1"
    X1 => "X1"
    R2 => "R2"
    X2 => "X2"
    Xm => "Xm"
    CoreLossResistance => "CoreLossResistance"
    MechanicalLoss => "MechanicalLoss"
    NoLoadInputPower => "NoLoadInputPower"
    NoLoadCurrent => "NoLoadCurrent"
    LockedRotorVoltage => "LockedRotorVoltage"
    LockedRotorInputPower => "LockedRotorInputPower"
    LockedRotorCurrent => "LockedRotorCurrent"
    Width => "Width"
    Height => "Height"
    OutputPower => "OutputPower"
  }
}

///|
fn source_name(source : InputSource) -> String {
  match source {
    LTypeEquivalentCircuit => "LTypeEquivalentCircuit"
    NoLoadLockedRotorTest => "NoLoadLockedRotorTest"
  }
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    Change(key, value) if value != "Infinity" && value != "0" =>
      [Change(key, "0")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Change(key, value) => "change:\{field_name(key)}:\{value.length()}:\{value}"
    ChangeInputSource(source) => "source:\{source_name(source)}"
    RequestReset => "request-reset"
    Reset => "reset"
    CancelReset => "cancel-reset"
    Download => "download"
    ToggleAdvanced => "toggle-advanced"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Change(key, value) =>
      "Change(\{field_name(key)}, \{value.escape(quote=true)})"
    ChangeInputSource(source) => "ChangeInputSource(\{source_name(source)})"
    RequestReset => "RequestReset"
    Reset => "Reset"
    CancelReset => "CancelReset"
    Download => "Download"
    ToggleAdvanced => "ToggleAdvanced"
  }
}

///|
fn write_field(output : StringBuilder, name : String, value : String) -> Unit {
  output.write_char('|')
  output.write_string(name)
  output.write_char('=')
  output.write_object(value.length())
  output.write_char(':')
  output.write_string(value)
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("ensenzu-app|source=")
  output.write_string(source_name(model.fields.input_source))
  for key in all_field_keys() {
    write_field(output, field_name(key), model.fields.get(key))
  }
  output.write_string("|svg-bytes=")
  output.write_object(model.svg.length())
  output.write_string("|error=")
  match model.error {
    Some(error) => output.write_string(error)
    None => output.write_string("none")
  }
  output.write_string("|pending=")
  output.write_object(model.pending_input)
  output.write_string("|advanced=")
  output.write_object(model.show_advanced)
  output.write_string("|confirm-reset=")
  output.write_object(model.confirm_reset)
  output.write_string("|next-effect=")
  output.write_object(model.next_effect_id)
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
  let status = if model.pending_input {
    "pending-input"
  } else {
    match model.error {
      Some(_) => "error"
      None => "valid"
    }
  }
  let error = match model.error {
    Some(message) => @html.p(class="validation-popover", message)
    None => @html.nothing
  }
  @rabbita.Val::constant(
    @html.main_(class="ensenzu-shell", [
      @html.h1("円線図"),
      @html.p(class="status", status),
      @html.p(class="source", source_name(model.fields.input_source)),
      @html.p(class="frequency", "frequency=" + model.fields.frequency),
      @html.p(class="svg-size", "svg-bytes=" + model.svg.length().to_string()),
      error,
    ]),
  )
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "external/manifests/ensenzu-app.json", "src/vendor/ensenzu_app/upstream/app.mbt.txt",
    "src/vendor/ensenzu_app/upstream/view.mbt.txt", "src/vendor/ensenzu_app/upstream/styles.css",
    "src/vendor/ensenzu_app/ensenzu_app.mbt",
  ]
}

///|
fn field_active(source : InputSource, key : FieldKey) -> Bool {
  match key {
    PhaseVoltage
    | Frequency
    | Poles
    | Phases
    | R1
    | MechanicalLoss
    | Width
    | Height
    | OutputPower => true
    X1 | R2 | X2 | Xm | CoreLossResistance => source == LTypeEquivalentCircuit
    NoLoadInputPower
    | NoLoadCurrent
    | LockedRotorVoltage
    | LockedRotorInputPower
    | LockedRotorCurrent => source == NoLoadLockedRotorTest
  }
}

///|
fn is_non_finite_literal(value : String) -> Bool {
  value == "NaN" || value == "Infinity" || value == "-Infinity"
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "active numeric fields reject non-finite input",
      fn(before, msg, after) {
        match msg {
          Change(key, value) if field_active(before.fields.input_source, key) &&
            is_non_finite_literal(value) &&
            after.error is None &&
            !after.pending_input =>
            @proped.Fail(
              "accepted non-finite input for \{field_name(key)}: \{value}",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("pending input and error are mutually exclusive", fn(
      model,
      _,
    ) {
      if model.pending_input && model.error is Some(_) {
        @proped.Fail("pending input also exposed a validation error")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("invalid input preserves previous result", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        Change(_, _) if (after.pending_input || after.error is Some(_)) &&
          (
            after.svg != before.svg ||
            after.characteristics != before.characteristics ||
            after.line_lengths != before.line_lengths
          ) =>
          @proped.Fail("invalid or pending input replaced the previous result")
        _ => @proped.Pass
      }
    }),
    @proped.transition_property("advanced toggle preserves calculation", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        ToggleAdvanced if after.svg != before.svg ||
          after.characteristics != before.characteristics ||
          after.line_lengths != before.line_lengths ||
          after.error != before.error ||
          after.pending_input != before.pending_input =>
          @proped.Fail("advanced toggle changed calculation state")
        _ => @proped.Pass
      }
    }),
    @external.unique_effect_ids_property("download effect IDs remain unique", model => {
      model.pending_effects
    }),
    @proped.state_property("rendered status matches validation state", fn(
      model,
      html,
    ) {
      let expected = if model.pending_input {
        "pending-input"
      } else if model.error is Some(_) {
        "error"
      } else {
        "valid"
      }
      if html.contains(expected) {
        @proped.Pass
      } else {
        @proped.Fail("rendered status did not match validation state")
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
  { cases: 384, max_depth: 5, max_states: 900, seed: 59, shrink_budget: 8192 }
}
