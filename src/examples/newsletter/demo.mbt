///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property("submitted requires valid consent", fn(model, _) {
      if model.submitted &&
        (model.email != "alice@example.com" || !model.consented) {
        @proped.Fail("submitted state lost valid consent")
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("submitted view shows confirmation", fn(
      model,
      html,
    ) {
      if model.submitted && !html.contains("Thanks for subscribing!") {
        @proped.Fail("submitted view did not show confirmation")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("reset returns to initial state", fn(
      _,
      msg,
      after,
    ) {
      match msg {
        Reset if after != initial() =>
          @proped.Fail("reset did not restore the initial model")
        _ => @proped.Pass
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
  { cases: 24, max_depth: 8, max_states: 64, seed: 7, shrink_budget: 1024 }
}
