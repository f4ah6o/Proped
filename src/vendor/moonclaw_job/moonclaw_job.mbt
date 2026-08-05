///|
// Finite adapter for vectie/moonclaw's Rabbita Jobs surface at revision
// 5fdc845f2a926cdd17260fb9720135a2c50eff38.
//
// HTTP requests and stream events are deterministic descriptors. Request IDs
// are harness delivery metadata; the update intentionally accepts snapshots by
// selected run ID only, matching the pinned SnapshotLoaded branch.

pub(all) enum RunStatus {
  Pending
  Running
  Succeeded
  Failed
  Cancelled
} derive(Debug, Eq)

///|
pub fn RunStatus::to_string(self : RunStatus) -> String {
  match self {
    Pending => "Pending"
    Running => "Running"
    Succeeded => "Succeeded"
    Failed => "Failed"
    Cancelled => "Cancelled"
  }
}

///|
fn RunStatus::is_live(self : RunStatus) -> Bool {
  self is Pending || self is Running
}

///|
fn RunStatus::is_terminal(self : RunStatus) -> Bool {
  self is Succeeded || self is Failed || self is Cancelled
}

///|
pub(all) struct Snapshot {
  run_id : String
  job_id : String
  status : RunStatus
  current_step_id : String?
} derive(Debug, Eq)

///|
pub(all) struct TimelineEntry {
  id : String
  run_id : String
  event_type : String
  timestamp : Int
} derive(Debug, Eq)

///|
pub(all) struct PendingRequest {
  effect : @external.EffectDescriptor
  run_id : String
} derive(Debug, Eq)

///|
pub(all) struct Model {
  selected_run_id : String
  snapshot : Snapshot?
  timeline : Array[TimelineEntry]
  detail_loading : Bool
  detail_error : String?
  pending_requests : Array[PendingRequest]
  next_request_id : Int
  last_applied_request_id : Int
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SelectRun(String)
  PollRun
  SnapshotLoaded(Int, String, RunStatus)
  SnapshotFailed(Int, String, String)
  StreamEvent(String, TimelineEntry)
  StreamClosed(String)
} derive(Debug, Eq)

///|
fn record_snapshot_request(model : Model, run_id : String) -> Model {
  let id = model.next_request_id
  let pending = model.pending_requests.copy()
  pending.push({
    effect: {
      id,
      kind: @external.HttpRequest,
      operation: "fetch-job-snapshot",
      payload: "run_id=\{run_id}",
    },
    run_id,
  })
  {
    ..model,
    detail_loading: true,
    detail_error: None,
    pending_requests: pending,
    next_request_id: id + 1,
  }
}

///|
pub fn initial() -> Model {
  {
    selected_run_id: "run-1",
    snapshot: None,
    timeline: [],
    detail_loading: false,
    detail_error: None,
    pending_requests: [],
    next_request_id: 1,
    last_applied_request_id: 0,
  }
}

///|
fn pending_without(model : Model, request_id : Int) -> Array[PendingRequest] {
  model.pending_requests.filter(request => request.effect.id != request_id)
}

///|
fn timeline_contains(entries : Array[TimelineEntry], id : String) -> Bool {
  entries.any(entry => entry.id == id)
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SelectRun(run_id) =>
      record_snapshot_request(
        {
          ..model,
          selected_run_id: run_id,
          snapshot: None,
          timeline: [],
          detail_loading: true,
          detail_error: None,
          last_applied_request_id: 0,
        },
        run_id,
      )
    PollRun => record_snapshot_request(model, model.selected_run_id)
    SnapshotLoaded(request_id, run_id, status) =>
      if model.selected_run_id == run_id {
        {
          ..model,
          snapshot: Some({
            run_id,
            job_id: "job-\{run_id}",
            status,
            current_step_id: if status.is_live() {
              Some("step-1")
            } else {
              None
            },
          }),
          detail_loading: false,
          detail_error: None,
          pending_requests: pending_without(model, request_id),
          last_applied_request_id: request_id,
        }
      } else {
        model
      }
    SnapshotFailed(request_id, run_id, error) =>
      if model.selected_run_id == run_id {
        {
          ..model,
          snapshot: None,
          timeline: [],
          detail_loading: false,
          detail_error: Some(error),
          pending_requests: pending_without(model, request_id),
          last_applied_request_id: request_id,
        }
      } else {
        model
      }
    StreamEvent(run_id, entry) =>
      if model.selected_run_id == run_id &&
        entry.run_id == run_id &&
        !timeline_contains(model.timeline, entry.id) {
        { ..model, timeline: [..model.timeline, entry] }
      } else {
        model
      }
    StreamClosed(run_id) =>
      if model.selected_run_id == run_id {
        record_snapshot_request(model, run_id)
      } else {
        model
      }
  }
}

///|
fn stream_fixture(run_id : String, terminal : Bool) -> TimelineEntry {
  {
    id: if terminal {
      "event-complete"
    } else {
      "event-progress"
    },
    run_id,
    event_type: if terminal {
      "job.completed"
    } else {
      "step.progress"
    },
    timestamp: if terminal {
      20
    } else {
      10
    },
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = []
  if model.selected_run_id != "run-1" {
    actions.push(SelectRun("run-1"))
  }
  if model.selected_run_id != "run-2" {
    actions.push(SelectRun("run-2"))
  }
  if model.pending_requests.length() < 2 {
    actions.push(PollRun)
  }
  for request in model.pending_requests {
    let request_id = request.effect.id
    let run_id = request.run_id
    actions.push(SnapshotLoaded(request_id, run_id, Running))
    actions.push(SnapshotLoaded(request_id, run_id, Succeeded))
    actions.push(SnapshotFailed(request_id, run_id, "snapshot unavailable"))
  }
  actions.push(
    StreamEvent(
      model.selected_run_id,
      stream_fixture(model.selected_run_id, false),
    ),
  )
  actions.push(
    StreamEvent(
      model.selected_run_id,
      stream_fixture(model.selected_run_id, true),
    ),
  )
  actions.push(StreamClosed(model.selected_run_id))
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SelectRun(run_id) if run_id != "run-1" => [SelectRun("run-1")]
    SnapshotLoaded(request_id, run_id, status) if run_id != "run-1" =>
      [SnapshotLoaded(request_id, "run-1", status)]
    SnapshotFailed(request_id, run_id, error) if run_id != "run-1" =>
      [SnapshotFailed(request_id, "run-1", error)]
    StreamEvent(run_id, entry) if run_id != "run-1" =>
      [StreamEvent("run-1", { ..entry, run_id: "run-1" })]
    StreamClosed(run_id) if run_id != "run-1" => [StreamClosed("run-1")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SelectRun(run_id) => "select-run:\{run_id.length()}:\{run_id}"
    PollRun => "poll-run"
    SnapshotLoaded(request_id, run_id, status) =>
      "snapshot-loaded:\{request_id}:\{run_id.length()}:\{run_id}:\{status.to_string()}"
    SnapshotFailed(request_id, run_id, _) =>
      "snapshot-failed:\{request_id}:\{run_id.length()}:\{run_id}"
    StreamEvent(run_id, entry) =>
      "stream-event:\{run_id.length()}:\{run_id}:\{entry.id.length()}:\{entry.id}"
    StreamClosed(run_id) => "stream-closed:\{run_id.length()}:\{run_id}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SelectRun(run_id) => "SelectRun(\{run_id.escape(quote=true)})"
    PollRun => "PollRun"
    SnapshotLoaded(request_id, run_id, status) =>
      "SnapshotLoaded(request=\{request_id}, run=\{run_id.escape(quote=true)}, status=\{status.to_string()})"
    SnapshotFailed(request_id, run_id, _) =>
      "SnapshotFailed(request=\{request_id}, run=\{run_id.escape(quote=true)})"
    StreamEvent(run_id, entry) =>
      "StreamEvent(run=\{run_id.escape(quote=true)}, type=\{entry.event_type.escape(quote=true)})"
    StreamClosed(run_id) => "StreamClosed(\{run_id.escape(quote=true)})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("moonclaw-job|selected=")
  output.write_string(model.selected_run_id)
  output.write_string("|snapshot=")
  match model.snapshot {
    Some(snapshot) => {
      output.write_string(snapshot.run_id)
      output.write_char(':')
      output.write_string(snapshot.status.to_string())
    }
    None => output.write_string("none")
  }
  output.write_string("|loading=")
  output.write_object(model.detail_loading)
  output.write_string("|error=")
  match model.detail_error {
    Some(error) => output.write_string(error)
    None => output.write_string("none")
  }
  output.write_string("|last-applied=")
  output.write_object(model.last_applied_request_id)
  output.write_string("|next-request=")
  output.write_object(model.next_request_id)
  for request in model.pending_requests {
    output.write_string("|request=")
    output.write_object(request.effect.id)
    output.write_char(':')
    output.write_string(request.run_id)
  }
  for entry in model.timeline {
    output.write_string("|event=")
    output.write_string(entry.id)
    output.write_char(':')
    output.write_string(entry.run_id)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let status = match model.snapshot {
    Some(snapshot) => snapshot.status.to_string()
    None => "none"
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Moonclaw job"),
      @html.div(class="selected-run", "run=\{model.selected_run_id}"),
      @html.div(class="run-status", "status=\{status}"),
      @html.div(class="timeline-count", "events=\{model.timeline.length()}"),
      @html.div(class="loading", "loading=\{model.detail_loading}"),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/moonclaw-job.json", "src/vendor/moonclaw_job/upstream/update.mbt.txt",
    "src/vendor/moonclaw_job/upstream/model_types.mbt.txt", "src/vendor/moonclaw_job/moonclaw_job.mbt",
  ]
}

///|
fn pending_effects(model : Model) -> Array[@external.EffectDescriptor] {
  model.pending_requests.map(request => request.effect)
}

///|
fn timeline_ids_unique(model : Model) -> Bool {
  for index in 0..<model.timeline.length() {
    for other in (index + 1)..<model.timeline.length() {
      if model.timeline[index].id == model.timeline[other].id {
        return false
      }
    }
  }
  true
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "older snapshot responses do not revive terminal runs",
      fn(before, msg, after) {
        match (before.snapshot, msg, after.snapshot) {
          (
            Some(previous),
            SnapshotLoaded(request_id, run_id, status),
            Some(current),
          ) if previous.run_id == run_id &&
            previous.status.is_terminal() &&
            status.is_live() &&
            request_id < before.last_applied_request_id &&
            current.status.is_live() =>
            @proped.Fail(
              "older request \{request_id} revived terminal run \{run_id} from \{previous.status.to_string()} to \{current.status.to_string()}",
            )
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("selected snapshot matches selected run", fn(
      model,
      _,
    ) {
      match model.snapshot {
        Some(snapshot) if snapshot.run_id != model.selected_run_id =>
          @proped.Fail("snapshot belongs to a different selected run")
        _ => @proped.Pass
      }
    }),
    @proped.state_property("timeline entries match selected run", fn(model, _) {
      if model.timeline.any(entry => entry.run_id != model.selected_run_id) {
        @proped.Fail("timeline contains an event from a different run")
      } else if !timeline_ids_unique(model) {
        @proped.Fail("timeline contains duplicate event IDs")
      } else {
        @proped.Pass
      }
    }),
    @external.unique_effect_ids_property(
      "pending request IDs remain unique", pending_effects,
    ),
    @proped.state_property("rendered job state matches model", fn(model, html) {
      let status = match model.snapshot {
        Some(snapshot) => snapshot.status.to_string()
        None => "none"
      }
      if !html.contains("run=\{model.selected_run_id}") {
        @proped.Fail("rendered selected run does not match model")
      } else if !html.contains("status=\{status}") {
        @proped.Fail("rendered status does not match model")
      } else if !html.contains("events=\{model.timeline.length()}") {
        @proped.Fail("rendered timeline count does not match model")
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
  { cases: 384, max_depth: 10, max_states: 720, seed: 103, shrink_budget: 4096 }
}
