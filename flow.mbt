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
/// Bounding rectangle for a laid-out flow graph.
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
} derive(Debug, Eq)

///|
/// Current viewport transform. Zoom is stored as a percentage so native and JS
/// targets share deterministic integer arithmetic.
pub(all) struct FlowViewport {
  x : Int
  y : Int
  zoom_percent : Int
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
  { x: 0, y: 0, zoom_percent: 100 }
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
  }
}

///|
pub fn FlowGraph::new(
  nodes : Array[FlowNode],
  edges : Array[FlowEdge],
) -> FlowGraph {
  {
    nodes,
    edges,
    viewport: FlowViewport::default(),
    selection: EmptySelection,
  }
}

///|
fn flow_min(left : Int, right : Int) -> Int {
  if left < right { left } else { right }
}

///|
fn flow_max(left : Int, right : Int) -> Int {
  if left > right { left } else { right }
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
fn route_flow_edge(
  edge : FlowEdge,
  nodes : Array[FlowNode],
) -> Array[FlowPoint] {
  match (find_flow_node(nodes, edge.source), find_flow_node(nodes, edge.target)) {
    (Some(source), Some(target)) => {
      let source_x = source.position.x + source.size.width
      let source_y = source.position.y + source.size.height / 2
      let target_x = target.position.x
      let target_y = target.position.y + target.size.height / 2
      if source.id == target.id {
        let loop_x = source.position.x + source.size.width + 36
        let top_y = source.position.y - 24
        [
          { x: source_x, y: source_y },
          { x: loop_x, y: source_y },
          { x: loop_x, y: top_y },
          { x: source.position.x + source.size.width / 2, y: top_y },
          {
            x: source.position.x + source.size.width / 2,
            y: source.position.y,
          },
        ]
      } else {
        let middle_x = (source_x + target_x) / 2
        [
          { x: source_x, y: source_y },
          { x: middle_x, y: source_y },
          { x: middle_x, y: target_y },
          { x: target_x, y: target_y },
        ]
      }
    }
    _ => []
  }
}

///|
/// Place nodes in rank columns and route edges orthogonally. The algorithm is
/// deliberately small and deterministic so it can run on native and JS targets.
pub fn layout_flow(
  graph : FlowGraph,
  config : FlowLayoutConfig,
) -> FlowGraph {
  let nodes : Array[FlowNode] = []
  for index, node in graph.nodes {
    let mut lane = 0
    for previous_index = 0; previous_index < index; previous_index = previous_index + 1 {
      if graph.nodes[previous_index].rank == node.rank {
        lane = lane + 1
      }
    }
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
    nodes.push({
      ..node,
      position: {
        x: config.padding + node.rank * (config.default_node_width + config.horizontal_gap),
        y: config.padding + lane * (config.default_node_height + config.vertical_gap),
      },
      size: { width, height },
    })
  }
  let edges : Array[FlowEdge] = []
  for edge in graph.edges {
    edges.push({ ..edge, route: route_flow_edge(edge, nodes) })
  }
  { ..graph, nodes, edges }
}

///|
/// Return the bounding rectangle of all nodes.
pub fn flow_bounds(graph : FlowGraph) -> FlowBounds {
  if graph.nodes.is_empty() {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  let first = graph.nodes[0]
  let mut left = first.position.x
  let mut top = first.position.y
  let mut right = first.position.x + first.size.width
  let mut bottom = first.position.y + first.size.height
  for node in graph.nodes {
    left = flow_min(left, node.position.x)
    top = flow_min(top, node.position.y)
    right = flow_max(right, node.position.x + node.size.width)
    bottom = flow_max(bottom, node.position.y + node.size.height)
  }
  { x: left, y: top, width: right - left, height: bottom - top }
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
    },
  }
}

///|
/// Fit every node inside the supplied viewport dimensions.
pub fn fit_flow_view(
  graph : FlowGraph,
  viewport_width : Int,
  viewport_height : Int,
  padding : Int,
) -> FlowGraph {
  let bounds = flow_bounds(graph)
  if bounds.width <= 0 || bounds.height <= 0 {
    return { ..graph, viewport: FlowViewport::default() }
  }
  let available_width = flow_max(1, viewport_width - padding * 2)
  let available_height = flow_max(1, viewport_height - padding * 2)
  let zoom_x = available_width * 100 / bounds.width
  let zoom_y = available_height * 100 / bounds.height
  let zoom_percent = flow_clamp(flow_min(zoom_x, zoom_y), 10, 400)
  {
    ..graph,
    viewport: {
      x: padding - bounds.x * zoom_percent / 100,
      y: padding - bounds.y * zoom_percent / 100,
      zoom_percent,
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
/// Render the flow graph as standalone SVG. Interaction state is represented by
/// CSS classes, while the same geometry remains available to a Rabbita JS view.
pub fn flow_to_svg(graph : FlowGraph) -> String {
  let bounds = flow_bounds(graph)
  let width = flow_max(1, bounds.x + bounds.width + 32)
  let height = flow_max(1, bounds.y + bounds.height + 32)
  let output = StringBuilder::new()
  output.write_string(
    "<svg xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" viewBox=\"0 0 ",
  )
  output.write_object(width)
  output.write_char(' ')
  output.write_object(height)
  output.write_string(
    "\"><defs><marker id=\"flow-arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><style>.flow-edge{fill:none;stroke:#94a3b8;stroke-width:2;marker-end:url(#flow-arrow)}.flow-edge.selected{stroke:#2563eb;stroke-width:3}.flow-node rect{fill:#fff;stroke:#94a3b8;stroke-width:2}.flow-node.initial rect{stroke:#2563eb}.flow-node.failure rect{fill:#fff1f2;stroke:#dc2626}.flow-node.selected rect{stroke:#1d4ed8;stroke-width:3}.flow-label{fill:#172033;font:700 14px system-ui,sans-serif}.flow-kind{fill:#64748b;font:10px ui-monospace,monospace}.flow-edge-label{fill:#475569;font:11px system-ui,sans-serif}</style><g transform=\"translate(",
  )
  output.write_object(graph.viewport.x)
  output.write_char(' ')
  output.write_object(graph.viewport.y)
  output.write_string(") scale(")
  output.write_string(flow_zoom_text(graph.viewport.zoom_percent))
  output.write_string(")\">")
  for edge in graph.edges {
    if !edge.route.is_empty() {
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
      output.write_string(flow_xml_escape(edge.label))
      output.write_string("</title>")
      let label_point = edge.route[edge.route.length() / 2]
      output.write_string("<text class=\"flow-edge-label\" x=\"")
      output.write_object(label_point.x + 6)
      output.write_string("\" y=\"")
      output.write_object(label_point.y - 6)
      output.write_string("\">")
      output.write_string(flow_xml_escape(edge.label))
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
