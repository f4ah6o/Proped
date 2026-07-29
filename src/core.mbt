///|
/// Result returned by a UI property.
pub(all) enum Verdict {
  Pass
  Fail(String)
} derive(Debug, Eq)

///|
/// A property may inspect a rendered state, a transition, or both.
pub(all) struct Property[Model, Msg] {
  name : String
  state : ((Model, String) -> Verdict)?
  transition : ((Model, Msg, Model) -> Verdict)?
}

///|
/// Defines a state property.
pub fn[Model, Msg] state_property(
  name : String,
  check : (Model, String) -> Verdict,
) -> Property[Model, Msg] {
  { name, state: Some(check), transition: None }
}

///|
/// Defines a transition property.
pub fn[Model, Msg] transition_property(
  name : String,
  check : (Model, Msg, Model) -> Verdict,
) -> Property[Model, Msg] {
  { name, state: None, transition: Some(check) }
}

///|
/// The executable model used by the property runner.
///
/// `actions` must return only actions that are valid for the supplied model.
/// This keeps generated traces inside the reachable UI state space.
///
/// `action_id` must return a stable, unique identifier for each distinct
/// message. It is used for replay and graph identity.
///
/// `describe_msg` is a human-facing label and may be shared by multiple
/// messages. It is never used to decide whether an action is available.
///
/// `dependencies` returns stable source, fixture, style, or token identifiers
/// that affect the rendered state. They are used to plan differential builds.
pub(all) struct Machine[Model, Msg] {
  initial : Model
  update : (Model, Msg) -> Model
  actions : (Model) -> Array[Msg]
  shrink : (Msg) -> Array[Msg]
  render : (Model) -> String
  fingerprint : (Model) -> String
  action_id : (Msg) -> String
  describe_msg : (Msg) -> String
  dependencies : (Model) -> Array[String]
}

///|
pub(all) struct RunConfig {
  cases : Int
  max_depth : Int
  max_states : Int
  seed : Int
  shrink_budget : Int
}

///|
pub fn RunConfig::default() -> RunConfig {
  { cases: 100, max_depth: 20, max_states: 500, seed: 1, shrink_budget: 1024 }
}

///|
/// Configuration errors returned by `run_checked`.
pub(all) enum RunConfigError {
  InvalidCases(Int)
  InvalidMaxDepth(Int)
  InvalidMaxStates(Int)
  InvalidShrinkBudget(Int)
} derive(Debug, Eq)

///|
/// Validate the bounds that make an exploration run meaningful and finite.
pub fn RunConfig::validate(self : RunConfig) -> Result[Unit, RunConfigError] {
  if self.cases < 0 {
    Err(InvalidCases(self.cases))
  } else if self.max_depth < 0 {
    Err(InvalidMaxDepth(self.max_depth))
  } else if self.max_states <= 0 {
    Err(InvalidMaxStates(self.max_states))
  } else if self.shrink_budget <= 0 {
    Err(InvalidShrinkBudget(self.shrink_budget))
  } else {
    Ok(())
  }
}

///|
pub(all) enum RunDiagnosticKind {
  InvalidConfig
  StateIdentityCollision
  ActionIdentityCollision
  ShrinkBudgetExceeded
} derive(Debug, Eq)

///|
/// A non-fatal diagnostic collected while producing a run report.
pub(all) struct RunDiagnostic {
  kind : RunDiagnosticKind
  identity : String
  message : String
}

///|
pub(all) struct StateSnapshot {
  id : String
  html : String
  depth : Int
  dependencies : Array[String]
}

///|
pub(all) struct TransitionSnapshot {
  from : String
  action_id : String
  action : String
  to : String
}

///|
pub(all) struct FailureReport {
  property : String
  message : String
  state_id : String
  trace : Array[String]
  structured_trace : Array[TransitionSnapshot]
}

///|
pub(all) struct RunReport {
  schema_version : Int
  seed : Int
  cases : Int
  max_depth : Int
  max_states : Int
  shrink_budget : Int
  strategy : String
  mut steps : Int
  states : Array[StateSnapshot]
  transitions : Array[TransitionSnapshot]
  failures : Array[FailureReport]
  diagnostics : Array[RunDiagnostic]
}

///|
priv struct FailureCandidate[Model] {
  message : String
  state_id : String
  states : Array[ReplayState[Model]]
  structured_trace : Array[TransitionSnapshot]
}

///|
priv struct ReplayState[Model] {
  model : Model
  depth : Int
}

///|
priv struct ObservedAction {
  id : String
  label : String
  from : String
  to : String
}

///|
fn contains_string(values : Array[String], target : String) -> Bool {
  for value in values {
    if value == target {
      return true
    }
  }
  false
}

///|
fn dependencies_intersect(
  dependencies : Array[String],
  changed_inputs : Array[String],
) -> Bool {
  for dependency in dependencies {
    if contains_string(changed_inputs, dependency) {
      return true
    }
  }
  false
}

///|
/// Return the state IDs that must be rebuilt after any of the supplied stable
/// dependency identifiers changed.
pub fn affected_state_ids(
  report : RunReport,
  changed_inputs : Array[String],
) -> Array[String] {
  let affected : Array[String] = []
  for state in report.states {
    if dependencies_intersect(state.dependencies, changed_inputs) {
      affected.push(state.id)
    }
  }
  affected
}

///|
fn[T] without_index(values : Array[T], removed : Int) -> Array[T] {
  let result : Array[T] = []
  for index, value in values {
    if index != removed {
      result.push(value)
    }
  }
  result
}

///|
fn[T] replace_index(
  values : Array[T],
  index : Int,
  replacement : T,
) -> Array[T] {
  let result = values.copy()
  result[index] = replacement
  result
}

///|
fn[Model, Msg] check_state(
  property : Property[Model, Msg],
  model : Model,
  html : String,
) -> Verdict {
  match property.state {
    Some(check) => check(model, html)
    None => Pass
  }
}

///|
fn[Model, Msg] check_transition(
  property : Property[Model, Msg],
  before : Model,
  msg : Msg,
  after : Model,
) -> Verdict {
  match property.transition {
    Some(check) => check(before, msg, after)
    None => Pass
  }
}

///|
fn[Model, Msg] available_action(
  machine : Machine[Model, Msg],
  model : Model,
  msg : Msg,
) -> Msg? {
  let expected = (machine.action_id)(msg)
  for available in (machine.actions)(model) {
    if (machine.action_id)(available) == expected {
      return Some(available)
    }
  }
  None
}

///|
fn dependencies_equal(left : Array[String], right : Array[String]) -> Bool {
  if left.length() != right.length() {
    return false
  }
  for index, value in left {
    if right[index] != value {
      return false
    }
  }
  true
}

///|
fn diagnostic_exists(
  report : RunReport,
  kind : RunDiagnosticKind,
  identity : String,
  message : String,
) -> Bool {
  for diagnostic in report.diagnostics {
    if diagnostic.kind == kind &&
      diagnostic.identity == identity &&
      diagnostic.message == message {
      return true
    }
  }
  false
}

///|
fn add_diagnostic(
  report : RunReport,
  kind : RunDiagnosticKind,
  identity : String,
  message : String,
) -> Unit {
  if !diagnostic_exists(report, kind, identity, message) {
    report.diagnostics.push({ kind, identity, message })
  }
}

///|
fn observe_action(
  report : RunReport,
  observed : Array[ObservedAction],
  action_id : String,
  label : String,
  from : String,
  to : String,
) -> Unit {
  for action in observed {
    if action.id == action_id {
      if action.label != label || (action.from == from && action.to != to) {
        add_diagnostic(
          report,
          ActionIdentityCollision,
          action_id,
          "action ID maps to multiple labels or transitions",
        )
      }
      return
    }
  }
  observed.push({ id: action_id, label, from, to })
}

///|
fn observe_transition_identity(
  report : RunReport,
  transition : TransitionSnapshot,
) -> Unit {
  for existing in report.transitions {
    if existing.from == transition.from &&
      existing.action_id == transition.action_id &&
      existing.to != transition.to {
      add_diagnostic(
        report,
        ActionIdentityCollision,
        transition.action_id,
        "action ID reaches different states from the same source state",
      )
    }
  }
}

///|
fn[Model, Msg] add_model_snapshot(
  report : RunReport,
  machine : Machine[Model, Msg],
  model : Model,
  depth : Int,
) -> Unit {
  let state_id = (machine.fingerprint)(model)
  let html = (machine.render)(model)
  let dependencies = (machine.dependencies)(model)
  for state in report.states {
    if state.id == state_id {
      if state.html != html ||
        !dependencies_equal(state.dependencies, dependencies) {
        add_diagnostic(
          report,
          StateIdentityCollision,
          state_id,
          "state ID maps to different rendered HTML or dependencies",
        )
      }
      return
    }
  }
  report.states.push({ id: state_id, html, depth, dependencies })
}

///|
fn[Model, Msg] replay_failure(
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
) -> FailureCandidate[Model]? {
  let mut model = machine.initial
  let states : Array[ReplayState[Model]] = [{ model, depth: 0 }]
  let structured_trace : Array[TransitionSnapshot] = []
  let initial_html = (machine.render)(model)
  match check_state(property, model, initial_html) {
    Fail(message) =>
      return Some({
        message,
        state_id: (machine.fingerprint)(model),
        states,
        structured_trace,
      })
    Pass => ()
  }
  for depth, msg in trace {
    let available_msg = match available_action(machine, model, msg) {
      Some(available) => available
      None => return None
    }
    let next = (machine.update)(model, available_msg)
    let next_id = (machine.fingerprint)(next)
    structured_trace.push({
      from: (machine.fingerprint)(model),
      action_id: (machine.action_id)(available_msg),
      action: (machine.describe_msg)(available_msg),
      to: next_id,
    })
    states.push({ model: next, depth: depth + 1 })
    match check_transition(property, model, available_msg, next) {
      Fail(message) =>
        return Some({ message, state_id: next_id, states, structured_trace })
      Pass => ()
    }
    model = next
    let html = (machine.render)(model)
    match check_state(property, model, html) {
      Fail(message) =>
        return Some({ message, state_id: next_id, states, structured_trace })
      Pass => ()
    }
  }
  None
}

///|
fn[Model, Msg] trace_key(
  machine : Machine[Model, Msg],
  trace : Array[Msg],
) -> String {
  let output = StringBuilder::new()
  for msg in trace {
    let action_id = (machine.action_id)(msg)
    output.write_object(action_id.length())
    output.write_char(':')
    output.write_string(action_id)
  }
  output.to_string()
}

///|
fn[Model, Msg] shrink_trace(
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
  report : RunReport,
  budget : Int,
) -> Array[Msg] {
  let mut current = trace.copy()
  let visited : Array[String] = [trace_key(machine, current)]
  let mut evaluations = 0
  let mut exhausted = false
  let mut changed = true
  while changed && !exhausted {
    changed = false
    for index = 0; index < current.length() && !exhausted; index = index + 1 {
      let candidate = without_index(current, index)
      let key = trace_key(machine, candidate)
      if !contains_string(visited, key) {
        if evaluations >= budget {
          exhausted = true
        } else {
          evaluations = evaluations + 1
          visited.push(key)
          if replay_failure(machine, property, candidate) is Some(_) {
            current = candidate
            changed = true
            break
          }
        }
      }
    }
  }

  let mut msg_changed = true
  while msg_changed && !exhausted {
    msg_changed = false
    for index = 0; index < current.length() && !exhausted; index = index + 1 {
      let original = current[index]
      let smaller = (machine.shrink)(original)
      for candidate_msg in smaller {
        if (machine.action_id)(candidate_msg) != (machine.action_id)(original) {
          let candidate = replace_index(current, index, candidate_msg)
          let key = trace_key(machine, candidate)
          if !contains_string(visited, key) {
            if evaluations >= budget {
              exhausted = true
              break
            }
            evaluations = evaluations + 1
            visited.push(key)
            if replay_failure(machine, property, candidate) is Some(_) {
              current = candidate
              msg_changed = true
              break
            }
          }
        }
      }
      if msg_changed {
        break
      }
    }
  }
  if exhausted {
    add_diagnostic(
      report,
      ShrinkBudgetExceeded,
      property.name,
      "failure shrinking stopped after \{evaluations} candidate evaluations",
    )
  }
  current
}

///|
fn[Model, Msg] append_failure(
  report : RunReport,
  observed : Array[ObservedAction],
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
  shrink_budget : Int,
) -> Unit {
  let minimal = shrink_trace(machine, property, trace, report, shrink_budget)
  match replay_failure(machine, property, minimal) {
    Some(failure) => {
      for replay_state in failure.states {
        add_model_snapshot(
          report,
          machine,
          replay_state.model,
          replay_state.depth,
        )
      }
      for transition in failure.structured_trace {
        // Failure provenance is exported separately from raw exploration
        // transitions. It must not alter `steps` or raw sample counts.
        observe_action(
          report,
          observed,
          transition.action_id,
          transition.action,
          transition.from,
          transition.to,
        )
      }
      let rendered_trace : Array[String] = []
      for transition in failure.structured_trace {
        rendered_trace.push(transition.action)
      }
      report.failures.push({
        property: property.name,
        message: failure.message,
        state_id: failure.state_id,
        trace: rendered_trace,
        structured_trace: failure.structured_trace,
      })
    }
    None => ()
  }
}

///|
priv struct DeterministicPrng {
  mut state : UInt64
}

///|
fn deterministic_prng(seed : Int) -> DeterministicPrng {
  let state = seed.reinterpret_as_uint().to_uint64()
  if state == 0UL {
    { state: 0x9e3779b97f4a7c15UL }
  } else {
    { state, }
  }
}

///|
fn DeterministicPrng::next_index(self : DeterministicPrng, bound : Int) -> Int {
  let mut state = self.state
  state = state ^ (state >> 12)
  state = state ^ (state << 25)
  state = state ^ (state >> 27)
  self.state = state
  (state % bound.to_uint64()).to_int()
}

///|
fn config_error_message(error : RunConfigError) -> String {
  match error {
    InvalidCases(value) => "cases must be non-negative, got \{value}"
    InvalidMaxDepth(value) => "max_depth must be non-negative, got \{value}"
    InvalidMaxStates(value) => "max_states must be positive, got \{value}"
    InvalidShrinkBudget(value) => "shrink_budget must be positive, got \{value}"
  }
}

///|
fn invalid_run_report(config : RunConfig, error : RunConfigError) -> RunReport {
  {
    schema_version: 2,
    seed: config.seed,
    cases: config.cases,
    max_depth: config.max_depth,
    max_states: config.max_states,
    shrink_budget: config.shrink_budget,
    strategy: "xorshift64",
    steps: 0,
    states: [],
    transitions: [],
    failures: [],
    diagnostics: [
      {
        kind: InvalidConfig,
        identity: "run-config",
        message: config_error_message(error),
      },
    ],
  }
}

///|
fn[Model, Msg] run_validated(
  machine : Machine[Model, Msg],
  properties : Array[Property[Model, Msg]],
  config : RunConfig,
) -> RunReport {
  let report : RunReport = {
    schema_version: 2,
    seed: config.seed,
    cases: config.cases,
    max_depth: config.max_depth,
    max_states: config.max_states,
    shrink_budget: config.shrink_budget,
    strategy: "xorshift64",
    steps: 0,
    states: [],
    transitions: [],
    failures: [],
    diagnostics: [],
  }
  let observed_actions : Array[ObservedAction] = []
  let prng = deterministic_prng(config.seed)

  for case_index = 0; case_index < config.cases; case_index = case_index + 1 {
    let mut model = machine.initial
    let trace : Array[Msg] = []
    let mut stopped = false

    for depth = 0
        depth <= config.max_depth &&
       !stopped &&
       report.states.length() < config.max_states
        depth = depth + 1 {
      let state_id = (machine.fingerprint)(model)
      let html = (machine.render)(model)
      add_model_snapshot(report, machine, model, depth)

      for property in properties {
        match check_state(property, model, html) {
          Fail(_) => {
            append_failure(
              report,
              observed_actions,
              machine,
              property,
              trace,
              config.shrink_budget,
            )
            stopped = true
            break
          }
          Pass => ()
        }
      }
      if stopped ||
        depth == config.max_depth ||
        report.states.length() >= config.max_states {
        continue
      }

      let actions = (machine.actions)(model)
      if actions.is_empty() {
        stopped = true
        continue
      }
      for available in actions {
        let available_next = (machine.update)(model, available)
        observe_action(
          report,
          observed_actions,
          (machine.action_id)(available),
          (machine.describe_msg)(available),
          state_id,
          (machine.fingerprint)(available_next),
        )
      }

      let msg = actions[prng.next_index(actions.length())]
      let next = (machine.update)(model, msg)
      let next_id = (machine.fingerprint)(next)
      let transition = {
        from: state_id,
        action_id: (machine.action_id)(msg),
        action: (machine.describe_msg)(msg),
        to: next_id,
      }
      trace.push(msg)
      report.steps = report.steps + 1
      observe_transition_identity(report, transition)
      report.transitions.push(transition)

      for property in properties {
        match check_transition(property, model, msg, next) {
          Fail(_) => {
            append_failure(
              report,
              observed_actions,
              machine,
              property,
              trace,
              config.shrink_budget,
            )
            stopped = true
            break
          }
          Pass => ()
        }
      }
      model = next
    }
  }
  report
}

///|
/// Run an exploration and return configuration errors explicitly.
pub fn[Model, Msg] run_checked(
  machine : Machine[Model, Msg],
  properties : Array[Property[Model, Msg]],
  config : RunConfig,
) -> Result[RunReport, RunConfigError] {
  match config.validate() {
    Ok(_) => Ok(run_validated(machine, properties, config))
    Err(error) => Err(error)
  }
}

///|
/// Generate reachable action traces, evaluate properties and collect a static
/// state graph. The runner is deterministic for a given configuration.
///
/// Invalid configurations are returned as a report with an `InvalidConfig`
/// diagnostic. Use `run_checked` when the caller needs a typed error result.
pub fn[Model, Msg] run(
  machine : Machine[Model, Msg],
  properties : Array[Property[Model, Msg]],
  config : RunConfig,
) -> RunReport {
  match run_checked(machine, properties, config) {
    Ok(report) => report
    Err(error) => invalid_run_report(config, error)
  }
}
