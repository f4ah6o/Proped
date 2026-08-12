///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let is_ready = ready(model)
  let current_phase = phase(model)
  let status_message = if model.submitted {
    "Thanks for subscribing!"
  } else if current_phase == "invalid" {
    "Enter the sample email and accept the consent checkbox to continue."
  } else {
    "The atlas follows this form through reachable states."
  }
  let consent_message = if model.consented {
    "Consent: accepted"
  } else {
    "Consent: required"
  }
  let page = @html.main_(class="newsletter-demo", [
    @html.h1("Newsletter signup"),
    @html.p("A small Rabbita model rendered by Proped."),
    @html.div(class="state", [
      @html.strong("State: "),
      @html.text(current_phase),
    ]),
    @html.label(for_="email", "Email"),
    @html.input(
      id="email",
      value=model.email,
      placeholder="alice@example.com",
      required=true,
    ),
    @html.label(for_="consent", [
      @html.input(
        input_type=@html.InputType::Checkbox,
        id="consent",
        checked=model.consented,
      ),
      @html.text(consent_message),
    ]),
    @html.button(disabled=!is_ready, "Subscribe"),
    @html.p(status_message),
  ])
  @rabbita.Val::constant(page)
}
