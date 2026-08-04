///|
struct Viewport {
  size : DiagramSize
  margin_left : Double
  margin_right : Double
  margin_top : Double
  margin_bottom : Double
  bounds : PlotBounds
} derive(Debug, Eq)

///|
struct ScreenOffset {
  dx : Double
  dy : Double
} derive(Debug, Eq)

///|
enum LabelAnchor {
  LeftUp
  RightUp
  RightDown
  LeftDown
} derive(Debug, Eq)

///|
enum StrokeWeight {
  Normal
  Emphasis
} derive(Debug, Eq)

///|
const STROKE_WIDTH_NORMAL : Double = 1.0

///|
const STROKE_WIDTH_EMPHASIS : Double = 1.6

///|
const LABEL_OFFSET_X : Double = 9.0

///|
const LABEL_OFFSET_Y_UP : Double = -7.0

///|
const LABEL_OFFSET_Y_DOWN : Double = 9.0

///|
const VIEWPORT_LABEL_MARGIN : Double = 24.0

///|
const CIRCLE_ARC_SAMPLES : Int = 96

///|
fn StrokeWeight::width(self : Self) -> Double {
  match self {
    Normal => STROKE_WIDTH_NORMAL
    Emphasis => STROKE_WIDTH_EMPHASIS
  }
}

///|
fn LabelAnchor::offset(self : Self) -> ScreenOffset {
  match self {
    LeftUp => { dx: -LABEL_OFFSET_X, dy: LABEL_OFFSET_Y_UP }
    RightUp => { dx: LABEL_OFFSET_X, dy: LABEL_OFFSET_Y_UP }
    RightDown => { dx: LABEL_OFFSET_X, dy: LABEL_OFFSET_Y_DOWN }
    LeftDown => { dx: -LABEL_OFFSET_X, dy: LABEL_OFFSET_Y_DOWN }
  }
}

///|
fn Viewport::plot_width(self : Self) -> Double {
  self.size.width - self.margin_left - self.margin_right
}

///|
fn Viewport::Viewport(size : DiagramSize, bounds : PlotBounds) -> Self {
  let margin_left = VIEWPORT_LABEL_MARGIN
  let margin_right = VIEWPORT_LABEL_MARGIN
  let margin_top = VIEWPORT_LABEL_MARGIN
  let margin_bottom = VIEWPORT_LABEL_MARGIN
  {
    size,
    margin_left,
    margin_right,
    margin_top,
    margin_bottom,
    bounds: fitted_bounds(
      size, bounds, margin_left, margin_right, margin_top, margin_bottom,
    ),
  }
}

///|
fn Viewport::plot_height(self : Self) -> Double {
  self.size.height - self.margin_top - self.margin_bottom
}

///|
fn Viewport::to_screen(self : Self, p : PlotPoint) -> @vg.Point {
  let x = self.margin_left +
    (p.x - self.bounds.min_x) /
    (self.bounds.max_x - self.bounds.min_x) *
    self.plot_width()
  let y = self.margin_top +
    (self.bounds.max_y - p.y) /
    (self.bounds.max_y - self.bounds.min_y) *
    self.plot_height()
  Point(x, y)
}

///|
pub fn render_svg(
  diagram : CircleDiagram,
  output_power~ : Double,
  size? : DiagramSize = default_size(),
) -> String raise CircleDiagramError {
  validate_render_size(size)
  let construction = make_readout_construction(diagram, output_power~)
  let vp = Viewport(size, construction.bounds)
  let doc = @svg.new_svg(size.width, size.height).render_rectangle(
    0.0,
    0.0,
    size.width,
    size.height,
    @color.white(),
  )
  let doc = render_axes(doc, vp, construction.bounds)
  let doc = render_construction_lines(doc, vp, construction)
  let doc = render_circle_arc(doc, vp, construction)
  let doc = render_point_labels(doc, vp, construction)
  doc.to_string()
}

///|
fn validate_render_size(size : DiagramSize) -> Unit raise CircleDiagramError {
  guard size.width > VIEWPORT_LABEL_MARGIN * 2.0 else {
    raise InvalidInput("diagram width is too small for the viewport margins")
  }
  guard size.height > VIEWPORT_LABEL_MARGIN * 2.0 else {
    raise InvalidInput("diagram height is too small for the viewport margins")
  }
}

///|
fn fitted_bounds(
  size : DiagramSize,
  bounds : PlotBounds,
  margin_left : Double,
  margin_right : Double,
  margin_top : Double,
  margin_bottom : Double,
) -> PlotBounds {
  let plot_w = size.width - margin_left - margin_right
  let plot_h = size.height - margin_top - margin_bottom
  let plot_aspect = plot_w / plot_h
  let cx = (bounds.min_x + bounds.max_x) / 2.0
  let cy = (bounds.min_y + bounds.max_y) / 2.0
  let dx = bounds.max_x - bounds.min_x
  let dy = bounds.max_y - bounds.min_y
  let data_aspect = dx / dy
  if data_aspect > plot_aspect {
    let new_dy = dx / plot_aspect
    {
      min_x: bounds.min_x,
      max_x: bounds.max_x,
      min_y: cy - new_dy / 2.0,
      max_y: cy + new_dy / 2.0,
    }
  } else {
    let new_dx = dy * plot_aspect
    {
      min_x: cx - new_dx / 2.0,
      max_x: cx + new_dx / 2.0,
      min_y: bounds.min_y,
      max_y: bounds.max_y,
    }
  }
}

///|
fn render_axes(
  doc : @svg.SvgDocument,
  vp : Viewport,
  drawing_bounds : PlotBounds,
) -> @svg.SvgDocument {
  let black = @color.black()
  let x0 = clamp(
    value=0.0,
    lower=drawing_bounds.min_x,
    upper=drawing_bounds.max_x,
  )
  let y0 = clamp(
    value=0.0,
    lower=drawing_bounds.min_y,
    upper=drawing_bounds.max_y,
  )
  doc
  .render_line(
    vp.to_screen(PlotPoint(x=x0, y=drawing_bounds.min_y)),
    vp.to_screen(PlotPoint(x=x0, y=drawing_bounds.max_y)),
    black,
    Normal.width(),
  )
  .render_line(
    vp.to_screen(PlotPoint(x=drawing_bounds.min_x, y=y0)),
    vp.to_screen(PlotPoint(x=drawing_bounds.max_x, y=y0)),
    black,
    Normal.width(),
  )
}

///|
fn render_construction_lines(
  doc : @svg.SvgDocument,
  vp : Viewport,
  k : Construction,
) -> @svg.SvgDocument {
  doc
  .render_plot_line(vp, start=k.o, end=k.n_prime, weight=Normal)
  .render_plot_line(vp, start=k.o, end=k.s_prime, weight=Normal)
  .render_plot_line(vp, start=k.n_prime, end=k.n, weight=Normal)
  .render_plot_line(vp, start=k.s_prime, end=k.s, weight=Normal)
  .render_plot_line(vp, start=k.s, end=k.u, weight=Normal)
  .render_plot_line(vp, start=k.n, end=k.s, weight=Emphasis)
  .render_plot_line(
    vp,
    start=k.n,
    end=PlotPoint(x=k.bounds.max_x, y=k.n.y),
    weight=Normal,
  )
  .render_plot_line(vp, start=k.n, end=k.t, weight=Emphasis)
  .render_plot_line(vp, start=k.s, end=k.d, weight=Normal)
  .render_plot_line(
    vp,
    start=k.d,
    end=PlotPoint(
      x=k.d.x,
      y=k.f.y + (k.f.y - k.d.y) * AUXILIARY_VERTICAL_EXTENSION_RATIO,
    ),
    weight=Normal,
  )
  .render_plot_line(
    vp,
    start=k.n,
    end=PlotPoint(
      x=k.n.x,
      y=k.g.y + (k.g.y - k.n.y) * AUXILIARY_VERTICAL_EXTENSION_RATIO,
    ),
    weight=Normal,
  )
  .render_plot_line(vp, start=k.f, end=k.s, weight=Emphasis)
  .render_plot_line(vp, start=k.s, end=k.g, weight=Emphasis)
  .render_plot_line(vp, start=k.h, end=k.p, weight=Normal)
  .render_plot_line(vp, start=k.c, end=k.pm, weight=Normal)
  .render_plot_line(vp, start=k.c, end=k.pt, weight=Normal)
  .render_plot_line(vp, start=k.p, end=k.p_prime, weight=Normal)
  .render_plot_line(vp, start=k.p, end=k.o, weight=Normal)
  .render_plot_line(vp, start=k.d, end=k.y, weight=Normal)
  .render_plot_line(vp, start=k.n, end=k.r, weight=Normal)
  .render_plot_line(vp, start=k.p, end=k.m, weight=Normal)
  .render_plot_line(vp, start=k.a, end=k.p, weight=Normal)
  .render_plot_line(vp, start=k.b, end=k.p, weight=Normal)
  .render_plot_line(vp, start=k.l, end=k.p, weight=Normal)
}

///|
fn @svg.SvgDocument::render_plot_line(
  self : @svg.SvgDocument,
  vp : Viewport,
  start~ : PlotPoint,
  end~ : PlotPoint,
  weight~ : StrokeWeight,
) -> @svg.SvgDocument {
  self.render_line(
    vp.to_screen(start),
    vp.to_screen(end),
    @color.black(),
    weight.width(),
  )
}

///|
fn render_circle_arc(
  doc : @svg.SvgDocument,
  vp : Viewport,
  k : Construction,
) -> @svg.SvgDocument raise CircleDiagramError {
  let branch = k.c.circle_branch(k.s)
  let samples = CIRCLE_ARC_SAMPLES
  let mut d = ""
  for i in 0..<=samples {
    let t = i.to_double() / samples.to_double()
    let end_x = if k.bounds.max_x < k.c.x + k.radius {
      k.bounds.max_x
    } else {
      k.c.x + k.radius
    }
    let x = k.n.x + (end_x - k.n.x) * t
    let y = k.c.y +
      branch * checked_sqrt(k.radius * k.radius - (x - k.c.x) * (x - k.c.x))
    let p = vp.to_screen(PlotPoint(x~, y~))
    if i == 0 {
      d = "M \{p.x} \{p.y}"
    } else {
      d = d + " L \{p.x} \{p.y}"
    }
  }
  let width = Emphasis.width()
  let element =
    $|<path d="\{d}" fill="none" stroke="#000000" stroke-width="\{width}" stroke-linecap="round" stroke-linejoin="round"/>
  doc.add_element(element)
}

///|
fn render_point_labels(
  doc : @svg.SvgDocument,
  vp : Viewport,
  k : Construction,
) -> @svg.SvgDocument {
  doc
  .render_label(vp, point=k.o, text="O", anchor=LeftDown)
  .render_label(vp, point=k.n_prime, text="N'", anchor=LeftUp)
  .render_label(vp, point=k.s_prime, text="S'", anchor=LeftUp)
  .render_label(vp, point=k.n, text="N", anchor=RightUp)
  .render_label(vp, point=k.s, text="S", anchor=RightUp)
  .render_label(vp, point=k.u, text="U", anchor=RightDown)
  .render_label(vp, point=k.c, text="C", anchor=RightDown)
  .render_label(vp, point=k.t, text="T", anchor=RightDown)
  .render_label(vp, point=k.d, text="D", anchor=LeftDown)
  .render_label(vp, point=k.f, text="F", anchor=LeftUp)
  .render_label(vp, point=k.g, text="G", anchor=RightUp)
  .render_label(vp, point=k.h, text="H", anchor=LeftUp)
  .render_label(vp, point=k.pm, text="Pm", anchor=RightUp)
  .render_label(vp, point=k.qm, text="Qm", anchor=RightDown)
  .render_label(vp, point=k.pt, text="PT", anchor=RightUp)
  .render_label(vp, point=k.qt, text="QT", anchor=RightDown)
  .render_label(vp, point=k.p, text="P", anchor=RightUp)
  .render_label(vp, point=k.p_prime, text="P'", anchor=LeftUp)
  .render_label(vp, point=k.a, text="A", anchor=RightDown)
  .render_label(vp, point=k.b, text="B", anchor=RightDown)
  .render_label(vp, point=k.l, text="L", anchor=RightDown)
  .render_label(vp, point=k.m, text="M", anchor=RightDown)
  .render_label(vp, point=k.y, text="Y", anchor=RightUp)
  .render_label(vp, point=k.r, text="R", anchor=RightUp)
  .render_line_name(vp, start=k.n, end=k.s, text="output line")
  .render_line_name(vp, start=k.n, end=k.t, text="torque line")
  .render_line_name(vp, start=k.f, end=k.s, text="efficiency line")
  .render_line_name(vp, start=k.s, end=k.g, text="slip line")
}

///|
fn @svg.SvgDocument::render_label(
  self : @svg.SvgDocument,
  vp : Viewport,
  point~ : PlotPoint,
  text~ : String,
  anchor~ : LabelAnchor,
) -> @svg.SvgDocument {
  let s = vp.to_screen(point)
  let offset = anchor.offset()
  self.render_text(
    text,
    Point(s.x + offset.dx, s.y + offset.dy),
    11.0,
    @color.black(),
  )
}

///|
fn @svg.SvgDocument::render_line_name(
  self : @svg.SvgDocument,
  vp : Viewport,
  start~ : PlotPoint,
  end~ : PlotPoint,
  text~ : String,
) -> @svg.SvgDocument {
  let sa = vp.to_screen(start)
  let sb = vp.to_screen(end)
  self.render_text(
    text,
    Point((sa.x + sb.x) / 2.0 + 18.0, (sa.y + sb.y) / 2.0 - 10.0),
    10.0,
    @color.black(),
  )
}

///|
fn clamp(value~ : Double, lower~ : Double, upper~ : Double) -> Double {
  if value < lower {
    lower
  } else if value > upper {
    upper
  } else {
    value
  }
}
