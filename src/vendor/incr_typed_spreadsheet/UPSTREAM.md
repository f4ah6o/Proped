# Upstream provenance

- Project: `dowdiness/incr`
- Revision: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`
- Published package: `dowdiness/incr@0.15.0`
- License: Apache-2.0
- Primary application source: `examples/typed_spreadsheet_rabbita_demo/model.mbt`
- Primary source SHA-256: `2006ab74c224621c700bc7583494172cf486f15129f49bfc9be878cc34f083fe`

Additional preserved evidence:

- `grid_snapshot_cache.mbt`: `6bf2263c7a2b9182f624d5f44272f58cf541e264c3030107197ea733d6a958f9`
- `incr/cells/derived_facade.mbt`: retained to document Eq and no-backdate APIs
- `incr/cells/input.mbt`: retained to document same-value and force-set behavior

## Adapter boundary

The upstream UI owns a mutable `Worksheet` and a 2,500-cell grid. The adapter
uses the exact pinned worksheet, formula parser, operation runner, and incr
runtime but limits the visible sheet to A1, B1, and C1. Every transition creates
an isolated runtime from the plain committed text, applies one operation, and
copies snapshots plus trace counts back to a pure model. This prevents mutable
runtime objects from leaking between property-exploration branches.

The adapter also constructs two real incr graphs from replayable probe history:

- Eq-backed `Derived` backdates a stable parity result and skips downstream work.
- `derived_no_backdate` intentionally advances change identity for the same
  parity result, so downstream work runs again.

The always-false comparison in no-backdate constructors is therefore preserved
as documented semantics, not reported as an invalid equality implementation.

## Finding

The formula AST evaluates integer `Add` and `Mul` using MoonBit `Int` arithmetic
without overflow detection. With the seeded formula B1=`A1 + 1`, editing A1 to
2147483647 produces B1=-2147483648 while the worksheet reports an ordinary
`Ok(Int(...))` result.

Minimized UI trace:

```text
UpdateDraft(A1, "2147483647")
ApplySelected
```

The run also verifies parse-error preservation, delete propagation, sparse
snapshot/trace data, stale inline-blur idempotency, and the declared Eq versus
no-backdate recomputation counts.

No upstream issue, pull request, comment, or commit was created.
