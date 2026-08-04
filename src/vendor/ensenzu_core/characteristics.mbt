///|
pub(all) enum CircleDiagramNode {
  O
  NPrime
  SPrime
  N
  S
  U
  C
  T
  D
  F
  G
  H
  Pm
  Qm
  Pt
  Qt
  P
  PPrime
  A
  B
  L
  M
  Y
  R
} derive(Debug, Eq)

///|
pub struct DiagramCoordinate {
  x : Double
  y : Double
} derive(Debug, Eq)

///|
pub struct OperatingReadout {
  output_power : Double
  params : CircuitParams
  o : DiagramCoordinate
  n_prime : DiagramCoordinate
  s_prime : DiagramCoordinate
  n : DiagramCoordinate
  s : DiagramCoordinate
  u : DiagramCoordinate
  c : DiagramCoordinate
  t : DiagramCoordinate
  d : DiagramCoordinate
  f : DiagramCoordinate
  g : DiagramCoordinate
  h : DiagramCoordinate
  pm : DiagramCoordinate
  qm : DiagramCoordinate
  pt : DiagramCoordinate
  qt : DiagramCoordinate
  p : DiagramCoordinate
  p_prime : DiagramCoordinate
  a : DiagramCoordinate
  b : DiagramCoordinate
  l : DiagramCoordinate
  m : DiagramCoordinate
  y : DiagramCoordinate
  r : DiagramCoordinate
} derive(Debug, Eq)

///|
pub struct CharacteristicLineLengths {
  o_p : Double
  o_m : Double
  p_m : Double
  p_a : Double
  p_b : Double
  a_b : Double
  f_y : Double
  f_s : Double
  g_r : Double
  g_s : Double
} derive(Debug, Eq)

///|
pub struct CircleDiagramCharacteristics {
  slip : Double
  primary_current : Double
  active_current_component : Double
  power_factor : Double
  input_power : Double
  air_gap_power : Double
  output_power : Double
  torque : Double
  secondary_copper_loss : Double
  primary_copper_loss : Double
  core_loss : Double
  mechanical_loss : Double
  efficiency : Double
} derive(Debug, Eq)

///|
pub fn read_at_output_power(
  diagram : CircleDiagram,
  output_power~ : Double,
) -> OperatingReadout raise CircleDiagramError {
  let construction = make_readout_construction(diagram, output_power~)
  OperatingReadout::from_construction(
    construction,
    output_power~,
    params=diagram.params,
  )
}

///|
pub fn OperatingReadout::distance(
  self : Self,
  from~ : CircleDiagramNode,
  to~ : CircleDiagramNode,
) -> Double {
  self.point(from).distance(self.point(to))
}

///|
pub fn OperatingReadout::characteristic_line_lengths(
  self : Self,
) -> CharacteristicLineLengths {
  {
    o_p: self.distance(from=O, to=P),
    o_m: self.distance(from=O, to=M),
    p_m: self.distance(from=P, to=M),
    p_a: self.distance(from=P, to=A),
    p_b: self.distance(from=P, to=B),
    a_b: self.distance(from=A, to=B),
    f_y: self.distance(from=F, to=Y),
    f_s: self.distance(from=F, to=S),
    g_r: self.distance(from=G, to=R),
    g_s: self.distance(from=G, to=S),
  }
}

///|
pub fn OperatingReadout::characteristics(
  self : Self,
) -> CircleDiagramCharacteristics raise CircleDiagramError {
  self.params.validate()
  let lengths = self.characteristic_line_lengths()
  lengths.validate()
  let input_power = self.params.phases.to_double() *
    self.params.phase_voltage *
    lengths.p_m
  let air_gap_power = input_power * lengths.p_b / lengths.p_m
  let output_power = input_power * lengths.p_a / lengths.p_m -
    self.params.mechanical_loss
  let secondary_copper_loss = input_power * lengths.a_b / lengths.p_m
  let primary_copper_loss = self.params.phases.to_double() *
    self.params.r1 *
    lengths.o_p *
    lengths.o_p
  let core_loss = self.params.phases.to_double() *
    self.params.phase_voltage *
    self.params.phase_voltage /
    self.params.core_loss_resistance
  let torque = air_gap_power / synchronous_speed_rad_per_sec(self.params)
  {
    slip: lengths.g_r / lengths.g_s,
    primary_current: lengths.o_p,
    active_current_component: lengths.p_m,
    power_factor: lengths.p_m / lengths.o_p,
    input_power,
    air_gap_power,
    output_power,
    torque,
    secondary_copper_loss,
    primary_copper_loss,
    core_loss,
    mechanical_loss: self.params.mechanical_loss,
    efficiency: output_power / input_power,
  }
}

///|
fn CharacteristicLineLengths::validate(
  self : Self,
) -> Unit raise CircleDiagramError {
  guard self.o_p > NUMERIC_TOLERANCE else {
    raise GeometryError("OP must be positive")
  }
  guard self.o_m > NUMERIC_TOLERANCE else {
    raise GeometryError("OM must be positive")
  }
  guard self.p_m > NUMERIC_TOLERANCE else {
    raise GeometryError("PM must be positive")
  }
  guard self.p_b > NUMERIC_TOLERANCE else {
    raise GeometryError("PB must be positive")
  }
  guard self.f_s > NUMERIC_TOLERANCE else {
    raise GeometryError("FS must be positive")
  }
  guard self.g_s > NUMERIC_TOLERANCE else {
    raise GeometryError("GS must be positive")
  }
}

///|
fn OperatingReadout::from_construction(
  k : Construction,
  output_power~ : Double,
  params~ : CircuitParams,
) -> Self {
  {
    output_power,
    params,
    o: DiagramCoordinate::from_plot_point(k.o),
    n_prime: DiagramCoordinate::from_plot_point(k.n_prime),
    s_prime: DiagramCoordinate::from_plot_point(k.s_prime),
    n: DiagramCoordinate::from_plot_point(k.n),
    s: DiagramCoordinate::from_plot_point(k.s),
    u: DiagramCoordinate::from_plot_point(k.u),
    c: DiagramCoordinate::from_plot_point(k.c),
    t: DiagramCoordinate::from_plot_point(k.t),
    d: DiagramCoordinate::from_plot_point(k.d),
    f: DiagramCoordinate::from_plot_point(k.f),
    g: DiagramCoordinate::from_plot_point(k.g),
    h: DiagramCoordinate::from_plot_point(k.h),
    pm: DiagramCoordinate::from_plot_point(k.pm),
    qm: DiagramCoordinate::from_plot_point(k.qm),
    pt: DiagramCoordinate::from_plot_point(k.pt),
    qt: DiagramCoordinate::from_plot_point(k.qt),
    p: DiagramCoordinate::from_plot_point(k.p),
    p_prime: DiagramCoordinate::from_plot_point(k.p_prime),
    a: DiagramCoordinate::from_plot_point(k.a),
    b: DiagramCoordinate::from_plot_point(k.b),
    l: DiagramCoordinate::from_plot_point(k.l),
    m: DiagramCoordinate::from_plot_point(k.m),
    y: DiagramCoordinate::from_plot_point(k.y),
    r: DiagramCoordinate::from_plot_point(k.r),
  }
}

///|
fn DiagramCoordinate::from_plot_point(p : PlotPoint) -> Self {
  { x: p.x, y: p.y }
}

///|
fn DiagramCoordinate::distance(a : Self, b : Self) -> Double {
  ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).sqrt()
}

///|
fn OperatingReadout::point(
  self : Self,
  node : CircleDiagramNode,
) -> DiagramCoordinate {
  match node {
    O => self.o
    NPrime => self.n_prime
    SPrime => self.s_prime
    N => self.n
    S => self.s
    U => self.u
    C => self.c
    T => self.t
    D => self.d
    F => self.f
    G => self.g
    H => self.h
    Pm => self.pm
    Qm => self.qm
    Pt => self.pt
    Qt => self.qt
    P => self.p
    PPrime => self.p_prime
    A => self.a
    B => self.b
    L => self.l
    M => self.m
    Y => self.y
    R => self.r
  }
}
