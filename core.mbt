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
/// `describe_msg` must return a stable, unique description for each distinct
/// message. The runner uses it both for reports and replay availability checks.
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
  describe_msg : (Msg) -> String
  dependencies : (Model) -> Array[String]
}

///|
pub(all) struct RunConfig {
  cases : Int
  max_depth : Int
  max_states : Int
  seed : Int
}

///|
pub fn RunConfig::default() -> RunConfig {
  { cases: 100, max_depth: 20, max_states: 500, seed: 1 }
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
  action : String
  to : String
}

///|
pub(all) struct FailureReport {
  property : String
  message : String
  state_id : String
  trace : Array[String]
}

///|
pub(all) struct RunReport {
  seed : Int
  cases : Int
  mut steps : Int
  states : Array[StateSnapshot]
  transitions : Array[TransitionSnapshot]
  failures : Array[FailureReport]
}

///|
priv struct FailureCandidate[Model] {
  message : String
  state_id : String
  model : Model
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
fn contains_state(states : Array[StateSnapshot], id : String) -> Bool {
  for state in states {
    if state.id == id {
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
fn positive_mod(value : Int, modulus : Int) -> Int {
  let result = value % modulus
  if result < 0 {
    result + modulus
  } else {
    result
  }
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
fn[Model, Msg] action_is_available(
  machine : Machine[Model, Msg],
  model : Model,
  msg : Msg,
) -> Bool {
  let expected = (machine.describe_msg)(msg)
  for available in (machine.actions)(model) {
    if (machine.describe_msg)(available) == expected {
      return true
    }
  }
  false
}

///|
fn[Model, Msg] add_model_snapshot(
  report : RunReport,
  machine : Machine[Model, Msg],
  model : Model,
  depth : Int,
) -> Unit {
  let state_id = (machine.fingerprint)(model)
  if !contains_state(report.states, state_id) {
    report.states.push({
      id: state_id,
      html: (machine.render)(model),
      depth,
      dependencies: (machine.dependencies)(model),
    })
  }
}

///|
fn[Model, Msg] replay_failure(
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
) -> FailureCandidate[Model]? {
  let mut model = machine.initial
  let initial_html = (machine.render)(model)
  match check_state(property, model, initial_html) {
    Fail(message) =>
      return Some({
        message,
        state_id: (machine.fingerprint)(model),
        model,
      })
    Pass => ()
  }
  for msg in trace {
    if !action_is_available(machine, model, msg) {
      return None
    }
    let next = (machine.update)(model, msg)
    match check_transition(property, model, msg, next) {
      Fail(message) =>
        return Some({
          message,
          state_id: (machine.fingerprint)(next),
          model: next,
        })
      Pass => ()
    }
    model = next
    let html = (machine.render)(model)
    match check_state(property, model, html) {
      Fail(message) =>
        return Some({
          message,
          state_id: (machine.fingerprint)(model),
          model,
        })
      Pass => ()
    }
  }
  None
}

///|
fn[Model, Msg] shrink_trace(
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
) -> Array[Msg] {
  let mut current = trace.copy()
  let mut changed = true
  while changed {
    changed = false
    for index = 0; index < current.length(); index = index + 1 {
      let candidate = without_index(current, index)
      if replay_failure(machine, property, candidate) is Some(_) {
        current = candidate
        changed = true
        break
      }
    }
  }

  let mut msg_changed = true
  while msg_changed {
    msg_changed = false
    for index = 0; index < current.length(); index = index + 1 {
      let original = current[index]
      let smaller = (machine.shrink)(original)
      for candidate_msg in smaller {
        if (machine.describe_msg)(candidate_msg) !=
          (machine.describe_msg)(original) {
          let candidate = replace_index(current, index, candidate_msg)
          if replay_failure(machine, property, candidate) is Some(_) {
            current = candidate
            msg_changed = true
            break
          }
        }
      }
      if msg_changed {
        break
      }
    }
  }
  current
}

///|
fn[Model, Msg] append_failure(
  report : RunReport,
  machine : Machine[Model, Msg],
  property : Property[Model, Msg],
  trace : Array[Msg],
) -> Unit {
  let minimal = shrink_trace(machine, property, trace)
  match replay_failure(machine, property, minimal) {
    Some(failure) => {
      add_model_snapshot(report, machine, failure.model, minimal.length())
      let rendered_trace : Array[String] = []
      for msg in minimal {
        rendered_trace.push((machine.describe_msg)(msg))
      }
      report.failures.push({
        property: property.name,
        message: failure.message,
        state_id: failure.state_id,
        trace: rendered_trace,
      })
    }
    None => ()
  }
}

///|
/// Generate reachable action traces, evaluate properties and collect a static
/// state graph. The runner is deterministic for a given configuration.
pub fn[Model, Msg] run(
  machine : Machine[Model, Msg],
  properties : Array[Property[Model, Msg]],
  config : RunConfig,
) -> RunReport {
  let report : RunReport = {
    seed: config.seed,
    cases: config.cases,
    steps: 0,
    states: [],
    transitions: [],
    failures: [],
  }

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
      if !contains_state(report.states, state_id) {
        report.states.push({
          id: state_id,
          html,
          depth,
          dependencies: (machine.dependencies)(model),
        })
      }

      for property in properties {
        match check_state(property, model, html) {
          Fail(_) => {
            append_failure(report, machine, property, trace)
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

      let selector = config.seed + case_index * 17 + depth * 31
      let msg = actions[positive_mod(selector, actions.length())]
      let next = (machine.update)(model, msg)
      let next_id = (machine.fingerprint)(next)
      trace.push(msg)
      report.steps = report.steps + 1
      report.transitions.push({
        from: state_id,
        action: (machine.describe_msg)(msg),
        to: next_id,
      })

      for property in properties {
        match check_transition(property, model, msg, next) {
          Fail(_) => {
            append_failure(report, machine, property, trace)
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
