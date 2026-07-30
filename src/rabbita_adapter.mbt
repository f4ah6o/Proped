///|
/// Build an executable property machine from an Elm-style Rabbita model.
///
/// The adapter renders each model through Rabbita's server-side renderer, so
/// the core runner does not need a browser or Playwright.
pub fn[Model, Msg] rabbita_machine(
  initial : Model,
  update : (Model, Msg) -> Model,
  actions : (Model) -> Array[Msg],
  shrink : (Msg) -> Array[Msg],
  view : (Model) -> @rabbita.Val[@rabbita.Html],
  fingerprint : (Model) -> String,
  describe_msg : (Msg) -> String,
  dependencies : (Model) -> Array[String],
) -> Machine[Model, Msg] {
  rabbita_machine_with_action_id(
    initial, update, actions, shrink, view, fingerprint, describe_msg, describe_msg,
    dependencies,
  )
}

///|
/// Build a Rabbita machine with separate stable action IDs and display labels.
pub fn[Model, Msg] rabbita_machine_with_action_id(
  initial : Model,
  update : (Model, Msg) -> Model,
  actions : (Model) -> Array[Msg],
  shrink : (Msg) -> Array[Msg],
  view : (Model) -> @rabbita.Val[@rabbita.Html],
  fingerprint : (Model) -> String,
  action_id : (Msg) -> String,
  describe_msg : (Msg) -> String,
  dependencies : (Model) -> Array[String],
) -> Machine[Model, Msg] {
  {
    initial,
    update,
    actions,
    shrink,
    render: fn(model) { @rabbita.render_to_string(() => view(model)) },
    fingerprint,
    action_id,
    describe_msg,
    dependencies,
  }
}
