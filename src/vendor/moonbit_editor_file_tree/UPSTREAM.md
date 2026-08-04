# Upstream provenance

- Project: `moonbitlang/editor`
- Revision: `001c9db52bcdc543c2bec8689b70e97941cecc18`
- License: Apache-2.0
- Main paths:
  - `internal/shell/widgets/file_tree/file_tree.mbt`
  - `internal/shell/widgets/file_tree/tree_state.mbt`
  - `internal/shell/workbench/tree_provider.mbt`
  - `internal/shell/widgets/file_tree/file_tree.css`

Preserved source hashes:

- `file_tree.mbt`: `ebb0b018ae049c1f182c7c74d0361aaee0c439761d00a8ead5f20e94e1968547`
- `tree_state.mbt`: `aa05d1f2a944f40864d59882b0e08f09446d3a50d963fd508127dbffdc4aa00b`
- `tree_provider.mbt`: `20e44ea3d27442f6cfd4eca84fed5a5bde477cf53a215c4acb242d74fa55c84e`
- `file_tree.css`: `483fdbeb4770c4297fdb4e2e0ea58361e6586d67e9ddc0d0cf18b8cc40129788`

## Adapter boundary

The upstream `FileTreeModel`, `FileTreeMsg`, and `TreeNode` types are private and
the shell package is JS-only. The adapter therefore reproduces the update and
tree-reveal semantics over String URIs and two finite workspace snapshots. The
remote `WorkspaceTreeProvider.resolve` command becomes a `NativeInvoke` effect
descriptor. A harness-only request ID chooses which pending response arrives;
the actual update still applies success/failure by URI, matching the upstream
message that carries no request or generation identity.

The initial adapter model represents the normal post-connect state after the
root level has resolved. Cold refreshes, overlapping auto-reveals, success,
failure, stale order, collapse while resolving, missing targets, and two provider
snapshots remain explorable.

No upstream issue, pull request, comment, or commit was created.
