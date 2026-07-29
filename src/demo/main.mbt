///|
fn newsletter_properties() -> Array[
  @proped.Property[NewsletterModel, NewsletterMsg],
] {
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
        Reset if after != newsletter_initial() =>
          @proped.Fail("reset did not restore the initial model")
        _ => @proped.Pass
      }
    }),
  ]
}

///|
fn newsletter_machine() -> @proped.Machine[NewsletterModel, NewsletterMsg] {
  @proped.rabbita_machine_with_action_id(
    newsletter_initial(),
    newsletter_update,
    newsletter_actions,
    newsletter_shrink,
    newsletter_view,
    newsletter_fingerprint,
    newsletter_action_id,
    newsletter_describe,
    newsletter_dependencies,
  )
}

///|
async fn main {
  let report = @proped.run(newsletter_machine(), newsletter_properties(), {
    cases: 24,
    max_depth: 8,
    max_states: 64,
    seed: 7,
    shrink_budget: 1024,
  })
  if !@fs.exists("demo/out") {
    @fs.mkdir("demo/out", recursive=true)
  }
  let html = @proped.report_to_html(report)
  let svg = @proped.report_to_flow_svg(report)
  let json = @proped.report_to_json(report)
  let dot = @proped.report_to_dot(report)
  @fs.write_file(
    "demo/out/atlas.html",
    html,
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "demo/out/atlas.svg",
    svg,
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "demo/out/atlas.json",
    json,
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "demo/out/atlas.dot",
    dot,
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  println("Proped Rabbita newsletter demo")
  println("states: \{report.states.length()}")
  println("transitions: \{report.transitions.length()}")
  println("property failures: \{report.failures.length()}")
  println("wrote demo/out/atlas.html")
  println("wrote demo/out/atlas.svg")
  println("wrote demo/out/atlas.json")
  println("wrote demo/out/atlas.dot")
}
