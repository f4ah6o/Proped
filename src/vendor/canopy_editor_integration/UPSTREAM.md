# Upstream provenance

- Repository: `dowdiness/canopy`
- Revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- License: Apache-2.0
- Preserved sources:
  - `modules/rabbita_codemirror/codemirror.mbt`
  - `examples/codemirror/main/client.mbt`
  - `apps/ideal/main/update_codemirror.mbt`
- Combined source SHA-256: `98722c622fe4d2026c82e4f9ad8647735a85c2d4f2b6ee16f903a983535cc0e8`

## Boundary classification

The public CodeMirror binding stores browser editor handles in a private JS registry. Mount, set-document, readonly, selection, and unmount operations are command boundaries; document, selection, and focus updates arrive through subscriptions. Those DOM and CodeMirror semantics are therefore classified as browser replay rather than pure model state.

The finite adapter preserves the public lifecycle and the Ideal `handle_codemirror` behavior. Browser callbacks are recorded with synthetic generation, revision, and document metadata only for exploration. The pinned public messages do not carry those fields, and the modeled update intentionally applies delivered callbacks without lifecycle or document correlation.

Ideal's minimal boundary is:

1. `CmMounted` marks the editor mounted and synchronizes external CRDT state.
2. `CmDocChanged(text)` writes text into `SyncEditor`, refreshes the model, optionally issues `set_doc`, and schedules a local-edit effect.
3. `CmSelectionChanged(range)` forwards offsets to a JS selection hook.
4. `CmFocusChanged` is accepted without changing the MoonBit model.

Context-menu open/focus/close is retained as a pure adjacent boundary. DOM focus ownership, CodeMirror transaction composition, native selection direction, and actual editor destruction remain browser-replay concerns.
