///|
struct PlotPoint {
  x : Double
  y : Double
} derive(Debug, Eq)

///|
struct Construction {
  o : PlotPoint
  n_prime : PlotPoint
  s_prime : PlotPoint
  n : PlotPoint
  s : PlotPoint
  u : PlotPoint
  c : PlotPoint
  t : PlotPoint
  d : PlotPoint
  f : PlotPoint
  g : PlotPoint
  h : PlotPoint
  pm : PlotPoint
  qm : PlotPoint
  pt : PlotPoint
  qt : PlotPoint
  p : PlotPoint
  p_prime : PlotPoint
  a : PlotPoint
  b : PlotPoint
  l : PlotPoint
  m : PlotPoint
  y : PlotPoint
  r : PlotPoint
  radius : Double
  bounds : PlotBounds
} derive(Debug, Eq)

///|
const AUXILIARY_VERTICAL_EXTENSION_RATIO : Double = 0.18

///|
fn make_readout_construction(
  diagram : CircleDiagram,
  output_power~ : Double,
) -> Construction raise CircleDiagramError {
  guard output_power > 0.0 else {
    raise InvalidInput("output_power must be positive")
  }
  let o = PlotPoint(x=0.0, y=0.0)
  let n = ideal_no_load_point(diagram.params)
  let n_prime = PlotPoint(x=0.0, y=n.y)
  let s_prime = PlotPoint(x=0.0, y=diagram.locked_rotor.y)
  let s = PlotPoint(x=diagram.locked_rotor.x, y=diagram.locked_rotor.y)
  let u = PlotPoint(x=s.x, y=n.y)
  let c = circle_center_on_nu(n~, s~)
  let radius = c.distance(n)
  guard diagram.params.r1 + diagram.params.r2 > 0.0 else {
    raise InvalidInput("r1 + r2 must be positive")
  }
  let ratio = diagram.params.r1 / (diagram.params.r1 + diagram.params.r2)
  let t = PlotPoint(x=u.x, y=u.y + (s.y - u.y) * ratio)
  let d = line_x_axis_intersection(line_start=n, line_end=s)
  let f = PlotPoint(x=d.x, y=s.y)
  let h = PlotPoint(
    x=d.x,
    y=(output_power + diagram.params.mechanical_loss) /
      (diagram.params.phases.to_double() * diagram.params.phase_voltage),
  )
  let g = vertical_intersection_with_parallel(
    x=n.x,
    parallel_to_start=n,
    parallel_to_end=t,
    through=s,
  )
  let qm = perpendicular_foot_on_line(point=c, line_start=n, line_end=s)
  let pm = radial_circle_point(center=c, through=qm, radius~)
  let qt = perpendicular_foot_on_line(point=c, line_start=n, line_end=t)
  let pt = radial_circle_point(center=c, through=qt, radius~)
  let p = circle_intersection_with_parallel(
    center=c,
    radius~,
    through=h,
    parallel_to_start=n,
    parallel_to_end=s,
  )
  let p_prime = PlotPoint(x=0.0, y=p.y)
  let a = vertical_line_intersection(x=p.x, line_start=n, line_end=s)
  let b = vertical_line_intersection(x=p.x, line_start=n, line_end=t)
  let l = PlotPoint(x=p.x, y=n.y)
  let m = PlotPoint(x=p.x, y=0.0)
  let y = line_intersection(
    first_start=d,
    first_end=p,
    second_start=f,
    second_end=s,
  )
  let r = line_intersection(
    first_start=n,
    first_end=p,
    second_start=g,
    second_end=s,
  )
  let f_extension = PlotPoint(
    x=d.x,
    y=f.y + (f.y - d.y) * AUXILIARY_VERTICAL_EXTENSION_RATIO,
  )
  let g_extension = PlotPoint(
    x=n.x,
    y=g.y + (g.y - n.y) * AUXILIARY_VERTICAL_EXTENSION_RATIO,
  )
  let bounds = PlotBounds::covering_l_type_construction(
    [
      o, n_prime, s_prime, n, s, u, c, t, d, f, g, h, qm, pm, qt, pt, p, p_prime,
      a, b, l, m, y, r, f_extension, g_extension,
    ],
    center=c,
    radius~,
    branch=c.circle_branch(s),
  )
  {
    o,
    n_prime,
    s_prime,
    n,
    s,
    u,
    c,
    t,
    d,
    f,
    g,
    h,
    pm,
    qm,
    pt,
    qt,
    p,
    p_prime,
    a,
    b,
    l,
    m,
    y,
    r,
    radius,
    bounds,
  }
}

///|
fn ideal_no_load_point(
  params : CircuitParams,
) -> PlotPoint raise CircleDiagramError {
  params.validate()
  PlotPoint(
    x=params.phase_voltage / params.xm,
    y=params.phase_voltage / params.core_loss_resistance,
  )
}

///|
fn PlotPoint::PlotPoint(x~ : Double, y~ : Double) -> Self {
  { x, y }
}

///|
fn PlotPoint::circle_branch(center : Self, on_circle : Self) -> Double {
  if on_circle.y >= center.y {
    1.0
  } else {
    -1.0
  }
}

///|
fn circle_center_on_nu(
  n~ : PlotPoint,
  s~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  guard !nearly_zero(s.x - n.x) else {
    raise GeometryError("N and S must not have the same x coordinate")
  }
  let dy = s.y - n.y
  PlotPoint(x=(s.x * s.x + dy * dy - n.x * n.x) / (2.0 * (s.x - n.x)), y=n.y)
}

///|
fn PlotPoint::distance(a : Self, b : Self) -> Double {
  ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).sqrt()
}

///|
fn checked_sqrt(value : Double) -> Double raise CircleDiagramError {
  if value < 0.0 {
    guard value.abs() <= NUMERIC_TOLERANCE else {
      raise GeometryError("square root argument must be non-negative")
    }
    0.0
  } else {
    value.sqrt()
  }
}

///|
fn line_x_axis_intersection(
  line_start~ : PlotPoint,
  line_end~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  guard !nearly_zero(line_end.y - line_start.y) else {
    raise GeometryError("line must not be parallel to the x axis")
  }
  let t = -line_start.y / (line_end.y - line_start.y)
  PlotPoint(x=line_start.x + (line_end.x - line_start.x) * t, y=0.0)
}

///|
fn vertical_line_intersection(
  x~ : Double,
  line_start~ : PlotPoint,
  line_end~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  guard !nearly_zero(line_end.x - line_start.x) else {
    raise GeometryError("line must not be vertical")
  }
  let t = (x - line_start.x) / (line_end.x - line_start.x)
  PlotPoint(x~, y=line_start.y + (line_end.y - line_start.y) * t)
}

///|
fn vertical_intersection_with_parallel(
  x~ : Double,
  parallel_to_start~ : PlotPoint,
  parallel_to_end~ : PlotPoint,
  through~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  guard !nearly_zero(parallel_to_end.x - parallel_to_start.x) else {
    raise GeometryError("parallel reference line must not be vertical")
  }
  let ratio = (x - through.x) / (parallel_to_end.x - parallel_to_start.x)
  PlotPoint(x~, y=through.y + (parallel_to_end.y - parallel_to_start.y) * ratio)
}

///|
fn perpendicular_foot_on_line(
  point~ : PlotPoint,
  line_start~ : PlotPoint,
  line_end~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  let dx = line_end.x - line_start.x
  let dy = line_end.y - line_start.y
  let denom = dx * dx + dy * dy
  guard denom > NUMERIC_TOLERANCE else {
    raise GeometryError("line for perpendicular foot must have positive length")
  }
  let t = ((point.x - line_start.x) * dx + (point.y - line_start.y) * dy) /
    denom
  PlotPoint(x=line_start.x + dx * t, y=line_start.y + dy * t)
}

///|
fn radial_circle_point(
  center~ : PlotPoint,
  through~ : PlotPoint,
  radius~ : Double,
) -> PlotPoint raise CircleDiagramError {
  let dx = through.x - center.x
  let dy = through.y - center.y
  let len = (dx * dx + dy * dy).sqrt()
  guard len > NUMERIC_TOLERANCE else {
    raise GeometryError("radial point direction must have positive length")
  }
  PlotPoint(x=center.x + dx / len * radius, y=center.y + dy / len * radius)
}

///|
fn circle_intersection_with_parallel(
  center~ : PlotPoint,
  radius~ : Double,
  through~ : PlotPoint,
  parallel_to_start~ : PlotPoint,
  parallel_to_end~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  let dx = parallel_to_end.x - parallel_to_start.x
  let dy = parallel_to_end.y - parallel_to_start.y
  let a = dx * dx + dy * dy
  guard a > NUMERIC_TOLERANCE else {
    raise GeometryError("parallel reference line must have positive length")
  }
  let fx = through.x - center.x
  let fy = through.y - center.y
  let b = 2.0 * (fx * dx + fy * dy)
  let c = fx * fx + fy * fy - radius * radius
  let discriminant = b * b - 4.0 * a * c
  guard discriminant >= -NUMERIC_TOLERANCE else {
    raise GeometryError("output line does not intersect the circle")
  }
  let root = checked_sqrt(discriminant)
  let t1 = (-b - root) / (2.0 * a)
  let t2 = (-b + root) / (2.0 * a)
  let p1 = PlotPoint(x=through.x + dx * t1, y=through.y + dy * t1)
  let p2 = PlotPoint(x=through.x + dx * t2, y=through.y + dy * t2)
  if p1.x <= p2.x {
    p1
  } else {
    p2
  }
}

///|
fn line_intersection(
  first_start~ : PlotPoint,
  first_end~ : PlotPoint,
  second_start~ : PlotPoint,
  second_end~ : PlotPoint,
) -> PlotPoint raise CircleDiagramError {
  let r_x = first_end.x - first_start.x
  let r_y = first_end.y - first_start.y
  let s_x = second_end.x - second_start.x
  let s_y = second_end.y - second_start.y
  let denom = r_x * s_y - r_y * s_x
  guard !nearly_zero(denom) else {
    raise GeometryError("lines must not be parallel")
  }
  let t = (
      (second_start.x - first_start.x) * s_y -
      (second_start.y - first_start.y) * s_x
    ) /
    denom
  PlotPoint(x=first_start.x + r_x * t, y=first_start.y + r_y * t)
}

///|
fn PlotBounds::covering_l_type_construction(
  points : Array[PlotPoint],
  center~ : PlotPoint,
  radius~ : Double,
  branch~ : Double,
) -> Self {
  let mut min_x = center.x
  let mut max_x = center.x
  let mut min_y = if branch > 0.0 { center.y } else { center.y - radius }
  let mut max_y = if branch > 0.0 { center.y + radius } else { center.y }
  for p in points {
    if p.x < min_x {
      min_x = p.x
    }
    if p.x > max_x {
      max_x = p.x
    }
    if p.y < min_y {
      min_y = p.y
    }
    if p.y > max_y {
      max_y = p.y
    }
  }
  { min_x, max_x, min_y, max_y }
}
