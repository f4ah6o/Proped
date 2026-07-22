///|
fn newsletter_view(model : NewsletterModel) -> @rabbita.Val[@rabbita.Html] {
  let ready = newsletter_ready(model)
  let phase = newsletter_phase(model)
  let status_message = if model.submitted {
    "Thanks for subscribing!"
  } else if phase == "invalid" {
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
    @html.p("A small Rabbita model rendered by Proped Rabbita."),
    @html.div(class="state", [@html.strong("State: "), @html.text(phase)]),
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
    @html.button(disabled=!ready, "Subscribe"),
    @html.p(status_message),
  ])
  @rabbita.Val::constant(page)
}
