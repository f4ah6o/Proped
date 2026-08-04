///|
// Adapted from moonbit-community/rabbita examples/websocket at revision
// 67e8169efa1bb2e8bd17018b62b41211cbc4c357.
//
// Changes from upstream:
// - extract the command-client state machine as a reusable native package;
// - represent socket outcomes as typed deterministic messages;
// - preserve the upstream `client_connecting` predicate, which includes the
//   `closing` status and therefore leaves disconnect enabled while closing;
// - bound transcript growth to the upstream limit of 24 entries.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.
pub(all) struct ChatEntry {
  tone : String
  label : String
  body : String
} derive(Debug, Eq)

///|
pub(all) struct Model {
  url_input : String
  draft_input : String
  client_status : String
  client_open_count : Int
  client_close_count : Int
  client_error_count : Int
  client_last_error : String
  transcript : Array[ChatEntry]
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  UrlChanged(String)
  DraftChanged(String)
  ClientConnectRequested
  ClientDisconnectRequested
  ClientOpened
  ClientClosed(String)
  ClientSendRaw
  ClientFailed(String)
  ClearTranscript
} derive(Debug, Eq)

///|
pub fn initial() -> Model {
  {
    url_input: "wss://echo-websocket.fly.dev",
    draft_input: "",
    client_status: "idle",
    client_open_count: 0,
    client_close_count: 0,
    client_error_count: 0,
    client_last_error: "",
    transcript: [],
  }
}

///|
fn normalized_url(url : String) -> String {
  url.trim().to_owned()
}

///|
fn trimmed_draft(draft : String) -> String {
  draft.trim().to_owned()
}

///|
fn capped_append(
  entries : Array[ChatEntry],
  entry : ChatEntry,
) -> Array[ChatEntry] {
  let result = entries.copy()
  result.push(entry)
  if result.length() > 24 {
    ignore(result.remove(0))
  }
  result
}

///|
fn with_transcript(
  model : Model,
  tone : String,
  label : String,
  body : String,
) -> Model {
  {
    ..model,
    transcript: capped_append(model.transcript, { tone, label, body }),
  }
}

///|
pub fn client_connecting(status : String) -> Bool {
  match status {
    "connecting" | "open" | "closing" => true
    _ => false
  }
}

///|
fn command_can_send(model : Model) -> Bool {
  model.client_status == "open" && trimmed_draft(model.draft_input) != ""
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    UrlChanged(url) => { ..model, url_input: url }
    DraftChanged(draft) => { ..model, draft_input: draft }
    ClientConnectRequested => {
      let url = normalized_url(model.url_input)
      if url == "" {
        with_transcript(
          { ..model, client_last_error: "client connect ignored: empty url" },
          "error",
          "client",
          "connect ignored because url is empty",
        )
      } else {
        with_transcript(
          { ..model, client_status: "connecting", client_last_error: "" },
          "system",
          "client",
          "connect -> \{url}",
        )
      }
    }
    ClientDisconnectRequested =>
      with_transcript(
        { ..model, client_status: "closing" },
        "system",
        "client",
        "close requested",
      )
    ClientOpened =>
      with_transcript(
        {
          ..model,
          client_status: "open",
          client_open_count: model.client_open_count + 1,
        },
        "system",
        "client",
        "open",
      )
    ClientClosed(summary) =>
      with_transcript(
        {
          ..model,
          client_status: "closed",
          client_close_count: model.client_close_count + 1,
        },
        "system",
        "close",
        summary,
      )
    ClientSendRaw => {
      let text = trimmed_draft(model.draft_input)
      if !command_can_send(model) {
        with_transcript(
          model, "error", "client", "raw send ignored because the socket is not open or the draft is empty",
        )
      } else {
        with_transcript({ ..model, draft_input: "" }, "self", "raw", text)
      }
    }
    ClientFailed(message) =>
      with_transcript(
        {
          ..model,
          client_status: "error",
          client_error_count: model.client_error_count + 1,
          client_last_error: message,
        },
        "error",
        "client",
        message,
      )
    ClearTranscript => { ..model, transcript: [] }
  }
}

///|
fn push_string_change(
  actions : Array[Msg],
  current : String,
  value : String,
  make : (String) -> Msg,
) -> Unit {
  if current != value {
    actions.push(make(value))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  push_string_change(result, model.url_input, "", value => UrlChanged(value))
  push_string_change(result, model.url_input, "wss://echo-websocket.fly.dev", value => {
    UrlChanged(value)
  })
  push_string_change(result, model.draft_input, "hello", value => {
    DraftChanged(value)
  })
  push_string_change(result, model.draft_input, " ", value => {
    DraftChanged(value)
  })
  push_string_change(result, model.draft_input, "", value => DraftChanged(value))
  if normalized_url(model.url_input) != "" {
    result.push(ClientConnectRequested)
  }
  if client_connecting(model.client_status) {
    result.push(ClientDisconnectRequested)
  }
  if model.client_status == "connecting" {
    result.push(ClientOpened)
    result.push(ClientFailed("connect failed"))
  }
  if model.client_status == "open" {
    result.push(ClientClosed("code=1000 clean=true reason=user disconnect"))
    result.push(ClientFailed("socket failed"))
    if command_can_send(model) {
      result.push(ClientSendRaw)
    }
  }
  if model.client_status == "closing" {
    result.push(ClientClosed("code=1000 clean=true reason=user disconnect"))
    result.push(ClientFailed("close failed"))
  }
  if !model.transcript.is_empty() {
    result.push(ClearTranscript)
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    UrlChanged(value) if value != "" => [UrlChanged("")]
    DraftChanged(value) if value != " " => [DraftChanged(" ")]
    ClientClosed(summary) if summary != "closed" => [ClientClosed("closed")]
    ClientFailed(message) if message != "failed" => [ClientFailed("failed")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    UrlChanged(value) => "url:\{value.length()}:\{value}"
    DraftChanged(value) => "draft:\{value.length()}:\{value}"
    ClientConnectRequested => "client-connect"
    ClientDisconnectRequested => "client-disconnect"
    ClientOpened => "client-opened"
    ClientClosed(summary) => "client-closed:\{summary.length()}:\{summary}"
    ClientSendRaw => "client-send-raw"
    ClientFailed(message) => "client-failed:\{message.length()}:\{message}"
    ClearTranscript => "clear-transcript"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    UrlChanged(value) => "UrlChanged(\{value.escape(quote=true)})"
    DraftChanged(value) => "DraftChanged(\{value.escape(quote=true)})"
    ClientConnectRequested => "ClientConnectRequested"
    ClientDisconnectRequested => "ClientDisconnectRequested"
    ClientOpened => "ClientOpened"
    ClientClosed(summary) => "ClientClosed(\{summary.escape(quote=true)})"
    ClientSendRaw => "ClientSendRaw"
    ClientFailed(message) => "ClientFailed(\{message.escape(quote=true)})"
    ClearTranscript => "ClearTranscript"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("rabbita-websocket|url=")
  output.write_object(model.url_input.length())
  output.write_char(':')
  output.write_string(model.url_input)
  output.write_string("|draft=")
  output.write_object(model.draft_input.length())
  output.write_char(':')
  output.write_string(model.draft_input)
  output.write_string("|status=")
  output.write_string(model.client_status)
  output.write_string("|counts=")
  output.write_object(model.client_open_count)
  output.write_char(':')
  output.write_object(model.client_close_count)
  output.write_char(':')
  output.write_object(model.client_error_count)
  for entry in model.transcript {
    output.write_string("|entry=")
    output.write_object(entry.tone.length())
    output.write_char(':')
    output.write_string(entry.tone)
    output.write_char(':')
    output.write_object(entry.label.length())
    output.write_char(':')
    output.write_string(entry.label)
    output.write_char(':')
    output.write_object(entry.body.length())
    output.write_char(':')
    output.write_string(entry.body)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let entries : Array[@rabbita.Html] = []
  for entry in model.transcript {
    entries.push(
      @html.div(class="chat-entry tone-\{entry.tone}", [
        @html.p(class="chat-author", entry.label),
        @html.p(class="chat-body", entry.body),
      ]),
    )
  }
  let page = @html.div(class="page", [
    @html.h1("websocket chat demo"),
    @html.div(class="status-chip", model.client_status),
    @html.input(value=model.url_input),
    @html.button(
      disabled=normalized_url(model.url_input) == "",
      "connect client",
    ),
    @html.button(
      disabled=!client_connecting(model.client_status),
      "disconnect client",
    ),
    @html.textarea(value=model.draft_input, @html.nothing),
    @html.button(disabled=!command_can_send(model), "send raw text"),
    @html.div(class="transcript-list", entries),
  ])
  @rabbita.Val::constant(page)
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "src/vendor/rabbita_websocket/upstream/client.mbt.txt", "src/vendor/rabbita_websocket/upstream/styles.css",
    "src/vendor/rabbita_websocket/websocket.mbt",
  ]
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property("closing client rejects repeated disconnect", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        ClientDisconnectRequested if before.client_status == "closing" &&
          after.transcript.length() > before.transcript.length() =>
          @proped.Fail(
            "second disconnect request appended another close command",
          )
        _ => @proped.Pass
      }
    }),
    @proped.state_property("transcript remains capped", fn(model, _) {
      if model.transcript.length() <= 24 {
        @proped.Pass
      } else {
        @proped.Fail("transcript exceeded upstream cap")
      }
    }),
    @proped.state_property("rendered status matches model", fn(model, html) {
      if html.contains(model.client_status) {
        @proped.Pass
      } else {
        @proped.Fail("rendered status did not match client status")
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
  { cases: 320, max_depth: 16, max_states: 800, seed: 47, shrink_budget: 8192 }
}
