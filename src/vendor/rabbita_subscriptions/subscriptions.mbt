///|
// Adapted from moonbit-community/rabbita examples/subscriptions at revision
// 67e8169efa1bb2e8bd17018b62b41211cbc4c357.
//
// Changes from upstream:
// - expose the seven subscription tabs and pure update model as a package;
// - replace browser event objects with deterministic typed payloads;
// - model one already-queued timer callback after pause as `pending_tick`;
// - preserve upstream Tick behavior, which increments even when paused and is
//   detected as a stale-subscription failure.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.
pub(all) enum Tab {
  Every
  Resize
  Scroll
  KeyDown
  KeyUp
  VisibilityChange
  MouseMove
} derive(Debug, Eq)

///|
pub(all) struct AppState {
  active_tab : Tab
  tick_count : Int
  ticking : Bool
  resize_count : Int
  viewport_width : Int
  viewport_height : Int
  scroll_count : Int
  scroll_x : Int
  scroll_y : Int
  scroll_width : Int
  scroll_height : Int
  keydown_count : Int
  last_key_down : String
  last_key_down_code : String
  last_key_down_repeat : Bool
  keyup_count : Int
  last_key_up : String
  last_key_up_code : String
  visibility_hidden : Bool
  visibility_count : Int
  mouse_moves : Int
  mouse_x : Int
  mouse_y : Int
} derive(Debug, Eq)

///|
pub(all) struct Model {
  app : AppState
  pending_tick : Bool
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SelectTab(Tab)
  Tick
  ToggleTicker
  ViewportChanged(Int, Int)
  PageScrolled(Int, Int, Int, Int)
  KeyPressed(String, String, Bool)
  KeyReleased(String, String)
  VisibilityChanged(Bool)
  MouseMoved(Int, Int)
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  {
    app: {
      active_tab: Every,
      tick_count: 0,
      ticking: true,
      resize_count: 0,
      viewport_width: 1280,
      viewport_height: 720,
      scroll_count: 0,
      scroll_x: 0,
      scroll_y: 0,
      scroll_width: 0,
      scroll_height: 0,
      keydown_count: 0,
      last_key_down: "-",
      last_key_down_code: "-",
      last_key_down_repeat: false,
      keyup_count: 0,
      last_key_up: "-",
      last_key_up_code: "-",
      visibility_hidden: false,
      visibility_count: 0,
      mouse_moves: 0,
      mouse_x: 0,
      mouse_y: 0,
    },
    pending_tick: false,
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  let app = model.app
  match msg {
    SelectTab(tab) => { ..model, app: { ..app, active_tab: tab } }
    Tick =>
      { app: { ..app, tick_count: app.tick_count + 1 }, pending_tick: false }
    ToggleTicker => {
      let next_ticking = !app.ticking
      {
        app: { ..app, ticking: next_ticking },
        pending_tick: if app.ticking {
          true
        } else {
          false
        },
      }
    }
    ViewportChanged(width, height) =>
      {
        ..model,
        app: {
          ..app,
          resize_count: app.resize_count + 1,
          viewport_width: width,
          viewport_height: height,
        },
      }
    PageScrolled(x, y, width, height) =>
      {
        ..model,
        app: {
          ..app,
          scroll_count: app.scroll_count + 1,
          scroll_x: x,
          scroll_y: y,
          scroll_width: width,
          scroll_height: height,
        },
      }
    KeyPressed(key, code, repeat) =>
      {
        ..model,
        app: {
          ..app,
          keydown_count: app.keydown_count + 1,
          last_key_down: key,
          last_key_down_code: code,
          last_key_down_repeat: repeat,
        },
      }
    KeyReleased(key, code) =>
      {
        ..model,
        app: {
          ..app,
          keyup_count: app.keyup_count + 1,
          last_key_up: key,
          last_key_up_code: code,
        },
      }
    VisibilityChanged(hidden) =>
      {
        ..model,
        app: {
          ..app,
          visibility_hidden: hidden,
          visibility_count: app.visibility_count + 1,
        },
      }
    MouseMoved(x, y) =>
      {
        ..model,
        app: { ..app, mouse_moves: app.mouse_moves + 1, mouse_x: x, mouse_y: y },
      }
  }
}

///|
fn Tab::tag(self : Tab) -> String {
  match self {
    Every => "every"
    Resize => "resize"
    Scroll => "scroll"
    KeyDown => "keydown"
    KeyUp => "keyup"
    VisibilityChange => "visibility"
    MouseMove => "mouse"
  }
}

///|
fn Tab::label(self : Tab) -> String {
  match self {
    Every => "Every"
    Resize => "Resize"
    Scroll => "Scroll"
    KeyDown => "KeyDown"
    KeyUp => "KeyUp"
    VisibilityChange => "VisibilityChange"
    MouseMove => "MouseMove"
  }
}

///|
fn tabs() -> Array[Tab] {
  [Every, Resize, Scroll, KeyDown, KeyUp, VisibilityChange, MouseMove]
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  for tab in tabs() {
    if tab != model.app.active_tab {
      result.push(SelectTab(tab))
    }
  }
  match model.app.active_tab {
    Every => {
      result.push(ToggleTicker)
      if model.app.ticking || model.pending_tick {
        result.push(Tick)
      }
    }
    Resize => {
      result.push(ViewportChanged(800, 600))
      result.push(ViewportChanged(1920, 1080))
    }
    Scroll => {
      result.push(PageScrolled(0, 120, 1280, 2400))
      result.push(PageScrolled(40, 400, 1920, 3600))
    }
    KeyDown => {
      result.push(KeyPressed("a", "KeyA", false))
      result.push(KeyPressed("a", "KeyA", true))
    }
    KeyUp => result.push(KeyReleased("a", "KeyA"))
    VisibilityChange =>
      result.push(VisibilityChanged(!model.app.visibility_hidden))
    MouseMove => {
      result.push(MouseMoved(10, 20))
      result.push(MouseMoved(640, 360))
    }
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SelectTab(tab) if tab != Every => [SelectTab(Every)]
    ViewportChanged(width, height) if width != 0 || height != 0 =>
      [ViewportChanged(0, 0)]
    PageScrolled(x, y, width, height) if x != 0 ||
      y != 0 ||
      width != 0 ||
      height != 0 => [PageScrolled(0, 0, 0, 0)]
    KeyPressed(key, code, repeat) if key != "" || code != "" || repeat =>
      [KeyPressed("", "", false)]
    KeyReleased(key, code) if key != "" || code != "" => [KeyReleased("", "")]
    MouseMoved(x, y) if x != 0 || y != 0 => [MouseMoved(0, 0)]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SelectTab(tab) => "tab:\{tab.tag()}"
    Tick => "tick"
    ToggleTicker => "toggle-ticker"
    ViewportChanged(width, height) => "resize:\{width}:\{height}"
    PageScrolled(x, y, width, height) => "scroll:\{x}:\{y}:\{width}:\{height}"
    KeyPressed(key, code, repeat) =>
      "keydown:\{key.length()}:\{key}:\{code.length()}:\{code}:\{repeat}"
    KeyReleased(key, code) =>
      "keyup:\{key.length()}:\{key}:\{code.length()}:\{code}"
    VisibilityChanged(hidden) => "visibility:\{hidden}"
    MouseMoved(x, y) => "mouse:\{x}:\{y}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SelectTab(tab) => "SelectTab(\{tab.label()})"
    Tick => "Tick"
    ToggleTicker => "ToggleTicker"
    ViewportChanged(width, height) => "ViewportChanged(\{width}, \{height})"
    PageScrolled(x, y, width, height) =>
      "PageScrolled(\{x}, \{y}, \{width}, \{height})"
    KeyPressed(key, code, repeat) =>
      "KeyPressed(\{key.escape(quote=true)}, \{code.escape(quote=true)}, \{repeat})"
    KeyReleased(key, code) =>
      "KeyReleased(\{key.escape(quote=true)}, \{code.escape(quote=true)})"
    VisibilityChanged(hidden) => "VisibilityChanged(\{hidden})"
    MouseMoved(x, y) => "MouseMoved(\{x}, \{y})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let app = model.app
  "rabbita-subscriptions|tab=\{app.active_tab.tag()}|tick=\{app.tick_count}:\{app.ticking}:\{model.pending_tick}|resize=\{app.resize_count}:\{app.viewport_width}:\{app.viewport_height}|scroll=\{app.scroll_count}:\{app.scroll_x}:\{app.scroll_y}:\{app.scroll_width}:\{app.scroll_height}|keydown=\{app.keydown_count}:\{app.last_key_down.length()}:\{app.last_key_down}:\{app.last_key_down_code.length()}:\{app.last_key_down_code}:\{app.last_key_down_repeat}|keyup=\{app.keyup_count}:\{app.last_key_up.length()}:\{app.last_key_up}:\{app.last_key_up_code.length()}:\{app.last_key_up_code}|visibility=\{app.visibility_hidden}:\{app.visibility_count}|mouse=\{app.mouse_moves}:\{app.mouse_x}:\{app.mouse_y}"
}

///|
fn output_lines(app : AppState) -> Array[@rabbita.Html] {
  match app.active_tab {
    Every =>
      [
        @html.p("ticking \{app.ticking}"),
        @html.p("tick_count \{app.tick_count}"),
      ]
    Resize =>
      [
        @html.p("resize_count \{app.resize_count}"),
        @html.p("viewport \{app.viewport_width}x\{app.viewport_height}"),
      ]
    Scroll =>
      [
        @html.p("scroll_count \{app.scroll_count}"),
        @html.p("scroll \{app.scroll_x},\{app.scroll_y}"),
      ]
    KeyDown =>
      [
        @html.p("keydown_count \{app.keydown_count}"),
        @html.p("last_key \{app.last_key_down}"),
      ]
    KeyUp =>
      [
        @html.p("keyup_count \{app.keyup_count}"),
        @html.p("last_key \{app.last_key_up}"),
      ]
    VisibilityChange =>
      [
        @html.p("hidden \{app.visibility_hidden}"),
        @html.p("visibility_count \{app.visibility_count}"),
      ]
    MouseMove =>
      [
        @html.p("mouse_moves \{app.mouse_moves}"),
        @html.p("client \{app.mouse_x},\{app.mouse_y}"),
      ]
  }
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let tab_buttons : Array[@rabbita.Html] = []
  for tab in tabs() {
    tab_buttons.push(
      @html.button(
        class=if tab == model.app.active_tab { "tab active" } else { "tab" },
        tab.label(),
      ),
    )
  }
  let page = @html.div(class="page", [
    @html.h1("subscriptions"),
    @html.div(class="tabs", tab_buttons),
    @html.div(class="output", output_lines(model.app)),
    @html.p("pending_tick \{model.pending_tick}"),
  ])
  @rabbita.Val::constant(page)
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "src/vendor/rabbita_subscriptions/upstream/client.mbt.txt", "src/vendor/rabbita_subscriptions/upstream/styles.css",
    "src/vendor/rabbita_subscriptions/subscriptions.mbt",
  ]
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property("paused ticker ignores queued tick", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        Tick if !before.app.ticking &&
          after.app.tick_count != before.app.tick_count =>
          @proped.Fail(
            "queued tick incremented paused counter from \{before.app.tick_count} to \{after.app.tick_count}",
          )
        _ => @proped.Pass
      }
    }),
    @proped.state_property("subscription counters stay non-negative", fn(
      model,
      _,
    ) {
      let app = model.app
      if app.tick_count < 0 ||
        app.resize_count < 0 ||
        app.scroll_count < 0 ||
        app.keydown_count < 0 ||
        app.keyup_count < 0 ||
        app.visibility_count < 0 ||
        app.mouse_moves < 0 {
        @proped.Fail("subscription counter became negative")
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("rendered output identifies active tab", fn(
      model,
      html,
    ) {
      if html.contains(model.app.active_tab.label()) {
        @proped.Pass
      } else {
        @proped.Fail("rendered tabs did not identify the active tab")
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
  { cases: 256, max_depth: 14, max_states: 640, seed: 43, shrink_budget: 4096 }
}
