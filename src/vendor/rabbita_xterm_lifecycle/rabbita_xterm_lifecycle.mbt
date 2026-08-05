///|
// Clean-room native lifecycle adapter for moonbit-community/rabbita_xterm at
// revision 9734f6a39ce3899dbf6738fa3a100c2cebaefc23.
//
// The adapter preserves the managed State::update semantics relevant to loading,
// terminal events, writes, themes, and explicit resize. Browser resources are
// represented by generation-tagged lifecycle messages. The upstream Resize and
// Resized branches intentionally retain their lack of positive-dimension
// validation so the pinned behavior can be explored without executing xterm.js.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md.

///|
pub(all) enum Status {
  Loading
  Ready
  Failed(String)
  Disposed
} derive(Debug, Eq)

///|
pub(all) struct Model {
  generation : Int
  status : Status
  cols : Int
  rows : Int
  title : String
  background : String
  foreground : String
  mount_count : Int
  dispose_count : Int
  listeners_active : Bool
  writes : Array[String]
  input_events : Array[String]
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  XtermLoaded(Int)
  XtermLoadFailed(Int, String)
  Data(Int, String)
  Resized(Int, Int, Int)
  TitleChanged(Int, String)
  Write(String)
  Resize(Int, Int)
  SetTheme(String, String)
  Dispose
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  {
    generation: 1,
    status: Loading,
    cols: 80,
    rows: 24,
    title: "terminal",
    background: "#101418",
    foreground: "#dce4ea",
    mount_count: 0,
    dispose_count: 0,
    listeners_active: false,
    writes: [],
    input_events: [],
  }
}

///|
fn current_callback(model : Model, generation : Int) -> Bool {
  generation == model.generation && !(model.status is Disposed)
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    XtermLoaded(generation) =>
      if current_callback(model, generation) && model.status is Loading {
        {
          ..model,
          status: Ready,
          mount_count: model.mount_count + 1,
          listeners_active: true,
        }
      } else {
        model
      }
    XtermLoadFailed(generation, message) =>
      if current_callback(model, generation) && model.status is Loading {
        { ..model, status: Failed("xterm.js failed: \{message}") }
      } else {
        model
      }
    Data(generation, data) =>
      if current_callback(model, generation) && model.listeners_active {
        { ..model, input_events: model.input_events + [data] }
      } else {
        model
      }
    Resized(generation, cols, rows) =>
      if current_callback(model, generation) && model.listeners_active {
        // Pinned upstream behavior: event dimensions are stored without
        // validating that xterm.js-compatible dimensions are positive.
        { ..model, cols, rows }
      } else {
        model
      }
    TitleChanged(generation, title) =>
      if current_callback(model, generation) && model.listeners_active {
        { ..model, title, }
      } else {
        model
      }
    Write(data) =>
      if model.status is Ready {
        // Strings model UTF-8 chunks at the managed boundary. No decoding or
        // concatenation occurs before xterm.js receives each write.
        { ..model, writes: model.writes + [data] }
      } else {
        model
      }
    Resize(cols, rows) =>
      // Pinned upstream behavior: public resize updates logical state
      // immediately, even before Ready, and does not validate dimensions.
      { ..model, cols, rows }
    SetTheme(background, foreground) => { ..model, background, foreground }
    Dispose =>
      if model.status is Disposed {
        model
      } else {
        {
          ..model,
          generation: model.generation + 1,
          status: Disposed,
          dispose_count: model.dispose_count + 1,
          listeners_active: false,
        }
      }
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = [
    Resize(80, 24),
    Resize(1, 1),
    Resize(0, 24),
    SetTheme("#101418", "#dce4ea"),
    SetTheme("#f8fbf8", "#1d2926"),
    Write("ascii"),
    Write("日本語"),
    Write("🙂"),
    Dispose,
  ]
  let generation = model.generation
  result.push(XtermLoaded(generation))
  result.push(XtermLoadFailed(generation, "load failed"))
  result.push(Data(generation, "a"))
  result.push(Data(generation, "日本語"))
  result.push(Resized(generation, 100, 30))
  result.push(TitleChanged(generation, "shell"))
  // Previous-generation callbacks exercise listener disposal and stale
  // asynchronous completion without allowing unbounded generations.
  if generation > 1 {
    result.push(XtermLoaded(generation - 1))
    result.push(Data(generation - 1, "stale"))
    result.push(Resized(generation - 1, 200, 60))
    result.push(TitleChanged(generation - 1, "stale"))
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    Resize(cols, rows) if cols != 0 => [Resize(0, rows)]
    Resize(cols, rows) if rows != 0 => [Resize(cols, 0)]
    Resized(generation, cols, rows) if cols != 0 =>
      [Resized(generation, 0, rows)]
    Resized(generation, cols, rows) if rows != 0 =>
      [Resized(generation, cols, 0)]
    Data(generation, data) if !data.is_empty() => [Data(generation, "")]
    Write(data) if !data.is_empty() => [Write("")]
    TitleChanged(generation, title) if !title.is_empty() =>
      [TitleChanged(generation, "")]
    SetTheme(background, foreground) if !background.is_empty() ||
      !foreground.is_empty() => [SetTheme("", "")]
    XtermLoadFailed(generation, message) if !message.is_empty() =>
      [XtermLoadFailed(generation, "")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    XtermLoaded(generation) => "xterm-loaded:\{generation}"
    XtermLoadFailed(generation, message) =>
      "xterm-load-failed:\{generation}:\{message.length()}:\{message}"
    Data(generation, data) => "data:\{generation}:\{data.length()}:\{data}"
    Resized(generation, cols, rows) => "resized:\{generation}:\{cols}:\{rows}"
    TitleChanged(generation, title) =>
      "title:\{generation}:\{title.length()}:\{title}"
    Write(data) => "write:\{data.length()}:\{data}"
    Resize(cols, rows) => "resize:\{cols}:\{rows}"
    SetTheme(background, foreground) =>
      "theme:\{background.length()}:\{background}:\{foreground.length()}:\{foreground}"
    Dispose => "dispose"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    XtermLoaded(generation) => "XtermLoaded(generation=\{generation})"
    XtermLoadFailed(generation, message) =>
      "XtermLoadFailed(generation=\{generation}, message=\{message.escape(quote=true)})"
    Data(generation, data) =>
      "Data(generation=\{generation}, data=\{data.escape(quote=true)})"
    Resized(generation, cols, rows) =>
      "Resized(generation=\{generation}, cols=\{cols}, rows=\{rows})"
    TitleChanged(generation, title) =>
      "TitleChanged(generation=\{generation}, title=\{title.escape(quote=true)})"
    Write(data) => "Write(\{data.escape(quote=true)})"
    Resize(cols, rows) => "Resize(cols=\{cols}, rows=\{rows})"
    SetTheme(background, foreground) =>
      "SetTheme(background=\{background.escape(quote=true)}, foreground=\{foreground.escape(quote=true)})"
    Dispose => "Dispose"
  }
}

///|
fn status_text(status : Status) -> String {
  match status {
    Loading => "loading"
    Ready => "ready"
    Failed(message) => "failed:\{message}"
    Disposed => "disposed"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("rabbita-xterm|")
  output.write_object(model.generation)
  output.write_char('|')
  output.write_string(status_text(model.status))
  output.write_char('|')
  output.write_object(model.cols)
  output.write_char('x')
  output.write_object(model.rows)
  output.write_char('|')
  output.write_object(model.mount_count)
  output.write_char('|')
  output.write_object(model.dispose_count)
  output.write_char('|')
  output.write_object(model.listeners_active)
  output.write_char('|')
  output.write_string(model.title)
  output.write_char('|')
  output.write_string(model.background)
  output.write_char('|')
  output.write_string(model.foreground)
  output.write_char('|')
  output.write_string(model.writes.join("\u{1f}"))
  output.write_char('|')
  output.write_string(model.input_events.join("\u{1f}"))
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Rabbita xterm lifecycle"),
      @html.div(
        class="status",
        "status=\{status_text(model.status)};generation=\{model.generation}",
      ),
      @html.div(class="size", "cols=\{model.cols};rows=\{model.rows}"),
      @html.div(
        class="lifecycle",
        "mounts=\{model.mount_count};disposes=\{model.dispose_count};listeners=\{model.listeners_active}",
      ),
      @html.div(class="title", model.title),
      @html.div(class="writes", model.writes.join("|")),
      @html.div(class="input", model.input_events.join("|")),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/rabbita-xterm-lifecycle.json", "src/vendor/rabbita_xterm_lifecycle/upstream/xterm.mbt.txt",
    "src/vendor/rabbita_xterm_lifecycle/rabbita_xterm_lifecycle.mbt",
  ]
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("terminal dimensions remain positive", fn(model, _) {
      if model.cols > 0 && model.rows > 0 {
        @proped.Pass
      } else {
        @proped.Fail(
          "terminal dimensions must be positive, got \{model.cols}x\{model.rows}",
        )
      }
    }),
    @proped.transition_property("terminal mounts at most once", fn(
      before,
      _,
      after,
    ) {
      if after.mount_count > 1 || after.mount_count < before.mount_count {
        @proped.Fail("terminal mount count is not single-shot")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("dispose is idempotent", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        Dispose if before.status is Disposed && before != after =>
          @proped.Fail("second dispose changed terminal state")
        _ =>
          if after.dispose_count > 1 {
            @proped.Fail("terminal disposed more than once")
          } else {
            @proped.Pass
          }
      }
    }),
    @proped.transition_property("stale callbacks after dispose are ignored", fn(
      before,
      msg,
      after,
    ) {
      let callback_generation = match msg {
        XtermLoaded(generation) => Some(generation)
        Data(generation, _) => Some(generation)
        Resized(generation, _, _) => Some(generation)
        TitleChanged(generation, _) => Some(generation)
        _ => None
      }
      match callback_generation {
        Some(generation) if generation != before.generation && before != after =>
          @proped.Fail("stale lifecycle callback changed terminal state")
        _ => @proped.Pass
      }
    }),
    @proped.transition_property("UTF-8 write chunks remain intact", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        Write(data) if before.status is Ready =>
          if after.writes.length() == before.writes.length() + 1 &&
            after.writes[after.writes.length() - 1] == data {
            @proped.Pass
          } else {
            @proped.Fail("terminal write changed or merged the UTF-8 chunk")
          }
        _ => @proped.Pass
      }
    }),
    @proped.state_property("rendered terminal state matches model", fn(
      model,
      html,
    ) {
      if !html.contains("cols=\{model.cols};rows=\{model.rows}") {
        @proped.Fail("rendered dimensions do not match model")
      } else if !html.contains(
          "mounts=\{model.mount_count};disposes=\{model.dispose_count};listeners=\{model.listeners_active}",
        ) {
        @proped.Fail("rendered lifecycle does not match model")
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
  { cases: 320, max_depth: 10, max_states: 640, seed: 97, shrink_budget: 4096 }
}
