///|
pub(all) struct CircuitParams {
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
} derive(Debug, Eq)

///|
pub(all) struct NoLoadLockedRotorTestParams {
  phase_voltage : Double
  frequency : Double
  poles : Int
  phases : Int
  primary_resistance : Double
  no_load_input_power : Double
  no_load_current : Double
  mechanical_loss : Double
  locked_rotor_voltage : Double
  locked_rotor_input_power : Double
  locked_rotor_current : Double
} derive(Debug, Eq)

///|
pub struct BranchCurrents {
  exciting : Complex
  rotor : Complex
  input : Complex
} derive(Debug, Eq)

///|
pub struct OperatingPoint {
  slip : Double
  input_current : Complex
  rotor_current : Complex
  exciting_current : Complex
  input_power : Double
  power_factor : Double
  air_gap_power : Double
  output_power : Double
  torque : Double
  efficiency : Double
} derive(Debug, Eq)

///|
const MINIMUM_SLIP : Double = 1.0e-4

///|
fn CircuitParams::validate(self : Self) -> Unit raise CircleDiagramError {
  guard self.phase_voltage > 0.0 else {
    raise InvalidInput("phase_voltage must be positive")
  }
  guard self.frequency > 0.0 else {
    raise InvalidInput("frequency must be positive")
  }
  guard self.poles > 0 else { raise InvalidInput("poles must be positive") }
  guard self.phases > 0 else { raise InvalidInput("phases must be positive") }
  guard self.r1 >= 0.0 else { raise InvalidInput("r1 must not be negative") }
  guard self.x1 >= 0.0 else { raise InvalidInput("x1 must not be negative") }
  guard self.r2 > 0.0 else { raise InvalidInput("r2 must be positive") }
  guard self.x2 >= 0.0 else { raise InvalidInput("x2 must not be negative") }
  guard self.xm > 0.0 else { raise InvalidInput("xm must be positive") }
  guard self.core_loss_resistance > 0.0 else {
    raise InvalidInput("core_loss_resistance must be positive")
  }
  guard self.mechanical_loss >= 0.0 else {
    raise InvalidInput("mechanical_loss must not be negative")
  }
}

///|
fn NoLoadLockedRotorTestParams::validate(
  self : Self,
) -> Unit raise CircleDiagramError {
  guard self.phase_voltage > 0.0 else {
    raise InvalidInput("phase_voltage must be positive")
  }
  guard self.frequency > 0.0 else {
    raise InvalidInput("frequency must be positive")
  }
  guard self.poles > 0 else { raise InvalidInput("poles must be positive") }
  guard self.phases > 0 else { raise InvalidInput("phases must be positive") }
  guard self.primary_resistance >= 0.0 else {
    raise InvalidInput("primary_resistance must not be negative")
  }
  guard self.no_load_input_power > 0.0 else {
    raise InvalidInput("no_load_input_power must be positive")
  }
  guard self.no_load_current > 0.0 else {
    raise InvalidInput("no_load_current must be positive")
  }
  guard self.mechanical_loss >= 0.0 else {
    raise InvalidInput("mechanical_loss must not be negative")
  }
  guard self.locked_rotor_voltage > 0.0 else {
    raise InvalidInput("locked_rotor_voltage must be positive")
  }
  guard self.locked_rotor_input_power > 0.0 else {
    raise InvalidInput("locked_rotor_input_power must be positive")
  }
  guard self.locked_rotor_current > 0.0 else {
    raise InvalidInput("locked_rotor_current must be positive")
  }
}

///|
fn checked_slip(slip : Double) -> Double raise CircleDiagramError {
  if slip < MINIMUM_SLIP {
    raise InvalidInput("slip is below MINIMUM_SLIP")
  } else if slip > 1.0 {
    raise InvalidInput("slip must not exceed 1")
  } else {
    slip
  }
}

///|
fn synchronous_speed_rad_per_sec(params : CircuitParams) -> Double {
  4.0 * @math.PI * params.frequency / params.poles.to_double()
}

///|
pub fn circuit_params_from_tests(
  tests : NoLoadLockedRotorTestParams,
) -> CircuitParams raise CircleDiagramError {
  tests.validate()
  let phases = tests.phases.to_double()
  let no_load_primary_copper_loss = phases *
    tests.primary_resistance *
    tests.no_load_current *
    tests.no_load_current
  let core_loss = tests.no_load_input_power -
    no_load_primary_copper_loss -
    tests.mechanical_loss
  guard core_loss > 0.0 else {
    raise InvalidInput("core loss estimated from no-load test must be positive")
  }
  let active_current = core_loss / (phases * tests.phase_voltage)
  guard tests.no_load_current > active_current else {
    raise InvalidInput("no-load current must exceed active current component")
  }
  let reactive_current = checked_sqrt(
    tests.no_load_current * tests.no_load_current -
    active_current * active_current,
  )
  guard reactive_current > NUMERIC_TOLERANCE else {
    raise InvalidInput("reactive current component must be positive")
  }
  let locked_impedance = tests.locked_rotor_voltage / tests.locked_rotor_current
  let locked_resistance = tests.locked_rotor_input_power /
    (phases * tests.locked_rotor_current * tests.locked_rotor_current)
  guard locked_resistance > tests.primary_resistance else {
    raise InvalidInput("locked rotor resistance must exceed primary resistance")
  }
  guard locked_impedance > locked_resistance else {
    raise InvalidInput("locked rotor impedance must exceed resistance")
  }
  let leakage_reactance = checked_sqrt(
    locked_impedance * locked_impedance - locked_resistance * locked_resistance,
  )
  {
    phase_voltage: tests.phase_voltage,
    frequency: tests.frequency,
    poles: tests.poles,
    phases: tests.phases,
    r1: tests.primary_resistance,
    x1: leakage_reactance / 2.0,
    r2: locked_resistance - tests.primary_resistance,
    x2: leakage_reactance / 2.0,
    xm: tests.phase_voltage / reactive_current,
    core_loss_resistance: phases *
    tests.phase_voltage *
    tests.phase_voltage /
    core_loss,
    mechanical_loss: tests.mechanical_loss,
  }
}

///|
pub fn branch_currents(
  params : CircuitParams,
  slip~ : Double,
) -> BranchCurrents raise CircleDiagramError {
  params.validate()
  let s = checked_slip(slip)
  let v = Complex(re=params.phase_voltage, im=0.0)
  let rotor_z = Complex(re=params.r1 + params.r2 / s, im=params.x1 + params.x2)
  let rotor = v / rotor_z
  let magnetizing = v / Complex(re=0.0, im=params.xm)
  let core = v / Complex(re=params.core_loss_resistance, im=0.0)
  let exciting = magnetizing + core
  { exciting, rotor, input: exciting + rotor }
}

///|
pub fn operating_point(
  params : CircuitParams,
  slip~ : Double,
) -> OperatingPoint raise CircleDiagramError {
  let s = checked_slip(slip)
  let currents = branch_currents(params, slip=s)
  let phases = params.phases.to_double()
  let v = Complex(re=params.phase_voltage, im=0.0)
  let apparent_per_phase = v * currents.input.conj()
  let input_power = phases * apparent_per_phase.re
  let apparent = phases * params.phase_voltage * currents.input.abs()
  guard apparent > 0.0 else {
    raise InvalidInput("apparent power must be positive")
  }
  let power_factor = input_power / apparent
  let rotor_i2 = currents.rotor.abs2()
  let air_gap_power = phases * rotor_i2 * params.r2 / s
  let output_power = air_gap_power * (1.0 - s) - params.mechanical_loss
  let torque = air_gap_power / synchronous_speed_rad_per_sec(params)
  guard input_power > 0.0 else {
    raise InvalidInput("input power must be positive")
  }
  let efficiency = output_power / input_power
  {
    slip: s,
    input_current: currents.input,
    rotor_current: currents.rotor,
    exciting_current: currents.exciting,
    input_power,
    power_factor,
    air_gap_power,
    output_power,
    torque,
    efficiency,
  }
}
