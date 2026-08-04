///|
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
pub fn default_app_fields() -> AppFields {
  let params = default_app_params()
  AppFields::from_params(params)
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
pub fn render_app_svg(
  params : AppParams,
) -> String raise @ensenzu.CircleDiagramError {
  let diagram = build_diagram(params)
  @ensenzu.render_svg(diagram, output_power=params.output_power, size={
    width: params.width,
    height: params.height,
  })
}

///|
pub fn render_default_svg() -> String raise @ensenzu.CircleDiagramError {
  render_app_svg(default_app_params())
}

///|
pub fn svg_data_uri(svg : String) -> String {
  "data:image/svg+xml;charset=utf-8," +
  svg
  .replace_all(old="%", new="%25")
  .replace_all(old="#", new="%23")
  .replace_all(old="<", new="%3C")
  .replace_all(old=">", new="%3E")
  .replace_all(old="\"", new="%22")
  .replace_all(old=" ", new="%20")
  .replace_all(old="\n", new="")
}

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
pub fn model_from_fields(
  fields : AppFields,
  previous_svg? : String = "",
  show_advanced? : Bool = false,
) -> Model {
  model_from_fields_with_state(fields, previous_svg~, show_advanced~)
}

///|
fn model_from_fields_with_state(
  fields : AppFields,
  previous_svg? : String = "",
  previous_characteristics? : @ensenzu.CircleDiagramCharacteristics? = None,
  previous_line_lengths? : @ensenzu.CharacteristicLineLengths? = None,
  show_advanced? : Bool = false,
  pending_input? : Bool = false,
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
      }
  }
}

///|
pub fn initial_model() -> Model {
  model_from_fields_with_state(default_app_fields(), show_advanced=false)
}

///|
fn update(
  _emit : @rabbita.Emit[Msg],
  msg : Msg,
  model : Model,
) -> (@rabbita.Cmd, Model) {
  match msg {
    Change(key, value) => {
      let fields = model.fields.set(key, value)
      let pending_input = key.is_pending_value(value)
      (
        @rabbita.none,
        model_from_fields_with_state(
          fields,
          previous_svg=model.svg,
          previous_characteristics=model.characteristics,
          previous_line_lengths=model.line_lengths,
          show_advanced=model.show_advanced,
          pending_input~,
        ),
      )
    }
    ChangeInputSource(source) =>
      (
        @rabbita.none,
        model_from_fields_with_state(
          { ..model.fields, input_source: source },
          previous_svg=model.svg,
          previous_characteristics=model.characteristics,
          previous_line_lengths=model.line_lengths,
          show_advanced=model.show_advanced,
        ),
      )
    RequestReset => (@rabbita.none, { ..model, confirm_reset: true })
    CancelReset => (@rabbita.none, { ..model, confirm_reset: false })
    Reset =>
      (
        @rabbita.none,
        model_from_fields_with_state(
          default_app_fields(),
          show_advanced=model.show_advanced,
        ),
      )
    Download =>
      if model.svg.length() == 0 ||
        model.error is Some(_) ||
        model.pending_input {
        (@rabbita.none, model)
      } else {
        (download_svg_cmd("circle-diagram.svg", model.svg), model)
      }
    ToggleAdvanced =>
      (@rabbita.none, { ..model, show_advanced: !model.show_advanced })
  }
}

///|
pub fn make_app() -> @rabbita.Cell {
  @rabbita.cell(model=initial_model(), update~, view~)
}

///|
pub fn mount_app() -> Unit {
  @rabbita.new(make_app()).mount("app")
}
