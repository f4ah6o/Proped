///|
// Adapted from dowdiness/canopy's Rabbita resizable, menu, and tabs modules
// at revision cb41945b04801084e8abe1d8edc27eb0cdce4a1c.
//
// The adapter preserves each component's pure state transition rules and wraps
// them in one finite model. Browser focus, pointer subscriptions, and event
// dispatch are represented as typed messages. The public resizable `NudgeBy`
// arithmetic remains 32-bit wrapping arithmetic, matching the pinned source.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.

///|
pub(all) enum ResizeEdge {
  East
  South
  SouthEast
} derive(Debug, Eq)

///|
pub fn ResizeEdge::to_string(self : ResizeEdge) -> String {
  match self {
    East => "east"
    South => "south"
    SouthEast => "south-east"
  }
}

///|
pub(all) struct ResizeDrag {
  edge : ResizeEdge
  origin_x : Int
  origin_y : Int
  base_w : Int
  base_h : Int
} derive(Debug, Eq)

///|
pub(all) struct ResizeState {
  w : Int
  h : Int
  min_w : Int
  max_w : Int
  min_h : Int
  max_h : Int
  drag : ResizeDrag?
} derive(Debug, Eq)

///|
pub(all) struct MenuState {
  item_count : Int
  focused : Int?
  open : Bool
} derive(Debug, Eq)

///|
pub(all) struct TabsState {
  tab_count : Int
  selected : Int
} derive(Debug, Eq)

///|
pub(all) struct Model {
  resize : ResizeState
  menu : MenuState
  tabs : TabsState
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  ResizeStart(ResizeEdge, Int, Int)
  ResizeMove(Int, Int)
  ResizeEnd
  ResizeNudge(Int, Int)
  MenuOpen
  MenuClose
  MenuNext
  MenuPrevious
  MenuFirst
  MenuLast
  MenuFocus(Int)
  MenuActivate(Int)
  MenuReset(Int)
  TabSelect(Int)
  TabKey(String)
  TabReset(Int, Int)
} derive(Debug, Eq)

///|
fn clamp_size(state : ResizeState, w : Int, h : Int) -> ResizeState {
  {
    ..state,
    w: w.clamp(min=state.min_w, max=state.max_w),
    h: h.clamp(min=state.min_h, max=state.max_h),
  }
}

///|
fn resizes_width(edge : ResizeEdge) -> Bool {
  edge is East || edge is SouthEast
}

///|
fn resizes_height(edge : ResizeEdge) -> Bool {
  edge is South || edge is SouthEast
}

///|
fn update_resize(state : ResizeState, msg : Msg) -> ResizeState {
  match msg {
    ResizeStart(edge, x, y) =>
      {
        ..state,
        drag: Some({
          edge,
          origin_x: x,
          origin_y: y,
          base_w: state.w,
          base_h: state.h,
        }),
      }
    ResizeMove(x, y) =>
      match state.drag {
        Some(drag) => {
          let delta_x = x - drag.origin_x
          let delta_y = y - drag.origin_y
          let raw_w = if resizes_width(drag.edge) {
            drag.base_w + delta_x
          } else {
            drag.base_w
          }
          let raw_h = if resizes_height(drag.edge) {
            drag.base_h + delta_y
          } else {
            drag.base_h
          }
          clamp_size(state, raw_w, raw_h)
        }
        None => state
      }
    ResizeEnd => { ..state, drag: None }
    ResizeNudge(dw, dh) => clamp_size(state, state.w + dw, state.h + dh)
    _ => state
  }
}

///|
fn normalize_count(count : Int) -> Int {
  count.max(0)
}

///|
fn first_focus(count : Int) -> Int? {
  if count > 0 {
    Some(0)
  } else {
    None
  }
}

///|
fn valid_focus(menu : MenuState, index : Int) -> Bool {
  index >= 0 && index < menu.item_count
}

///|
fn update_menu(menu : MenuState, msg : Msg) -> MenuState {
  match msg {
    MenuOpen => { ..menu, open: true }
    MenuClose => { ..menu, open: false }
    MenuNext =>
      if menu.item_count == 0 {
        { ..menu, focused: None }
      } else {
        let next = match menu.focused {
          Some(index) => (index + 1) % menu.item_count
          None => 0
        }
        { ..menu, focused: Some(next) }
      }
    MenuPrevious =>
      if menu.item_count == 0 {
        { ..menu, focused: None }
      } else {
        let previous = match menu.focused {
          Some(index) => (index + menu.item_count - 1) % menu.item_count
          None => menu.item_count - 1
        }
        { ..menu, focused: Some(previous) }
      }
    MenuFirst => { ..menu, focused: first_focus(menu.item_count) }
    MenuLast =>
      if menu.item_count > 0 {
        { ..menu, focused: Some(menu.item_count - 1) }
      } else {
        { ..menu, focused: None }
      }
    MenuFocus(index) =>
      if valid_focus(menu, index) {
        { ..menu, focused: Some(index) }
      } else {
        menu
      }
    MenuActivate(index) => if valid_focus(menu, index) { menu } else { menu }
    MenuReset(count) => {
      let item_count = normalize_count(count)
      { item_count, focused: first_focus(item_count), open: menu.open }
    }
    _ => menu
  }
}

///|
fn clamp_selected(selected : Int, count : Int) -> Int {
  if count <= 0 {
    0
  } else {
    selected.max(0).min(count - 1)
  }
}

///|
fn tab_nav_target(tabs : TabsState, key : String) -> Int? {
  if tabs.tab_count <= 0 {
    None
  } else {
    match key {
      "ArrowLeft" => Some((tabs.selected + tabs.tab_count - 1) % tabs.tab_count)
      "ArrowRight" => Some((tabs.selected + 1) % tabs.tab_count)
      "Home" => Some(0)
      "End" => Some(tabs.tab_count - 1)
      _ => None
    }
  }
}

///|
fn update_tabs(tabs : TabsState, msg : Msg) -> TabsState {
  match msg {
    TabSelect(index) =>
      { ..tabs, selected: clamp_selected(index, tabs.tab_count) }
    TabKey(key) =>
      match tab_nav_target(tabs, key) {
        Some(target) => { ..tabs, selected: target }
        None => tabs
      }
    TabReset(count, selected) => {
      let tab_count = normalize_count(count)
      { tab_count, selected: clamp_selected(selected, tab_count) }
    }
    _ => tabs
  }
}

///|
pub fn initial() -> Model {
  {
    resize: {
      w: 120,
      h: 90,
      min_w: 50,
      max_w: 300,
      min_h: 40,
      max_h: 220,
      drag: None,
    },
    menu: { item_count: 3, focused: Some(0), open: false },
    tabs: { tab_count: 3, selected: 0 },
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  {
    resize: update_resize(model.resize, msg),
    menu: update_menu(model.menu, msg),
    tabs: update_tabs(model.tabs, msg),
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  if model.resize.drag is None {
    result.push(ResizeStart(East, 0, 0))
    result.push(ResizeStart(South, 0, 0))
    result.push(ResizeStart(SouthEast, 0, 0))
  } else {
    result.push(ResizeMove(25, 35))
    result.push(ResizeMove(-1000, -1000))
    result.push(ResizeMove(1000, 1000))
    result.push(ResizeEnd)
  }
  result.push(ResizeNudge(10, 0))
  result.push(ResizeNudge(-10, 0))
  result.push(ResizeNudge(0, 10))
  result.push(ResizeNudge(0, -10))
  // Public Msg permits arbitrary Int values. This boundary value exercises
  // MoonBit Int32 wrapping before the upstream clamp runs.
  result.push(ResizeNudge(2147483647, 0))

  if model.menu.open {
    result.push(MenuClose)
    result.push(MenuNext)
    result.push(MenuPrevious)
    result.push(MenuFirst)
    result.push(MenuLast)
    result.push(MenuFocus(-1))
    result.push(MenuFocus(1))
    result.push(MenuFocus(99))
    result.push(MenuActivate(0))
  } else {
    result.push(MenuOpen)
  }
  result.push(MenuReset(0))
  result.push(MenuReset(3))

  result.push(TabSelect(-1))
  result.push(TabSelect(0))
  result.push(TabSelect(2))
  result.push(TabSelect(99))
  result.push(TabKey("ArrowLeft"))
  result.push(TabKey("ArrowRight"))
  result.push(TabKey("Home"))
  result.push(TabKey("End"))
  result.push(TabKey("ArrowDown"))
  result.push(TabReset(0, 3))
  result.push(TabReset(3, 1))
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    ResizeStart(edge, x, y) if x != 0 || y != 0 => [ResizeStart(edge, 0, 0)]
    ResizeMove(x, y) if x != 0 || y != 0 => [ResizeMove(0, 0)]
    ResizeNudge(dw, dh) if dw != 0 && dw != 2147483647 => [ResizeNudge(1, dh)]
    ResizeNudge(dw, dh) if dh != 0 => [ResizeNudge(dw, 0)]
    MenuFocus(index) if index != 0 => [MenuFocus(0)]
    MenuActivate(index) if index != 0 => [MenuActivate(0)]
    MenuReset(count) if count != 0 => [MenuReset(0)]
    TabSelect(index) if index != 0 => [TabSelect(0)]
    TabReset(count, selected) if count != 0 || selected != 0 => [TabReset(0, 0)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    ResizeStart(edge, x, y) => "resize-start:\{edge.to_string()}:\{x}:\{y}"
    ResizeMove(x, y) => "resize-move:\{x}:\{y}"
    ResizeEnd => "resize-end"
    ResizeNudge(dw, dh) => "resize-nudge:\{dw}:\{dh}"
    MenuOpen => "menu-open"
    MenuClose => "menu-close"
    MenuNext => "menu-next"
    MenuPrevious => "menu-previous"
    MenuFirst => "menu-first"
    MenuLast => "menu-last"
    MenuFocus(index) => "menu-focus:\{index}"
    MenuActivate(index) => "menu-activate:\{index}"
    MenuReset(count) => "menu-reset:\{count}"
    TabSelect(index) => "tab-select:\{index}"
    TabKey(key) => "tab-key:\{key.length()}:\{key}"
    TabReset(count, selected) => "tab-reset:\{count}:\{selected}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    ResizeStart(edge, x, y) =>
      "ResizeStart(edge=\{edge.to_string()}, x=\{x}, y=\{y})"
    ResizeMove(x, y) => "ResizeMove(x=\{x}, y=\{y})"
    ResizeEnd => "ResizeEnd"
    ResizeNudge(dw, dh) => "ResizeNudge(dw=\{dw}, dh=\{dh})"
    MenuOpen => "MenuOpen"
    MenuClose => "MenuClose"
    MenuNext => "MenuNext"
    MenuPrevious => "MenuPrevious"
    MenuFirst => "MenuFirst"
    MenuLast => "MenuLast"
    MenuFocus(index) => "MenuFocus(\{index})"
    MenuActivate(index) => "MenuActivate(\{index})"
    MenuReset(count) => "MenuReset(\{count})"
    TabSelect(index) => "TabSelect(\{index})"
    TabKey(key) => "TabKey(\{key.escape(quote=true)})"
    TabReset(count, selected) =>
      "TabReset(count=\{count}, selected=\{selected})"
  }
}

///|
fn option_int(output : StringBuilder, value : Int?) -> Unit {
  match value {
    Some(value) => output.write_object(value)
    None => output.write_string("none")
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("canopy-components|size=")
  output.write_object(model.resize.w)
  output.write_char(':')
  output.write_object(model.resize.h)
  output.write_string("|drag=")
  match model.resize.drag {
    Some(drag) => {
      output.write_string(drag.edge.to_string())
      output.write_char(':')
      output.write_object(drag.origin_x)
      output.write_char(':')
      output.write_object(drag.origin_y)
      output.write_char(':')
      output.write_object(drag.base_w)
      output.write_char(':')
      output.write_object(drag.base_h)
    }
    None => output.write_string("none")
  }
  output.write_string("|menu=")
  output.write_object(model.menu.item_count)
  output.write_char(':')
  option_int(output, model.menu.focused)
  output.write_char(':')
  output.write_object(model.menu.open)
  output.write_string("|tabs=")
  output.write_object(model.tabs.tab_count)
  output.write_char(':')
  output.write_object(model.tabs.selected)
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let focused = match model.menu.focused {
    Some(value) => value.to_string()
    None => "none"
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Canopy components"),
      @html.div(
        class="resizable",
        "width=\{model.resize.w};height=\{model.resize.h};resizing=\{model.resize.drag is Some(_)}",
      ),
      @html.div(
        class="menu",
        "open=\{model.menu.open};count=\{model.menu.item_count};focused=\{focused}",
      ),
      @html.div(
        class="tabs",
        "count=\{model.tabs.tab_count};selected=\{model.tabs.selected}",
      ),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/canopy-components.json", "src/vendor/canopy_components/upstream/resizable_types.mbt.txt",
    "src/vendor/canopy_components/upstream/resizable_update.mbt.txt", "src/vendor/canopy_components/upstream/menu_types.mbt.txt",
    "src/vendor/canopy_components/upstream/menu_update.mbt.txt", "src/vendor/canopy_components/upstream/tabs_types.mbt.txt",
    "src/vendor/canopy_components/canopy_components.mbt",
  ]
}

///|
fn resize_in_bounds(state : ResizeState) -> Bool {
  state.w >= state.min_w &&
  state.w <= state.max_w &&
  state.h >= state.min_h &&
  state.h <= state.max_h
}

///|
fn menu_focus_valid(menu : MenuState) -> Bool {
  match menu.focused {
    Some(index) => index >= 0 && index < menu.item_count
    None => menu.item_count == 0
  }
}

///|
fn tabs_valid(tabs : TabsState) -> Bool {
  if tabs.tab_count == 0 {
    tabs.selected == 0
  } else {
    tabs.selected >= 0 && tabs.selected < tabs.tab_count
  }
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("resizable size remains inside constraints", fn(
      model,
      _,
    ) {
      if resize_in_bounds(model.resize) {
        @proped.Pass
      } else {
        @proped.Fail("resizable size escaped min/max constraints")
      }
    }),
    @proped.transition_property(
      "positive resize nudges do not decrease width",
      fn(before, msg, after) {
        match msg {
          ResizeNudge(dw, _) if dw > 0 && after.resize.w < before.resize.w =>
            @proped.Fail(
              "positive width nudge moved width backward from \{before.resize.w} to \{after.resize.w}",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "stale pointer movement after resize end is ignored",
      fn(before, msg, after) {
        match msg {
          ResizeMove(_, _) if before.resize.drag is None &&
            (
              after.resize.w != before.resize.w ||
              after.resize.h != before.resize.h
            ) =>
            @proped.Fail("pointer movement changed size without an active drag")
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("menu focus remains in range", fn(model, _) {
      if menu_focus_valid(model.menu) {
        @proped.Pass
      } else {
        @proped.Fail("menu focus is outside the current item range")
      }
    }),
    @proped.state_property("tab selection remains in range", fn(model, _) {
      if tabs_valid(model.tabs) {
        @proped.Pass
      } else {
        @proped.Fail("tab selection is outside the current tab range")
      }
    }),
    @proped.state_property("rendered component state matches model", fn(
      model,
      html,
    ) {
      if !html.contains("width=\{model.resize.w};height=\{model.resize.h}") {
        @proped.Fail("rendered size does not match model")
      } else if !html.contains(
          "count=\{model.tabs.tab_count};selected=\{model.tabs.selected}",
        ) {
        @proped.Fail("rendered tab state does not match model")
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
  { cases: 384, max_depth: 12, max_states: 720, seed: 79, shrink_budget: 4096 }
}
