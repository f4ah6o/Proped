// Finite clean-room adapter for OpenSeek desktop self-update, terminal, and
// file-editor asynchronous boundaries. See UPSTREAM.md for source provenance.

///|
pub(all) enum UpdateChannel {
  Production
  Staging
} derive(Debug, Eq)

///|
pub fn UpdateChannel::to_string(self : UpdateChannel) -> String {
  match self {
    Production => "production"
    Staging => "staging"
  }
}

///|
pub(all) enum UpdateResultFixture {
  UpToDate
  Found
  Unreachable
} derive(Debug, Eq)

///|
pub fn UpdateResultFixture::to_string(self : UpdateResultFixture) -> String {
  match self {
    UpToDate => "up-to-date"
    Found => "found"
    Unreachable => "unreachable"
  }
}

///|
pub(all) enum UpdateUx {
  UpdateUnknown
  CheckingForUpdate
  UpToDateState
  UpdateAvailable(version~ : String, channel~ : UpdateChannel)
  DownloadingUpdate(version~ : String)
  RestartingForUpdate(version~ : String)
  UpdateCheckFailed
} derive(Debug, Eq)

///|
pub fn UpdateUx::to_string(self : UpdateUx) -> String {
  match self {
    UpdateUnknown => "unknown"
    CheckingForUpdate => "checking"
    UpToDateState => "up-to-date"
    UpdateAvailable(version~, channel~) =>
      "available:\{version}:\{channel.to_string()}"
    DownloadingUpdate(version~) => "downloading:\{version}"
    RestartingForUpdate(version~) => "restarting:\{version}"
    UpdateCheckFailed => "failed"
  }
}

///|
pub(all) struct PendingUpdateCheck {
  effect : @external.EffectDescriptor
  channel : UpdateChannel
  explicit : Bool
} derive(Debug, Eq)

///|
pub(all) enum TerminalStatus {
  TerminalOpening
  TerminalRunning
  TerminalFailed
} derive(Debug, Eq)

///|
pub(all) struct TerminalTab {
  key : Int
  id : Int?
  status : TerminalStatus
} derive(Debug, Eq)

///|
pub(all) struct PendingTerminalOpen {
  effect : @external.EffectDescriptor
  key : Int
  cols : Int
  rows : Int
} derive(Debug, Eq)

///|
pub(all) enum FileFixture {
  Older
  Newer
} derive(Debug, Eq)

///|
pub fn FileFixture::to_string(self : FileFixture) -> String {
  match self {
    Older => "older"
    Newer => "newer"
  }
}

///|
pub(all) enum FileTabState {
  FileLoading
  FileLoaded(content~ : String)
} derive(Debug, Eq)

///|
pub(all) struct FileTab {
  path : String
  state : FileTabState
} derive(Debug, Eq)

///|
pub(all) struct PendingFileRead {
  effect : @external.EffectDescriptor
  owner : String
  path : String
} derive(Debug, Eq)

///|
pub(all) struct Model {
  provider : UpdateChannel
  update_ux : UpdateUx
  pending_update_checks : Array[PendingUpdateCheck]
  terminal_open : Bool
  terminal_tabs : Array[TerminalTab]
  pending_terminal_opens : Array[PendingTerminalOpen]
  next_terminal_key : Int
  file_owner : String
  file_tabs : Array[FileTab]
  active_file : String?
  pending_file_reads : Array[PendingFileRead]
  last_file_response_id : Int
  next_effect_id : Int
  status : String
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  ProviderChanged(UpdateChannel)
  CheckForUpdates
  UpdateCheckFinished(Int, UpdateChannel, UpdateResultFixture, Bool)
  UpdateClicked
  UpdateDownloaded
  ToggleTerminal
  EmulatorReady(Int, Int, Int)
  TerminalOpened(Int, Int, Int)
  TerminalClosed(Int)
  TerminalOutput(Int, Int)
  SwitchFileOwner(String)
  FileSelected(String)
  FileLoaded(Int, FileFixture)
  FileClosed(String)
} derive(Debug, Eq)

///|
fn pending_update_without(
  model : Model,
  request_id : Int,
) -> Array[PendingUpdateCheck] {
  model.pending_update_checks.filter(check => check.effect.id != request_id)
}

///|
fn pending_terminal_without(
  model : Model,
  request_id : Int,
) -> Array[PendingTerminalOpen] {
  model.pending_terminal_opens.filter(open => open.effect.id != request_id)
}

///|
fn pending_file_without(
  model : Model,
  request_id : Int,
) -> Array[PendingFileRead] {
  model.pending_file_reads.filter(read => read.effect.id != request_id)
}

///|
fn update_check_by_id(model : Model, request_id : Int) -> PendingUpdateCheck? {
  for check in model.pending_update_checks {
    if check.effect.id == request_id {
      return Some(check)
    }
  }
  None
}

///|
fn terminal_open_by_id(model : Model, request_id : Int) -> PendingTerminalOpen? {
  for open in model.pending_terminal_opens {
    if open.effect.id == request_id {
      return Some(open)
    }
  }
  None
}

///|
fn file_read_by_id(model : Model, request_id : Int) -> PendingFileRead? {
  for read in model.pending_file_reads {
    if read.effect.id == request_id {
      return Some(read)
    }
  }
  None
}

///|
fn terminal_tab_index(model : Model, key : Int) -> Int? {
  model.terminal_tabs.search_by(tab => tab.key == key)
}

///|
fn file_tab_index(model : Model, path : String) -> Int? {
  model.file_tabs.search_by(tab => tab.path == path)
}

///|
fn record_update_check(
  model : Model,
  channel : UpdateChannel,
  explicit : Bool,
) -> Model {
  let id = model.next_effect_id
  let checks = model.pending_update_checks.copy()
  checks.push({
    effect: {
      id,
      kind: @external.NativeInvoke,
      operation: "update.check",
      payload: "channel=\{channel.to_string()},explicit=\{explicit}",
    },
    channel,
    explicit,
  })
  {
    ..model,
    pending_update_checks: checks,
    next_effect_id: id + 1,
    update_ux: CheckingForUpdate,
    status: "Checking \{channel.to_string()} updates",
  }
}

///|
fn record_terminal_open(
  model : Model,
  key : Int,
  cols : Int,
  rows : Int,
) -> Model {
  let id = model.next_effect_id
  let opens = model.pending_terminal_opens.copy()
  opens.push({
    effect: {
      id,
      kind: @external.NativeInvoke,
      operation: "terminal.open",
      payload: "key=\{key},cols=\{cols},rows=\{rows}",
    },
    key,
    cols,
    rows,
  })
  {
    ..model,
    pending_terminal_opens: opens,
    next_effect_id: id + 1,
    status: "Terminal open requested",
  }
}

///|
fn record_file_read(model : Model, owner : String, path : String) -> Model {
  let id = model.next_effect_id
  let reads = model.pending_file_reads.copy()
  reads.push({
    effect: {
      id,
      kind: @external.NativeInvoke,
      operation: "file.read",
      payload: "owner=\{owner},path=\{path}",
    },
    owner,
    path,
  })
  {
    ..model,
    pending_file_reads: reads,
    next_effect_id: id + 1,
    status: "File read requested",
  }
}

///|
pub fn initial() -> Model {
  record_update_check(
    {
      provider: Production,
      update_ux: UpdateUnknown,
      pending_update_checks: [],
      terminal_open: false,
      terminal_tabs: [],
      pending_terminal_opens: [],
      next_terminal_key: 1,
      file_owner: "session-a",
      file_tabs: [],
      active_file: None,
      pending_file_reads: [],
      last_file_response_id: 0,
      next_effect_id: 1,
      status: "Booting",
    },
    Production,
    false,
  )
}

///|
fn waiting_for_update_result(ux : UpdateUx) -> Bool {
  ux is (UpdateUnknown | CheckingForUpdate | UpToDateState | UpdateCheckFailed)
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    ProviderChanged(channel) => {
      let update_ux = if channel == model.provider {
        model.update_ux
      } else {
        UpdateUnknown
      }
      {
        ..model,
        provider: channel,
        update_ux,
        status: "Provider changed to \{channel.to_string()}",
      }
    }
    CheckForUpdates =>
      if model.update_ux
        is (CheckingForUpdate | DownloadingUpdate(..) | RestartingForUpdate(..)) {
        model
      } else {
        record_update_check(model, model.provider, true)
      }
    UpdateCheckFinished(request_id, response_channel, fixture, explicit) => {
      guard update_check_by_id(model, request_id) is Some(_) else {
        return model
      }
      let pending_update_checks = pending_update_without(model, request_id)
      guard waiting_for_update_result(model.update_ux) else {
        return { ..model, pending_update_checks, }
      }
      let update_ux = match fixture {
        Found =>
          UpdateAvailable(
            version="0.3.0-\{response_channel.to_string()}",
            channel=response_channel,
          )
        UpToDate => if explicit { UpToDateState } else { UpdateUnknown }
        Unreachable => if explicit { UpdateCheckFailed } else { UpdateUnknown }
      }
      {
        ..model,
        update_ux,
        pending_update_checks,
        status: "Update result \{fixture.to_string()} from \{response_channel.to_string()}",
      }
    }
    UpdateClicked =>
      match model.update_ux {
        UpdateAvailable(version~, ..) =>
          {
            ..model,
            update_ux: DownloadingUpdate(version~),
            status: "Downloading update",
          }
        _ => model
      }
    UpdateDownloaded =>
      match model.update_ux {
        DownloadingUpdate(version~) =>
          {
            ..model,
            update_ux: RestartingForUpdate(version~),
            status: "Restarting for update",
          }
        _ => model
      }
    ToggleTerminal =>
      if model.terminal_open {
        { ..model, terminal_open: false, status: "Terminal hidden" }
      } else if model.terminal_tabs.is_empty() {
        let key = model.next_terminal_key
        {
          ..model,
          terminal_open: true,
          terminal_tabs: [{ key, id: None, status: TerminalOpening }],
          next_terminal_key: key + 1,
          status: "Terminal mounted",
        }
      } else {
        { ..model, terminal_open: true, status: "Terminal shown" }
      }
    EmulatorReady(key, cols, rows) =>
      match terminal_tab_index(model, key) {
        Some(index) if model.terminal_tabs[index].status is TerminalOpening &&
          model.terminal_tabs[index].id is None =>
          record_terminal_open(model, key, cols, rows)
        _ => model
      }
    TerminalOpened(request_id, key, session_id) => {
      guard terminal_open_by_id(model, request_id) is Some(open) else {
        return model
      }
      let pending_terminal_opens = pending_terminal_without(model, request_id)
      match terminal_tab_index(model, key) {
        Some(index) if open.key == key &&
          model.terminal_tabs[index].status is TerminalOpening => {
          let tabs = model.terminal_tabs.copy()
          tabs[index] = {
            ..tabs[index],
            id: Some(session_id),
            status: TerminalRunning,
          }
          {
            ..model,
            terminal_tabs: tabs,
            pending_terminal_opens,
            status: "Terminal opened",
          }
        }
        _ =>
          { ..model, pending_terminal_opens, status: "Orphan terminal closed" }
      }
    }
    TerminalClosed(key) => {
      let tabs = model.terminal_tabs.filter(tab => tab.key != key)
      {
        ..model,
        terminal_tabs: tabs,
        terminal_open: model.terminal_open && !tabs.is_empty(),
        status: "Terminal closed",
      }
    }
    TerminalOutput(session_id, sequence) => {
      let claimed = model.terminal_tabs.any(tab => tab.id == Some(session_id))
      {
        ..model,
        status: if claimed {
          "Terminal output rendered \{sequence}"
        } else {
          "Unknown terminal output acknowledged \{sequence}"
        },
      }
    }
    SwitchFileOwner(owner) =>
      if owner == model.file_owner {
        model
      } else {
        {
          ..model,
          file_owner: owner,
          file_tabs: [],
          active_file: None,
          status: "File owner switched",
        }
      }
    FileSelected(path) => {
      let tabs = model.file_tabs.copy()
      if file_tab_index(model, path) is None {
        tabs.push({ path, state: FileLoading })
      }
      record_file_read(
        { ..model, file_tabs: tabs, active_file: Some(path) },
        model.file_owner,
        path,
      )
    }
    FileLoaded(request_id, fixture) => {
      guard file_read_by_id(model, request_id) is Some(read) else {
        return model
      }
      let pending_file_reads = pending_file_without(model, request_id)
      if read.owner != model.file_owner ||
        file_tab_index(model, read.path) is None {
        return {
          ..model,
          pending_file_reads,
          status: "Stale file owner reply ignored",
        }
      }
      let index = file_tab_index(model, read.path).unwrap()
      let tabs = model.file_tabs.copy()
      tabs[index] = {
        ..tabs[index],
        state: FileLoaded(content="\{fixture.to_string()} content"),
      }
      {
        ..model,
        file_tabs: tabs,
        pending_file_reads,
        last_file_response_id: request_id,
        status: "File loaded \{fixture.to_string()}",
      }
    }
    FileClosed(path) => {
      let tabs = model.file_tabs.filter(tab => tab.path != path)
      {
        ..model,
        file_tabs: tabs,
        active_file: if model.active_file == Some(path) {
          None
        } else {
          model.active_file
        },
        status: "File closed",
      }
    }
  }
}

///|
fn opening_terminal_request_count(model : Model, key : Int) -> Int {
  model.pending_terminal_opens.filter(open => open.key == key).length()
}

///|
fn has_file_request(model : Model, id : Int) -> Bool {
  model.pending_file_reads.any(read => read.effect.id == id)
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = []
  if model.provider is Production {
    actions.push(ProviderChanged(Staging))
  } else {
    actions.push(ProviderChanged(Production))
  }
  if !(model.update_ux
    is (CheckingForUpdate | DownloadingUpdate(..) | RestartingForUpdate(..))) &&
    model.pending_update_checks.length() < 2 {
    actions.push(CheckForUpdates)
  }
  for check in model.pending_update_checks {
    actions.push(
      UpdateCheckFinished(check.effect.id, check.channel, Found, check.explicit),
    )
    actions.push(
      UpdateCheckFinished(
        check.effect.id,
        check.channel,
        UpToDate,
        check.explicit,
      ),
    )
  }
  if model.update_ux is UpdateAvailable(..) {
    actions.push(UpdateClicked)
  }
  if model.update_ux is DownloadingUpdate(..) {
    actions.push(UpdateDownloaded)
  }
  if model.terminal_tabs.is_empty() {
    actions.push(ToggleTerminal)
  } else {
    let tab = model.terminal_tabs[0]
    if tab.status is TerminalOpening &&
      opening_terminal_request_count(model, tab.key) < 2 {
      actions.push(EmulatorReady(tab.key, 80, 24))
    }
    for open in model.pending_terminal_opens {
      actions.push(
        TerminalOpened(open.effect.id, open.key, 41 + open.effect.id),
      )
    }
    if tab.id is Some(id) {
      actions.push(TerminalOutput(id, 1))
    }
    actions.push(TerminalClosed(tab.key))
  }
  if model.file_owner == "session-a" {
    actions.push(SwitchFileOwner("session-b"))
  } else {
    actions.push(SwitchFileOwner("session-a"))
  }
  if model.pending_file_reads.length() < 2 {
    actions.push(FileSelected("src/main.mbt"))
  }
  for read in model.pending_file_reads {
    actions.push(FileLoaded(read.effect.id, Older))
    actions.push(FileLoaded(read.effect.id, Newer))
  }
  if model.active_file is Some(path) {
    actions.push(FileClosed(path))
  }
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    ProviderChanged(Staging) => []
    ProviderChanged(Production) => [ProviderChanged(Staging)]
    UpdateCheckFinished(id, channel, fixture, explicit) if fixture != Found =>
      [UpdateCheckFinished(id, channel, Found, explicit)]
    EmulatorReady(key, cols, rows) if cols != 80 || rows != 24 =>
      [EmulatorReady(key, 80, 24)]
    FileLoaded(id, Newer) => [FileLoaded(id, Older)]
    SwitchFileOwner("session-b") => []
    SwitchFileOwner(_) => [SwitchFileOwner("session-b")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    ProviderChanged(channel) => "provider:\{channel.to_string()}"
    CheckForUpdates => "check-for-updates"
    UpdateCheckFinished(id, channel, fixture, explicit) =>
      "update-check-finished:\{id}:\{channel.to_string()}:\{fixture.to_string()}:\{explicit}"
    UpdateClicked => "update-clicked"
    UpdateDownloaded => "update-downloaded"
    ToggleTerminal => "toggle-terminal"
    EmulatorReady(key, cols, rows) => "emulator-ready:\{key}:\{cols}:\{rows}"
    TerminalOpened(request, key, id) =>
      "terminal-opened:\{request}:\{key}:\{id}"
    TerminalClosed(key) => "terminal-closed:\{key}"
    TerminalOutput(id, sequence) => "terminal-output:\{id}:\{sequence}"
    SwitchFileOwner(owner) => "switch-file-owner:\{owner}"
    FileSelected(path) => "file-selected:\{path}"
    FileLoaded(request, fixture) =>
      "file-loaded:\{request}:\{fixture.to_string()}"
    FileClosed(path) => "file-closed:\{path}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    ProviderChanged(channel) => "ProviderChanged(\{channel.to_string()})"
    CheckForUpdates => "CheckForUpdates"
    UpdateCheckFinished(id, channel, fixture, explicit) =>
      "UpdateCheckFinished(request=\{id}, channel=\{channel.to_string()}, result=\{fixture.to_string()}, explicit=\{explicit})"
    UpdateClicked => "UpdateClicked"
    UpdateDownloaded => "UpdateDownloaded"
    ToggleTerminal => "ToggleTerminal"
    EmulatorReady(key, cols, rows) =>
      "EmulatorReady(key=\{key}, cols=\{cols}, rows=\{rows})"
    TerminalOpened(request, key, id) =>
      "TerminalOpened(request=\{request}, key=\{key}, id=\{id})"
    TerminalClosed(key) => "TerminalClosed(key=\{key})"
    TerminalOutput(id, sequence) =>
      "TerminalOutput(id=\{id}, sequence=\{sequence})"
    SwitchFileOwner(owner) => "SwitchFileOwner(\{owner.escape(quote=true)})"
    FileSelected(path) => "FileSelected(\{path.escape(quote=true)})"
    FileLoaded(request, fixture) =>
      "FileLoaded(request=\{request}, fixture=\{fixture.to_string()})"
    FileClosed(path) => "FileClosed(\{path.escape(quote=true)})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let out = StringBuilder::new()
  out.write_string("openseek|provider=")
  out.write_string(model.provider.to_string())
  out.write_string("|update=")
  out.write_string(model.update_ux.to_string())
  out.write_string("|terminal-open=")
  out.write_object(model.terminal_open)
  out.write_string("|owner=")
  out.write_string(model.file_owner)
  out.write_string("|active-file=")
  out.write_string(model.active_file.unwrap_or("none"))
  out.write_string("|last-file=")
  out.write_object(model.last_file_response_id)
  out.write_string("|next-terminal-key=")
  out.write_object(model.next_terminal_key)
  out.write_string("|next=")
  out.write_object(model.next_effect_id)
  out.write_string("|status=")
  out.write_string(model.status)
  for check in model.pending_update_checks {
    out.write_string("|check=")
    out.write_object(check.effect.id)
    out.write_char(':')
    out.write_string(check.channel.to_string())
  }
  for tab in model.terminal_tabs {
    out.write_string("|terminal=")
    out.write_object(tab.key)
    out.write_char(':')
    out.write_string(
      match tab.status {
        TerminalOpening => "opening"
        TerminalRunning => "running"
        TerminalFailed => "failed"
      },
    )
    out.write_char(':')
    out.write_string(tab.id.map(id => id.to_string()).unwrap_or("none"))
  }
  for open in model.pending_terminal_opens {
    out.write_string("|terminal-open-request=")
    out.write_object(open.effect.id)
    out.write_char(':')
    out.write_object(open.key)
  }
  for tab in model.file_tabs {
    out.write_string("|file=")
    out.write_string(tab.path)
    out.write_char(':')
    out.write_string(
      match tab.state {
        FileLoading => "loading"
        FileLoaded(content~) => content
      },
    )
  }
  for read in model.pending_file_reads {
    out.write_string("|file-read=")
    out.write_object(read.effect.id)
    out.write_char(':')
    out.write_string(read.owner)
    out.write_char(':')
    out.write_string(read.path)
  }
  out.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("OpenSeek desktop lifecycle"),
      @html.div(class="provider", "provider=\{model.provider.to_string()}"),
      @html.div(class="update", "update=\{model.update_ux.to_string()}"),
      @html.div(
        class="terminal",
        "terminal-tabs=\{model.terminal_tabs.length()}",
      ),
      @html.div(class="file-owner", "owner=\{model.file_owner}"),
      @html.div(
        class="file",
        "active-file=\{model.active_file.unwrap_or("none")}",
      ),
      @html.div(class="status", "status=\{model.status}"),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/openseek-desktop-lifecycle.json", "src/vendor/openseek_desktop_lifecycle/upstream/model.mbt.txt",
    "src/vendor/openseek_desktop_lifecycle/upstream/update.mbt.txt", "src/vendor/openseek_desktop_lifecycle/upstream/self_update.mbt.txt",
    "src/vendor/openseek_desktop_lifecycle/upstream/terminal_state.mbt.txt", "src/vendor/openseek_desktop_lifecycle/upstream/terminal_update.mbt.txt",
    "src/vendor/openseek_desktop_lifecycle/upstream/fileeditor_state.mbt.txt", "src/vendor/openseek_desktop_lifecycle/upstream/fileeditor_update.mbt.txt",
    "src/vendor/openseek_desktop_lifecycle/openseek_desktop_lifecycle.mbt",
  ]
}

///|
fn all_effects(model : Model) -> Array[@external.EffectDescriptor] {
  let effects : Array[@external.EffectDescriptor] = []
  for check in model.pending_update_checks {
    effects.push(check.effect)
  }
  for open in model.pending_terminal_opens {
    effects.push(open.effect)
  }
  for read in model.pending_file_reads {
    effects.push(read.effect)
  }
  effects
}

///|
fn terminal_open_requests_unique(model : Model) -> Bool {
  for tab in model.terminal_tabs {
    if opening_terminal_request_count(model, tab.key) > 1 {
      return false
    }
  }
  true
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.state_property(
      "update check replies match the active provider channel",
      fn(model, _) {
        match model.update_ux {
          UpdateAvailable(channel~, ..) if channel != model.provider =>
            @proped.Fail(
              "an update result from the old provider channel was accepted",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property(
      "one opening terminal tab issues one terminal open request",
      fn(model, _) {
        if terminal_open_requests_unique(model) {
          @proped.Pass
        } else {
          @proped.Fail(
            "duplicate EmulatorReady messages issued duplicate terminal.open requests",
          )
        }
      },
    ),
    @proped.transition_property(
      "older file replies do not replace newer file content",
      fn(before, msg, after) {
        match msg {
          FileLoaded(request_id, Older) if request_id <
            before.last_file_response_id &&
            after.last_file_response_id == request_id &&
            before.file_tabs.any(tab => {
              tab.state is FileLoaded(content="newer content")
            }) &&
            after.file_tabs.any(tab => {
              tab.state is FileLoaded(content="older content")
            }) =>
            @proped.Fail("an older file.read reply replaced newer tab content")
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property(
      "file replies from another conversation owner are ignored",
      fn(before, msg, after) {
        match msg {
          FileLoaded(request_id, _) if has_file_request(before, request_id) &&
            file_read_by_id(before, request_id) is Some(read) &&
            read.owner != before.file_owner &&
            after.file_tabs != before.file_tabs =>
            @proped.Fail("a file reply from another owner changed current tabs")
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property("closed terminals are not revived by output", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        TerminalOutput(_, _) if before.terminal_tabs.is_empty() &&
          !after.terminal_tabs.is_empty() =>
          @proped.Fail("terminal output revived a closed tab")
        _ => @proped.Pass
      }
    }),
    @external.unique_effect_ids_property(
      "pending effect IDs remain unique", all_effects,
    ),
    @proped.state_property("rendered desktop state matches the model", fn(
      model,
      html,
    ) {
      if !html.contains("provider=\{model.provider.to_string()}") {
        @proped.Fail("rendered provider does not match model")
      } else if !html.contains("update=\{model.update_ux.to_string()}") {
        @proped.Fail("rendered update state does not match model")
      } else if !html.contains("owner=\{model.file_owner}") {
        @proped.Fail("rendered file owner does not match model")
      } else {
        @proped.Pass
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
  {
    cases: 1024,
    max_depth: 9,
    max_states: 2600,
    seed: 137,
    shrink_budget: 4096,
  }
}
