///|
struct NewsletterModel {
  email : String
  consented : Bool
  submitted : Bool
} derive(Eq)

///|
enum NewsletterMsg {
  SetEmail(String)
  ToggleConsent
  Submit
  Reset
}

///|
fn newsletter_initial() -> NewsletterModel {
  { email: "", consented: false, submitted: false }
}

///|
fn newsletter_ready(model : NewsletterModel) -> Bool {
  model.email == "alice@example.com" && model.consented && !model.submitted
}

///|
fn newsletter_phase(model : NewsletterModel) -> String {
  if model.submitted {
    "submitted"
  } else if newsletter_ready(model) {
    "ready"
  } else if model.email == "" && !model.consented {
    "empty"
  } else {
    "invalid"
  }
}

///|
fn newsletter_update(
  model : NewsletterModel,
  msg : NewsletterMsg,
) -> NewsletterModel {
  match msg {
    SetEmail(email) => { email, consented: model.consented, submitted: false }
    ToggleConsent =>
      { email: model.email, consented: !model.consented, submitted: false }
    Submit =>
      if newsletter_ready(model) {
        { email: model.email, consented: model.consented, submitted: true }
      } else {
        model
      }
    Reset => newsletter_initial()
  }
}

///|
fn newsletter_actions(model : NewsletterModel) -> Array[NewsletterMsg] {
  if model.submitted {
    [Reset]
  } else if newsletter_ready(model) {
    [Submit, SetEmail(""), ToggleConsent, Reset]
  } else {
    [SetEmail(""), SetEmail("alice@example.com"), ToggleConsent, Reset]
  }
}

///|
fn newsletter_shrink(msg : NewsletterMsg) -> Array[NewsletterMsg] {
  match msg {
    SetEmail(email) if email != "" => [SetEmail("")]
    _ => []
  }
}

///|
fn newsletter_describe(msg : NewsletterMsg) -> String {
  match msg {
    SetEmail(email) => "SetEmail(\"\{email}\")"
    ToggleConsent => "ToggleConsent"
    Submit => "Submit"
    Reset => "Reset"
  }
}

///|
fn newsletter_action_id(msg : NewsletterMsg) -> String {
  match msg {
    SetEmail(email) => "set-email:\{email}"
    ToggleConsent => "toggle-consent"
    Submit => "submit"
    Reset => "reset"
  }
}

///|
fn newsletter_fingerprint(model : NewsletterModel) -> String {
  "newsletter:\{newsletter_phase(model)}:\{model.email}:\{model.consented}:\{model.submitted}"
}

///|
fn newsletter_dependencies(_ : NewsletterModel) -> Array[String] {
  ["src/demo/model.mbt", "src/demo/view.mbt"]
}
