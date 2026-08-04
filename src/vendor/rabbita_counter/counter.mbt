///|
// Adapted from moonbit-community/rabbita examples/counter at revision
// 67e8169efa1bb2e8bd17018b62b41211cbc4c357.
//
// Changes from upstream:
// - expose the model, messages, update, and view as a reusable library;
// - bound generated actions to [-3, 3] so state exploration terminates;
// - render the same visible counter controls without mounting a browser app.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.
pub(all) enum Msg {
  Inc
  Dec
} derive(Debug, Eq)

///|
pub fn initial() -> Int {
  0
}

///|
pub fn update(model : Int, msg : Msg) -> Int {
  match msg {
    Inc => model + 1
    Dec => model - 1
  }
}

///|
pub fn actions(model : Int) -> Array[Msg] {
  if model <= -3 {
    [Inc]
  } else if model >= 3 {
    [Dec]
  } else {
    [Inc, Dec]
  }
}

///|
pub fn shrink(_ : Msg) -> Array[Msg] {
  []
}

///|
pub fn view(model : Int) -> @rabbita.Val[@rabbita.Html] {
  let page = @html.div([
    @html.h1("\{model}"),
    @html.button("+"),
    @html.button("-"),
  ])
  @rabbita.Val::constant(page)
}

///|
pub fn fingerprint(model : Int) -> String {
  "rabbita-counter:\{model}"
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Inc => "inc"
    Dec => "dec"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Inc => "Increment"
    Dec => "Decrement"
  }
}

///|
pub fn dependencies(_ : Int) -> Array[String] {
  [
    "src/vendor/rabbita_counter/upstream/main.mbt.txt", "src/vendor/rabbita_counter/upstream/styles.css",
    "src/vendor/rabbita_counter/counter.mbt",
  ]
}

///|
pub fn properties() -> Array[@proped.Property[Int, Msg]] {
  [
    @proped.state_property("counter remains within exploration bounds", fn(
      model,
      _,
    ) {
      if model < -3 || model > 3 {
        @proped.Fail("counter escaped the configured [-3, 3] state space")
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("rendered heading contains the model", fn(
      model,
      html,
    ) {
      if html.contains("<h1>\{model}</h1>") {
        @proped.Pass
      } else {
        @proped.Fail("rendered counter did not contain the current value")
      }
    }),
  ]
}

///|
pub fn machine() -> @proped.Machine[Int, Msg] {
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
  { cases: 32, max_depth: 10, max_states: 16, seed: 11, shrink_budget: 256 }
}
