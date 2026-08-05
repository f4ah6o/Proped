///|
using @html {button, div, h2, input, nothing, p}

///|
fn local_warning(title : String) -> String? {
  let request = @shared.SubmitTitleRequest::{ title, }
  try {
    @shared.validate_request(request)
    None
  } catch {
    err => Some(@shared.warning_text(err))
  }
}

///|
struct Model {
  title : String
  warning : String?
  server_message : String?
}

///|
enum Msg {
  Edit(String)
  Submit
  ServerReplied(Result[String, String])
}

///|
/// start frontend-main
fn main {
  let app = @rabbita.cell(
    model={ title: "", warning: None, server_message: None },
    update=(dispatch, msg, model) => {
      match msg {
        Edit(title) => {
          let warning = local_warning(title)
          (@rabbita.none, { title, warning, server_message: None })
        }
        Submit =>
          match model.warning {
            Some(message) =>
              (
                @rabbita.none,
                { ..model, server_message: Some("not sent: \{message}") },
              )
            None => {
              let request = @shared.SubmitTitleRequest::{ title: model.title }
              let request_json = request.to_json().stringify()
              let expect : @rhttp.Expecting[@rabbita.Cmd, Unit] = @rhttp.Expecting::Text(result => {
                  dispatch(ServerReplied(result))
                },
              )
              let cmd = @rhttp.post(
                "http://127.0.0.1:8080/submit",
                @rhttp.Body::Text(request_json),
                expect~,
              )
              (
                cmd,
                { ..model, server_message: Some("sending json request...") },
              )
            }
          }
        ServerReplied(result) => {
          let server_message = match result {
            Ok(raw_json) =>
              try {
                let response : @shared.SubmitTitleResponse = @json.from_json(
                  @json.parse(raw_json),
                )
                Some("\{response}")
              } catch {
                _ => Some("invalid backend response json")
              }
            Err(err) => Some("request failed: \{err}")
          }
          (@rabbita.none, { ..model, server_message, })
        }
      }
    },
    view=(dispatch, model) => {
      let warning_line = match model.warning {
        Some(message) => p("warning: \{message}")
        None => p("local validation passed")
      }
      let server_line = match model.server_message {
        Some(response) => p("backend response: \{response}")
        None => p("backend response: (none yet)")
      }
      let value = model.title
      div([
        h2("Shared Validation Demo"),
        input(
          input_type=Text,
          value~,
          on_input=text => dispatch(Edit(text)),
          nothing,
        ),
        button(on_click=dispatch(Submit), "Submit as JSON"),
        warning_line,
        server_line,
      ])
    },
  )
  @rabbita.new(app).mount("app")
}
/// end frontend-main
