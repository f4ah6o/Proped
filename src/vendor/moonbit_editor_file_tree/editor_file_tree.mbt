///|
// Adapted from moonbitlang/editor's FileTree widget at revision
// 001c9db52bcdc543c2bec8689b70e97941cecc18.
//
// The adapter starts from the post-connect state where the root level has
// already resolved. String URIs replace the upstream Uri type, two finite
// provider snapshots replace the remote WorkspaceTreeProvider, and resolve
// commands are recorded as deterministic EffectDescriptor values. Response
// messages carry a harness-only request ID so the runner can choose a pending
// response; after descriptor removal, update semantics intentionally apply the
// result by URI alone, matching the upstream FileTreeMsg shape.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.

///|
pub(all) enum EntryKind {
  File
  Directory
} derive(Debug, Eq)

///|
pub fn EntryKind::to_string(self : EntryKind) -> String {
  match self {
    File => "file"
    Directory => "directory"
  }
}

///|
pub(all) struct WorkspaceStat {
  uri : String
  name : String
  kind : EntryKind
  children : Array[WorkspaceStat]?
} derive(Debug, Eq)

///|
pub(all) struct TreeNode {
  uri : String
  name : String
  kind : EntryKind
  children : Array[TreeNode]?
  expanded : Bool
  resolve_failed : Bool
} derive(Debug, Eq)

///|
pub(all) struct PendingResolve {
  effect : @external.EffectDescriptor
  uri : String
  fixture_revision : Int
} derive(Debug, Eq)

///|
pub(all) struct Model {
  root : TreeNode?
  selected : String?
  pending_reveal : String?
  pending_resolves : Array[PendingResolve]
  next_effect_id : Int
  provider_revision : Int
  accepted_root_revision : Int
  last_opened : String?
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  Refresh
  SwitchFixture(Int)
  DirectoryResolveSucceeded(Int, String, Int)
  DirectoryResolveFailed(Int, String)
  ToggleDirectory(String)
  OpenFile(String)
  SetActive(String)
} derive(Debug, Eq)

///|
let root_uri = "readonly-remote://workspace"

///|
let src_uri = "readonly-remote://workspace/src"

///|
let lib_uri = "readonly-remote://workspace/src/lib"

///|
let tests_uri = "readonly-remote://workspace/tests"

///|
let docs_uri = "readonly-remote://workspace/docs"

///|
let app_uri = "readonly-remote://workspace/app"

///|
let src_target = "readonly-remote://workspace/src/lib/util.mbt"

///|
let tests_target = "readonly-remote://workspace/tests/spec.mbt"

///|
let app_target = "readonly-remote://workspace/app/main.mbt"

///|
let outside_target = "memory://outside/file.mbt"

///|
pub fn root() -> String {
  root_uri
}

///|
pub fn target_src() -> String {
  src_target
}

///|
pub fn target_tests() -> String {
  tests_target
}

///|
pub fn target_outside() -> String {
  outside_target
}

///|
fn file(uri : String, name : String) -> WorkspaceStat {
  { uri, name, kind: File, children: None }
}

///|
fn directory(uri : String, name : String) -> WorkspaceStat {
  { uri, name, kind: Directory, children: None }
}

///|
fn fixture_root(revision : Int) -> WorkspaceStat {
  if revision == 2 {
    {
      uri: root_uri,
      name: "workspace",
      kind: Directory,
      children: Some([
        file("\{root_uri}/README.md", "README.md"),
        directory(app_uri, "app"),
        directory(docs_uri, "docs"),
        directory(src_uri, "src"),
        file("\{root_uri}/moon.mod", "moon.mod"),
      ]),
    }
  } else {
    {
      uri: root_uri,
      name: "workspace",
      kind: Directory,
      children: Some([
        file("\{root_uri}/README.md", "README.md"),
        directory(src_uri, "src"),
        directory(tests_uri, "tests"),
        file("\{root_uri}/moon.mod", "moon.mod"),
      ]),
    }
  }
}

///|
fn fixture_stat(revision : Int, uri : String) -> WorkspaceStat? {
  if uri == root_uri {
    Some(fixture_root(revision))
  } else if revision == 2 {
    if uri == app_uri {
      Some({
        uri,
        name: "app",
        kind: Directory,
        children: Some([file(app_target, "main.mbt")]),
      })
    } else if uri == docs_uri {
      Some({
        uri,
        name: "docs",
        kind: Directory,
        children: Some([file("\{docs_uri}/guide.md", "guide.md")]),
      })
    } else if uri == src_uri {
      Some({
        uri,
        name: "src",
        kind: Directory,
        children: Some([file("\{src_uri}/viewer.mbt", "viewer.mbt")]),
      })
    } else {
      None
    }
  } else if uri == src_uri {
    Some({
      uri,
      name: "src",
      kind: Directory,
      children: Some([
        directory(lib_uri, "lib"),
        file("\{src_uri}/main.mbt", "main.mbt"),
      ]),
    })
  } else if uri == lib_uri {
    Some({
      uri,
      name: "lib",
      kind: Directory,
      children: Some([file(src_target, "util.mbt")]),
    })
  } else if uri == tests_uri {
    Some({
      uri,
      name: "tests",
      kind: Directory,
      children: Some([file(tests_target, "spec.mbt")]),
    })
  } else {
    None
  }
}

///|
fn TreeNode::from_stat(stat : WorkspaceStat, expanded : Bool) -> TreeNode {
  {
    uri: stat.uri,
    name: stat.name,
    kind: stat.kind,
    children: stat.children.map(children => {
      children.map(child => TreeNode::from_stat(child, false))
    }),
    expanded,
    resolve_failed: false,
  }
}

///|
fn replace_child(
  children : Array[TreeNode],
  index : Int,
  replacement : TreeNode,
) -> Array[TreeNode] {
  let result = children.copy()
  result[index] = replacement
  result
}

///|
fn TreeNode::find(self : TreeNode, uri : String) -> TreeNode? {
  if self.uri == uri {
    return Some(self)
  }
  match self.children {
    Some(children) =>
      for child in children {
        match child.find(uri) {
          Some(found) => return Some(found)
          None => ()
        }
      }
    None => ()
  }
  None
}

///|
fn TreeNode::with_resolved(
  self : TreeNode,
  uri : String,
  stat : WorkspaceStat,
) -> TreeNode? {
  if self.uri == uri {
    return Some({
      ..self,
      children: stat.children.map(children => {
        children.map(child => TreeNode::from_stat(child, false))
      }),
      resolve_failed: false,
    })
  }
  match self.children {
    Some(children) => {
      for index, child in children {
        match child.with_resolved(uri, stat) {
          Some(next) =>
            return Some({
              ..self,
              children: Some(replace_child(children, index, next)),
            })
          None => ()
        }
      }
      None
    }
    None => None
  }
}

///|
fn TreeNode::with_resolve_failed(self : TreeNode, uri : String) -> TreeNode? {
  if self.uri == uri {
    return Some({ ..self, resolve_failed: true })
  }
  match self.children {
    Some(children) => {
      for index, child in children {
        match child.with_resolve_failed(uri) {
          Some(next) =>
            return Some({
              ..self,
              children: Some(replace_child(children, index, next)),
            })
          None => ()
        }
      }
      None
    }
    None => None
  }
}

///|
fn TreeNode::toggle(self : TreeNode, uri : String) -> (TreeNode, Bool)? {
  if self.uri == uri {
    if self.expanded {
      return Some(({ ..self, expanded: false }, false))
    }
    let next = { ..self, expanded: true, resolve_failed: false }
    return Some((next, self.children is None))
  }
  match self.children {
    Some(children) => {
      for index, child in children {
        match child.toggle(uri) {
          Some((next, resolve)) =>
            return Some(
              (
                { ..self, children: Some(replace_child(children, index, next)) },
                resolve,
              ),
            )
          None => ()
        }
      }
      None
    }
    None => None
  }
}

///|
fn ancestor_uris(target : String) -> Array[String]? {
  if target == src_target {
    Some([src_uri, lib_uri])
  } else if target == tests_target {
    Some([tests_uri])
  } else if target == app_target {
    Some([app_uri])
  } else if target.has_prefix("\{root_uri}/") {
    Some([])
  } else {
    None
  }
}

///|
fn TreeNode::reveal_ancestors(
  self : TreeNode,
  ancestors : Array[String],
  index : Int,
) -> (TreeNode, String?, Bool) {
  if index == ancestors.length() {
    return match self.children {
      Some(_) => (self, None, true)
      None => (self, Some(self.uri), false)
    }
  }
  match self.children {
    None => (self, Some(self.uri), false)
    Some(children) => {
      for child_index, child in children {
        if child.uri == ancestors[index] {
          let expanded = { ..child, expanded: true }
          let (next, resolve_uri, done) = expanded.reveal_ancestors(
            ancestors,
            index + 1,
          )
          return (
            {
              ..self,
              children: Some(replace_child(children, child_index, next)),
            },
            resolve_uri,
            done,
          )
        }
      }
      (self, None, false)
    }
  }
}

///|
fn TreeNode::reveal_step(
  self : TreeNode,
  target : String,
) -> (TreeNode, String?, Bool) {
  match ancestor_uris(target) {
    Some(ancestors) => self.reveal_ancestors(ancestors, 0)
    None => (self, None, false)
  }
}

///|
fn pending_without(model : Model, effect_id : Int) -> Array[PendingResolve] {
  model.pending_resolves.filter(pending => pending.effect.id != effect_id)
}

///|
fn pending_by_id(model : Model, effect_id : Int) -> PendingResolve? {
  for pending in model.pending_resolves {
    if pending.effect.id == effect_id {
      return Some(pending)
    }
  }
  None
}

///|
fn record_resolve(model : Model, uri : String) -> Model {
  let pending_resolves = model.pending_resolves.copy()
  pending_resolves.push({
    effect: {
      id: model.next_effect_id,
      kind: @external.NativeInvoke,
      operation: "resolve-directory",
      payload: "uri=\{uri};fixture=\{model.provider_revision}",
    },
    uri,
    fixture_revision: model.provider_revision,
  })
  { ..model, pending_resolves, next_effect_id: model.next_effect_id + 1 }
}

///|
fn continue_reveal(model : Model) -> Model {
  match (model.root, model.pending_reveal) {
    (Some(root), Some(target)) => {
      let (root, resolve_uri, done) = root.reveal_step(target)
      let next = { ..model, root: Some(root) }
      match resolve_uri {
        Some(uri) => record_resolve(next, uri)
        None =>
          if done {
            { ..next, pending_reveal: None }
          } else {
            { ..next, pending_reveal: None }
          }
      }
    }
    _ => model
  }
}

///|
pub fn initial() -> Model {
  {
    root: Some(TreeNode::from_stat(fixture_root(1), true)),
    selected: None,
    pending_reveal: None,
    pending_resolves: [],
    next_effect_id: 1,
    provider_revision: 1,
    accepted_root_revision: 1,
    last_opened: None,
  }
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Refresh => record_resolve(model, root_uri)
    SwitchFixture(revision) =>
      if revision == 1 || revision == 2 {
        { ..model, provider_revision: revision }
      } else {
        model
      }
    ToggleDirectory(uri) =>
      match model.root {
        Some(root) =>
          match root.toggle(uri) {
            Some((root, resolve)) => {
              let next = { ..model, root: Some(root) }
              if resolve {
                record_resolve(next, uri)
              } else {
                next
              }
            }
            None => model
          }
        None => model
      }
    OpenFile(uri) => { ..model, selected: Some(uri), last_opened: Some(uri) }
    SetActive(uri) =>
      continue_reveal({
        ..model,
        selected: Some(uri),
        pending_reveal: Some(uri),
      })
    DirectoryResolveSucceeded(effect_id, uri, fixture_revision) =>
      match pending_by_id(model, effect_id) {
        Some(pending) if pending.uri == uri &&
          pending.fixture_revision == fixture_revision =>
          match fixture_stat(fixture_revision, uri) {
            Some(stat) => {
              let base = {
                ..model,
                pending_resolves: pending_without(model, effect_id),
              }
              let resolved = if uri == root_uri {
                {
                  ..base,
                  root: Some(TreeNode::from_stat(stat, true)),
                  pending_reveal: if base.pending_reveal is Some(_) {
                    base.pending_reveal
                  } else {
                    base.selected
                  },
                  accepted_root_revision: fixture_revision,
                }
              } else {
                match base.root {
                  Some(root) =>
                    match root.with_resolved(uri, stat) {
                      Some(root) => { ..base, root: Some(root) }
                      None => base
                    }
                  None => base
                }
              }
              continue_reveal(resolved)
            }
            None => model
          }
        _ => model
      }
    DirectoryResolveFailed(effect_id, uri) =>
      match pending_by_id(model, effect_id) {
        Some(pending) if pending.uri == uri => {
          let base = {
            ..model,
            pending_resolves: pending_without(model, effect_id),
            pending_reveal: None,
          }
          match base.root {
            Some(root) =>
              match root.with_resolve_failed(uri) {
                Some(root) => { ..base, root: Some(root) }
                None => base
              }
            None => base
          }
        }
        _ => model
      }
  }
}

///|
fn visible_nodes_loop(node : TreeNode, output : Array[TreeNode]) -> Unit {
  match node.children {
    Some(children) =>
      for child in children {
        output.push(child)
        if child.kind is Directory && child.expanded {
          visible_nodes_loop(child, output)
        }
      }
    None => ()
  }
}

///|
pub fn visible_nodes(model : Model) -> Array[TreeNode] {
  let output : Array[TreeNode] = []
  match model.root {
    Some(root) => visible_nodes_loop(root, output)
    None => ()
  }
  output
}

///|
fn find_in_root(root : TreeNode?, uri : String) -> TreeNode? {
  match root {
    Some(root) => root.find(uri)
    None => None
  }
}

///|
fn contains_pending_uri(model : Model, uri : String) -> Bool {
  model.pending_resolves.any(pending => pending.uri == uri)
}

///|
fn push_set_active(
  actions : Array[Msg],
  model : Model,
  target : String,
) -> Unit {
  if model.selected != Some(target) {
    actions.push(SetActive(target))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = []
  push_set_active(actions, model, tests_target)
  push_set_active(actions, model, src_target)
  push_set_active(actions, model, outside_target)
  if model.provider_revision == 1 {
    actions.push(SwitchFixture(2))
  } else {
    actions.push(SwitchFixture(1))
  }
  if !contains_pending_uri(model, root_uri) ||
    model.pending_resolves.length() < 3 {
    actions.push(Refresh)
  }
  for uri in [src_uri, lib_uri, tests_uri, app_uri, docs_uri] {
    match find_in_root(model.root, uri) {
      Some(node) if node.kind is Directory => actions.push(ToggleDirectory(uri))
      _ => ()
    }
  }
  for node in visible_nodes(model) {
    if node.kind is File {
      actions.push(OpenFile(node.uri))
    }
  }
  for pending in model.pending_resolves {
    if fixture_stat(pending.fixture_revision, pending.uri) is Some(_) {
      actions.push(
        DirectoryResolveSucceeded(
          pending.effect.id,
          pending.uri,
          pending.fixture_revision,
        ),
      )
    }
    actions.push(DirectoryResolveFailed(pending.effect.id, pending.uri))
  }
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SwitchFixture(revision) if revision != 1 => [SwitchFixture(1)]
    OpenFile(uri) if uri != "\{root_uri}/moon.mod" =>
      [OpenFile("\{root_uri}/moon.mod")]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Refresh => "refresh"
    SwitchFixture(revision) => "switch-fixture:\{revision}"
    DirectoryResolveSucceeded(effect_id, uri, revision) =>
      "resolve-success:\{effect_id}:\{revision}:\{uri.length()}:\{uri}"
    DirectoryResolveFailed(effect_id, uri) =>
      "resolve-failure:\{effect_id}:\{uri.length()}:\{uri}"
    ToggleDirectory(uri) => "toggle:\{uri.length()}:\{uri}"
    OpenFile(uri) => "open:\{uri.length()}:\{uri}"
    SetActive(uri) => "set-active:\{uri.length()}:\{uri}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Refresh => "Refresh"
    SwitchFixture(revision) => "SwitchFixture(\{revision})"
    DirectoryResolveSucceeded(effect_id, uri, revision) =>
      "DirectoryResolveSucceeded(request=\{effect_id}, uri=\{uri.escape(quote=true)}, fixture=\{revision})"
    DirectoryResolveFailed(effect_id, uri) =>
      "DirectoryResolveFailed(request=\{effect_id}, uri=\{uri.escape(quote=true)})"
    ToggleDirectory(uri) => "ToggleDirectory(\{uri.escape(quote=true)})"
    OpenFile(uri) => "OpenFile(\{uri.escape(quote=true)})"
    SetActive(uri) => "SetActive(\{uri.escape(quote=true)})"
  }
}

///|
fn write_optional(output : StringBuilder, value : String?) -> Unit {
  match value {
    Some(value) => {
      output.write_object(value.length())
      output.write_char(':')
      output.write_string(value)
    }
    None => output.write_string("none")
  }
}

///|
fn write_node(output : StringBuilder, node : TreeNode) -> Unit {
  output.write_string("|node=")
  output.write_object(node.uri.length())
  output.write_char(':')
  output.write_string(node.uri)
  output.write_char(':')
  output.write_string(node.kind.to_string())
  output.write_char(':')
  output.write_object(node.expanded)
  output.write_char(':')
  output.write_object(node.resolve_failed)
  match node.children {
    Some(children) => {
      output.write_string(":children=")
      output.write_object(children.length())
      for child in children {
        write_node(output, child)
      }
    }
    None => output.write_string(":unresolved")
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("moonbit-editor-file-tree|provider=")
  output.write_object(model.provider_revision)
  output.write_string("|accepted=")
  output.write_object(model.accepted_root_revision)
  output.write_string("|next-effect=")
  output.write_object(model.next_effect_id)
  output.write_string("|selected=")
  write_optional(output, model.selected)
  output.write_string("|pending-reveal=")
  write_optional(output, model.pending_reveal)
  output.write_string("|last-opened=")
  write_optional(output, model.last_opened)
  match model.root {
    Some(root) => write_node(output, root)
    None => output.write_string("|root=none")
  }
  for pending in model.pending_resolves {
    output.write_string("|resolve=")
    output.write_object(pending.effect.id)
    output.write_char(':')
    output.write_object(pending.fixture_revision)
    output.write_char(':')
    output.write_object(pending.uri.length())
    output.write_char(':')
    output.write_string(pending.uri)
  }
  output.to_string()
}

///|
fn optional_label(value : String?) -> String {
  match value {
    Some(value) => value
    None => "none"
  }
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let rows : Array[@rabbita.Html] = []
  for node in visible_nodes(model) {
    let selected = model.selected == Some(node.uri)
    rows.push(
      @html.li(
        class=if selected { "tree-row is-selected" } else { "tree-row" },
        "kind=\{node.kind.to_string()};expanded=\{node.expanded};failed=\{node.resolve_failed};uri=\{node.uri}",
      ),
    )
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("MoonBit Editor file tree"),
      @html.p("provider-revision=\{model.provider_revision}"),
      @html.p("accepted-root-revision=\{model.accepted_root_revision}"),
      @html.p("selected=\{optional_label(model.selected)}"),
      @html.p("pending-reveal=\{optional_label(model.pending_reveal)}"),
      @html.p("last-opened=\{optional_label(model.last_opened)}"),
      @html.ul(rows),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/moonbit-editor-file-tree.json", "src/vendor/moonbit_editor_file_tree/upstream/file_tree.mbt.txt",
    "src/vendor/moonbit_editor_file_tree/upstream/tree_state.mbt.txt", "src/vendor/moonbit_editor_file_tree/upstream/tree_provider.mbt.txt",
    "src/vendor/moonbit_editor_file_tree/editor_file_tree.mbt",
  ]
}

///|
fn is_ancestor(directory : String, target : String) -> Bool {
  target.has_prefix(directory + "/")
}

///|
fn pending_effects(model : Model) -> Array[@external.EffectDescriptor] {
  model.pending_resolves.map(pending => pending.effect)
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "asynchronous resolve responses preserve newer tree intent",
      fn(before, msg, after) {
        match msg {
          DirectoryResolveFailed(effect_id, uri) =>
            match (pending_by_id(before, effect_id), before.pending_reveal) {
              (Some(pending), Some(target)) if pending.uri == uri &&
                !is_ancestor(uri, target) &&
                after.pending_reveal != Some(target) =>
                @proped.Fail(
                  "stale resolve failure for \{uri} cleared newer reveal target \{target}",
                )
              _ => @proped.Pass
            }
          DirectoryResolveSucceeded(effect_id, uri, revision) =>
            match pending_by_id(before, effect_id) {
              Some(pending) if pending.uri == uri &&
                uri == root_uri &&
                revision < before.accepted_root_revision &&
                after.accepted_root_revision < before.accepted_root_revision =>
                @proped.Fail(
                  "stale root revision \{revision} replaced accepted revision \{before.accepted_root_revision}",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @external.unique_effect_ids_property(
      "pending resolve IDs remain unique", pending_effects,
    ),
    @proped.state_property("outside targets terminate auto reveal", fn(
      model,
      _,
    ) {
      if model.selected == Some(outside_target) &&
        model.pending_reveal is Some(_) {
        @proped.Fail("outside target remained pending")
      } else {
        @proped.Pass
      }
    }),
    @proped.transition_property("open file selects the same URI", fn(
      _before,
      msg,
      after,
    ) {
      match msg {
        OpenFile(uri) if after.selected != Some(uri) ||
          after.last_opened != Some(uri) =>
          @proped.Fail("open intent and selected URI diverged")
        _ => @proped.Pass
      }
    }),
    @proped.transition_property(
      "late resolve does not re-expand a collapsed directory",
      fn(before, msg, after) {
        match msg {
          DirectoryResolveSucceeded(_, uri, _) =>
            match
              (find_in_root(before.root, uri), find_in_root(after.root, uri)) {
              (Some(before_node), Some(after_node)) if !before_node.expanded &&
                after_node.expanded =>
                @proped.Fail(
                  "late resolve re-expanded collapsed directory \{uri}",
                )
              _ => @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.state_property("rendered tree status matches model", fn(
      model,
      html,
    ) {
      if !html.contains("selected=\{optional_label(model.selected)}") {
        @proped.Fail("rendered selection did not match model")
      } else if !html.contains(
          "pending-reveal=\{optional_label(model.pending_reveal)}",
        ) {
        @proped.Fail("rendered pending reveal did not match model")
      } else if !html.contains(
          "accepted-root-revision=\{model.accepted_root_revision}",
        ) {
        @proped.Fail("rendered root revision did not match model")
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
  { cases: 1024, max_depth: 9, max_states: 1600, seed: 73, shrink_budget: 8192 }
}
