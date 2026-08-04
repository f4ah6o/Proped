///|
pub(all) struct Model {
  email : String
  consented : Bool
  submitted : Bool
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SetEmail(String)
  ToggleConsent
  Submit
  Reset
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  { email: "", consented: false, submitted: false }
}

///|
pub fn ready(model : Model) -> Bool {
  model.email == "alice@example.com" && model.consented && !model.submitted
}

///|
pub fn phase(model : Model) -> String {
  if model.submitted {
    "submitted"
  } else if ready(model) {
    "ready"
  } else if model.email == "" && !model.consented {
    "empty"
  } else {
    "invalid"
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SetEmail(email) => { email, consented: model.consented, submitted: false }
    ToggleConsent =>
      { email: model.email, consented: !model.consented, submitted: false }
    Submit =>
      if ready(model) {
        { email: model.email, consented: model.consented, submitted: true }
      } else {
        model
      }
    Reset => initial()
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  if model.submitted {
    [Reset]
  } else if ready(model) {
    [Submit, SetEmail(""), ToggleConsent, Reset]
  } else {
    [SetEmail(""), SetEmail("alice@example.com"), ToggleConsent, Reset]
  }
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SetEmail(email) if email != "" => [SetEmail("")]
    _ => []
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SetEmail(email) => "SetEmail(\"\{email}\")"
    ToggleConsent => "ToggleConsent"
    Submit => "Submit"
    Reset => "Reset"
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SetEmail(email) => "set-email:\{email}"
    ToggleConsent => "toggle-consent"
    Submit => "submit"
    Reset => "reset"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  "newsletter:\{phase(model)}:\{model.email}:\{model.consented}:\{model.submitted}"
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  ["src/examples/newsletter/model.mbt", "src/examples/newsletter/view.mbt"]
}
