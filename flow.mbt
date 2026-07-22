///|
/// Integer point in flow-canvas coordinates.
pub(all) struct FlowPoint {
  x : Int
  y : Int
} derive(Debug, Eq)

///|
/// Width and height of a flow node or graph bounds.
pub(all) struct FlowSize {
  width : Int
  height : Int
} derive(Debug, Eq)

///|
/// Bounding rectangle for laid-out node and edge geometry.
pub(all) struct FlowBounds {
  x : Int
  y : Int
  width : Int
  height : Int
} derive(Debug, Eq)

///|
/// A React Flow-like node model that remains independent from a browser.
pub(all) struct FlowNode {
  id : String
  label : String
  rank : Int
  position : FlowPoint
  size : FlowSize
  kind : String
  selected : Bool
  draggable : Bool
} derive(Debug, Eq)

///|
/// A directed edge with a renderer-independent orthogonal route.
pub(all) struct FlowEdge {
  id : String
  source : String
  target : String
  label : String
  route : Array[FlowPoint]
  kind : String
  selected : Bool
  sample_count : Int
} derive(Debug, Eq)

///|
/// Current viewport transform. Zoom is stored as a percentage so native and JS
/// targets share deterministic integer arithmetic. Width and height are zero
/// until a caller requests a concrete fitted output surface.
pub(all) struct FlowViewport {
  x : Int
  y : Int
  zoom_percent : Int
  width : Int
  height : Int
} derive(Debug, Eq)

///|
/// A single selected node or edge.
pub(all) enum FlowSelection {
  EmptySelection
  NodeSelection(String)
  EdgeSelection(String)
} derive(Debug, Eq)

///|
/// Complete browser-independent flow canvas state.
pub(all) struct FlowGraph {
  nodes : Array[FlowNode]
  edges : Array[FlowEdge]
  viewport : FlowViewport
  selection : FlowSelection
} derive(Debug, Eq)

///|
/// Configuration for the deterministic rank-based fallback layout.
pub(all) struct FlowLayoutConfig {
  padding : Int
  horizontal_gap : Int
  vertical_gap : Int
  default_node_width : Int
  default_node_height : Int
} derive(Debug, Eq)

///|
pub fn FlowViewport::default() -> FlowViewport {
  { x: 0, y: 0, zoom_percent: 100, width: 0, height: 0 }
}

///|
pub fn FlowLayoutConfig::default() -> FlowLayoutConfig {
  {
    padding: 32,
    horizontal_gap: 88,
    vertical_gap: 44,
    default_node_width: 220,
    default_node_height: 84,
  }
}

///|
pub fn FlowNode::new(id : String, label : String, rank : Int) -> FlowNode {
  let config = FlowLayoutConfig::default()
  {
    id,
    label,
    rank,
    position: { x: 0, y: 0 },
    size: {
      width: config.default_node_width,
      height: config.default_node_height,
    },
    kind: "default",
    selected: false,
    draggable: false,
  }
}

///|
pub fn FlowEdge::new(
  id : String,
  source : String,
  target : String,
  label : String,
) -> FlowEdge {
  {
    id,
    source,
    target,
    label,
    route: [],
    kind: "default",
    selected: false,
    sample_count: 1,
  }
}

///|
pub fn FlowGraph::new(
  nodes : Array[FlowNode],
  edges : Array[FlowEdge],
) -> FlowGraph {
  { nodes, edges, viewport: FlowViewport::default(), selection: EmptySelection }
}

///|
fn flow_min(left : Int, right : Int) -> Int {
  if left < right {
    left
  } else {
    right
  }
}

///|
fn flow_max(left : Int, right : Int) -> Int {
  if left > right {
    left
  } else {
    right
  }
}

///|
fn flow_clamp(value : Int, lower : Int, upper : Int) -> Int {
  flow_min(flow_max(value, lower), upper)
}

///|
fn find_flow_node(nodes : Array[FlowNode], id : String) -> FlowNode? {
  for node in nodes {
    if node.id == id {
      return Some(node)
    }
  }
  None
}

///|
fn normalize_flow_nodes(
  nodes : Array[FlowNode],
  config : FlowLayoutConfig,
) -> Array[FlowNode] {
  let normalized : Array[FlowNode] = []
  for node in nodes {
    let width = if node.size.width > 0 {
      node.size.width
    } else {
      config.default_node_width
    }
    let height = if node.size.height > 0 {
      node.size.height
    } else {
      config.default_node_height
    }
    normalized.push({ ..node, size: { width, height } })
  }
  normalized
}

///|
fn flow_rank_width(
  nodes : Array[FlowNode],
  rank : Int,
  fallback : Int,
) -> Int {
  let mut found = false
  let mut width = fallback
  for node in nodes {
    if node.rank == rank {
      if !found || node.size.width > width {
        width = node.size.width
      }
      found = true
    }
  }
  width
}

///|
fn flow_column_x(
  nodes : Array[FlowNode],
  rank : Int,
  config : FlowLayoutConfig,
) -> Int {
  let mut x = config.padding
  for current_rank = 0; current_rank < rank; current_rank = current_rank + 1 {
    x = x +
      flow_rank_width(nodes, current_rank, config.default_node_width) +
      config.horizontal_gap
  }
  x
}

///|
fn flow_lane_y(
  nodes : Array[FlowNode],
  node_index : Int,
  rank : Int,
  config : FlowLayoutConfig,
) -> Int {
  let mut y = config.padding
  for previous_index = 0
      previous_index < node_index
      previous_index = previous_index + 1 {
    let previous = nodes[previous_index]
    if previous.rank == rank {
      y = y + previous.size.height + config.vertical_gap
    }
  }
  y
}

///|
fn route_flow_edge(
  edge : FlowEdge,
  nodes : Array[FlowNode],
) -> Array[FlowPoint] {
  match
    (find_flow_node(nodes, edge.source), find_flow_node(nodes, edge.target)) {
    (Some(source), Some(target)) => {
      let source_y = source.position.y + source.size.height / 2
      let target_y = target.position.y + target.size.height / 2
      let source_left = source.position.x
      let source_right = source.position.x + source.size.width
      let target_left = target.position.x
      let target_right = target.position.x + target.size.width
      if source.id == target.id {
        let loop_x = source_right + 36
        let top_y = source.position.y - 24
        [
          { x: source_right, y: source_y },
          { x: loop_x, y: source_y },
          { x: loop_x, y: top_y },
          { x: source.position.x + source.size.width / 2, y: top_y },
          { x: source.position.x + source.size.width / 2, y: source.position.y },
        ]
      } else if source.position.x > target.position.x {
        let middle_x = (source_left + target_right) / 2
        [
          { x: source_left, y: source_y },
          { x: middle_x, y: source_y },
          { x: middle_x, y: target_y },
          { x: target_right, y: target_y },
        ]
      } else if source.position.x < target.position.x {
        let middle_x = (source_right + target_left) / 2
        [
          { x: source_right, y: source_y },
          { x: middle_x, y: source_y },
          { x: middle_x, y: target_y },
          { x: target_left, y: target_y },
        ]
      } else {
        let lane_x = flow_max(source_right, target_right) + 36
        [
          { x: source_right, y: source_y },
          { x: lane_x, y: source_y },
          { x: lane_x, y: target_y },
          { x: target_right, y: target_y },
        ]
      }
    }
    _ => []
  }
}

///|
/// Place nodes in rank columns and route edges orthogonally. Actual node sizes
/// determine column widths and lane offsets so custom-sized nodes cannot overlap.
pub fn layout_flow(graph : FlowGraph, config : FlowLayoutConfig) -> FlowGraph {
  let normalized = normalize_flow_nodes(graph.nodes, config)
  let nodes : Array[FlowNode] = []
  for index, node in normalized {
    nodes.push({
      ..node,
      position: {
        x: flow_column_x(normalized, node.rank, config),
        y: flow_lane_y(normalized, index, node.rank, config),
      },
    })
  }
  let edges : Array[FlowEdge] = []
  for edge in graph.edges {
    edges.push({ ..edge, route: route_flow_edge(edge, nodes) })
  }
  { ..graph, nodes, edges }
}

///|
fn include_flow_point(
  point : FlowPoint,
  found : Bool,
  left : Int,
  top : Int,
  right : Int,
  bottom : Int,
) -> (Bool, Int, Int, Int, Int) {
  if !found {
    (true, point.x, point.y, point.x, point.y)
  } else {
    (
      true,
      flow_min(left, point.x),
      flow_min(top, point.y),
      flow_max(right, point.x),
      flow_max(bottom, point.y),
    )
  }
}

///|
/// Return the bounding rectangle of all nodes and routed edge points.
pub fn flow_bounds(graph : FlowGraph) -> FlowBounds {
  let mut found = false
  let mut left = 0
  let mut top = 0
  let mut right = 0
  let mut bottom = 0
  for node in graph.nodes {
    let included = include_flow_point(
      node.position,
      found,
      left,
      top,
      right,
      bottom,
    )
    found = included.0
    left = included.1
    top = included.2
    right = included.3
    bottom = included.4
    let opposite = include_flow_point(
      {
        x: node.position.x + node.size.width,
        y: node.position.y + node.size.height,
      },
      found,
      left,
      top,
      right,
      bottom,
    )
    found = opposite.0
    left = opposite.1
    top = opposite.2
    right = opposite.3
    bottom = opposite.4
  }
  for edge in graph.edges {
    for point in edge.route {
      let included = include_flow_point(point, found, left, top, right, bottom)
      found = included.0
      left = included.1
      top = included.2
      right = included.3
      bottom = included.4
    }
  }
  if found {
    { x: left, y: top, width: right - left, height: bottom - top }
  } else {
    { x: 0, y: 0, width: 0, height: 0 }
  }
}

///|
fn transformed_flow_bounds(graph : FlowGraph) -> FlowBounds {
  let bounds = flow_bounds(graph)
  let zoom = graph.viewport.zoom_percent
  let left = graph.viewport.x + bounds.x * zoom / 100
  let top = graph.viewport.y + bounds.y * zoom / 100
  let right = graph.viewport.x + (bounds.x + bounds.width) * zoom / 100
  let bottom = graph.viewport.y + (bounds.y + bounds.height) * zoom / 100
  {
    x: flow_min(left, right),
    y: flow_min(top, bottom),
    width: flow_max(1, flow_max(left, right) - flow_min(left, right)),
    height: flow_max(1, flow_max(top, bottom) - flow_min(top, bottom)),
  }
}

///|
/// Pan the viewport without changing graph geometry.
pub fn pan_flow(graph : FlowGraph, dx : Int, dy : Int) -> FlowGraph {
  {
    ..graph,
    viewport: {
      x: graph.viewport.x + dx,
      y: graph.viewport.y + dy,
      zoom_percent: graph.viewport.zoom_percent,
      width: graph.viewport.width,
      height: graph.viewport.height,
    },
  }
}

///|
/// Change zoom by a percentage delta and clamp it to a practical range.
pub fn zoom_flow(graph : FlowGraph, delta_percent : Int) -> FlowGraph {
  {
    ..graph,
    viewport: {
      x: graph.viewport.x,
      y: graph.viewport.y,
      zoom_percent: flow_clamp(
        graph.viewport.zoom_percent + delta_percent,
        10,
        400,
      ),
      width: graph.viewport.width,
      height: graph.viewport.height,
    },
  }
}

///|
/// Fit all node and edge geometry inside the supplied viewport dimensions.
pub fn fit_flow_view(
  graph : FlowGraph,
  viewport_width : Int,
  viewport_height : Int,
  padding : Int,
) -> FlowGraph {
  let width = flow_max(1, viewport_width)
  let height = flow_max(1, viewport_height)
  let bounds = flow_bounds(graph)
  if bounds.width <= 0 || bounds.height <= 0 {
    return {
      ..graph,
      viewport: { x: 0, y: 0, zoom_percent: 100, width, height },
    }
  }
  let available_width = flow_max(1, width - padding * 2)
  let available_height = flow_max(1, height - padding * 2)
  let zoom_x = available_width * 100 / bounds.width
  let zoom_y = available_height * 100 / bounds.height
  let zoom_percent = flow_clamp(flow_min(zoom_x, zoom_y), 10, 400)
  let scaled_width = bounds.width * zoom_percent / 100
  let scaled_height = bounds.height * zoom_percent / 100
  {
    ..graph,
    viewport: {
      x: (width - scaled_width) / 2 - bounds.x * zoom_percent / 100,
      y: (height - scaled_height) / 2 - bounds.y * zoom_percent / 100,
      zoom_percent,
      width,
      height,
    },
  }
}

///|
/// Clear any selected node or edge.
pub fn clear_flow_selection(graph : FlowGraph) -> FlowGraph {
  let nodes : Array[FlowNode] = []
  let edges : Array[FlowEdge] = []
  for node in graph.nodes {
    nodes.push({ ..node, selected: false })
  }
  for edge in graph.edges {
    edges.push({ ..edge, selected: false })
  }
  { ..graph, nodes, edges, selection: EmptySelection }
}

///|
/// Select one node and clear edge selection.
pub fn select_flow_node(graph : FlowGraph, id : String) -> FlowGraph {
  let nodes : Array[FlowNode] = []
  let edges : Array[FlowEdge] = []
  for node in graph.nodes {
    nodes.push({ ..node, selected: node.id == id })
  }
  for edge in graph.edges {
    edges.push({ ..edge, selected: false })
  }
  { ..graph, nodes, edges, selection: NodeSelection(id) }
}

///|
/// Select one edge and clear node selection.
pub fn select_flow_edge(graph : FlowGraph, id : String) -> FlowGraph {
  let nodes : Array[FlowNode] = []
  let edges : Array[FlowEdge] = []
  for node in graph.nodes {
    nodes.push({ ..node, selected: false })
  }
  for edge in graph.edges {
    edges.push({ ..edge, selected: edge.id == id })
  }
  { ..graph, nodes, edges, selection: EdgeSelection(id) }
}

///|
fn flow_xml_escape(value : String) -> String {
  let output = StringBuilder::new()
  for char in value {
    match char {
      '&' => output.write_string("&amp;")
      '<' => output.write_string("&lt;")
      '>' => output.write_string("&gt;")
      '"' => output.write_string("&quot;")
      '\'' => output.write_string("&#39;")
      _ => output.write_char(char)
    }
  }
  output.to_string()
}

///|
fn flow_zoom_text(zoom_percent : Int) -> String {
  let whole = zoom_percent / 100
  let fraction = zoom_percent % 100
  if fraction == 0 {
    "\{whole}"
  } else if fraction < 10 {
    "\{whole}.0\{fraction}"
  } else {
    "\{whole}.\{fraction}"
  }
}

///|
fn flow_edge_display_label(edge : FlowEdge) -> String {
  if edge.sample_count > 1 {
    "\{edge.label} ×\{edge.sample_count}"
  } else {
    edge.label
  }
}

///|
fn write_flow_path(output : StringBuilder, route : Array[FlowPoint]) -> Unit {
  for index, point in route {
    if index == 0 {
      output.write_string("M ")
    } else {
      output.write_string(" L ")
    }
    output.write_object(point.x)
    output.write_char(' ')
    output.write_object(point.y)
  }
}

///|
fn flow_svg_view_box(graph : FlowGraph) -> FlowBounds {
  if graph.viewport.width > 0 && graph.viewport.height > 0 {
    {
      x: 0,
      y: 0,
      width: graph.viewport.width,
      height: graph.viewport.height,
    }
  } else {
    let bounds = transformed_flow_bounds(graph)
    {
      x: bounds.x - 32,
      y: bounds.y - 32,
      width: bounds.width + 64,
      height: bounds.height + 64,
    }
  }
}

///|
/// Render the flow graph as standalone SVG. Interaction state is represented by
/// CSS classes, while the same geometry remains available to a Rabbita JS view.
pub fn flow_to_svg(graph : FlowGraph) -> String {
  let view_box = flow_svg_view_box(graph)
  let output = StringBuilder::new()
  output.write_string(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" width=\"",
  )
  output.write_object(view_box.width)
  output.write_string("\" height=\"")
  output.write_object(view_box.height)
  output.write_string("\" viewBox=\"")
  output.write_object(view_box.x)
  output.write_char(' ')
  output.write_object(view_box.y)
  output.write_char(' ')
  output.write_object(view_box.width)
  output.write_char(' ')
  output.write_object(view_box.height)
  output.write_string(
    "\"><defs><marker id=\"flow-arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><style>.flow-edge{fill:none;stroke:#94a3b8;stroke-width:2;marker-end:url(#flow-arrow)}.flow-edge.selected{stroke:#2563eb;stroke-width:3}.flow-edge-group.failure .flow-edge{stroke:#dc2626;stroke-dasharray:7 4}.flow-node rect{fill:#fff;stroke:#94a3b8;stroke-width:2}.flow-node.initial rect{stroke:#2563eb}.flow-node.failure rect{fill:#fff1f2;stroke:#dc2626}.flow-node.selected rect{stroke:#1d4ed8;stroke-width:3}.flow-label{fill:#172033;font:700 14px system-ui,sans-serif}.flow-kind{fill:#64748b;font:10px ui-monospace,monospace}.flow-edge-label{fill:#475569;font:11px system-ui,sans-serif}</style><g transform=\"translate(",
  )
  output.write_object(graph.viewport.x)
  output.write_char(' ')
  output.write_object(graph.viewport.y)
  output.write_string(") scale(")
  output.write_string(flow_zoom_text(graph.viewport.zoom_percent))
  output.write_string(")\">")
  for edge in graph.edges {
    if !edge.route.is_empty() {
      let display_label = flow_edge_display_label(edge)
      output.write_string("<g class=\"flow-edge-group ")
      output.write_string(flow_xml_escape(edge.kind))
      if edge.selected {
        output.write_string(" selected")
      }
      output.write_string("\"><path class=\"flow-edge")
      if edge.selected {
        output.write_string(" selected")
      }
      output.write_string("\" d=\"")
      write_flow_path(output, edge.route)
      output.write_string("\"/><title>")
      output.write_string(flow_xml_escape(display_label))
      output.write_string("</title>")
      let label_point = edge.route[edge.route.length() / 2]
      output.write_string("<text class=\"flow-edge-label\" x=\"")
      output.write_object(label_point.x + 6)
      output.write_string("\" y=\"")
      output.write_object(label_point.y - 6)
      output.write_string("\">")
      output.write_string(flow_xml_escape(display_label))
      output.write_string("</text></g>")
    }
  }
  for node in graph.nodes {
    output.write_string("<g class=\"flow-node ")
    output.write_string(flow_xml_escape(node.kind))
    if node.selected {
      output.write_string(" selected")
    }
    output.write_string("\" transform=\"translate(")
    output.write_object(node.position.x)
    output.write_char(' ')
    output.write_object(node.position.y)
    output.write_string(")\"><rect rx=\"10\" width=\"")
    output.write_object(node.size.width)
    output.write_string("\" height=\"")
    output.write_object(node.size.height)
    output.write_string("\"/><text class=\"flow-label\" x=\"14\" y=\"31\">")
    output.write_string(flow_xml_escape(node.label))
    output.write_string("</text><text class=\"flow-kind\" x=\"14\" y=\"54\">")
    output.write_string(flow_xml_escape(node.kind))
    output.write_string("</text><title>")
    output.write_string(flow_xml_escape(node.id))
    output.write_string("</title></g>")
  }
  output.write_string("</g></svg>")
  output.to_string()
}
