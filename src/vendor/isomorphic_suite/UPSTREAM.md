# Upstream provenance

- Project: `moonbit-community/isomorphic`
- Revision: `590ac1c4de71050419cc6643942e0d1f181301aa`
- Covered applications:
  - `kanban/frontend/app`
  - `todoapp/frontend/app`
  - `noteapp/frontend/app`
- Declared license: Apache-2.0 in each application's `moon.mod.json`
- Standalone license file at the pinned revision: absent

No upstream source is copied into this directory. The adapter is a clean-room,
finite model based on reviewed public `Model`, `Msg`, and update behavior.

## Source hashes

- Kanban `types.mbt`: `9b229d9cbfacf3bf11d67b7de157d02bbdc12d2b2e69d303c4568ae9bb136cb2`
- Kanban `update.mbt`: `1f6dd6dbc695901a24d88b6010fb512532bb24bd32f7eaa5d8b1f9b04075b042`
- Kanban `moon.mod.json`: `559ae497b6439e6af21fe1a093f230b379bbc6382ed854bbd122d99f7ac4a85a`
- Todo `types.mbt`: `647eb578aa0b6867cb4ea13cfd740fe2269207b41c73141e0c19d545b47f0b7e`
- Todo `update.mbt`: `41b2ad53656e7cd62f4323fad3fbd3da81fdd5ee93a5d52d18035e6aa24a73bb`
- Todo `moon.mod.json`: `7a85035a9200abd3a4f6e99c5635d405d2e5c6a414c6ad64a693a74880f90751`
- Note `types.mbt`: `0cf75cae521d5711bea4a3ba00fdfe8ee123313940d509eb0099844ea6ae59b6`
- Note `update.mbt`: `fbb976953f2f9b350e36a17e49994b6994c1730648945cfbcc40e747b5a59610`
- Note `moon.mod.json`: `4d6c7cb67c2f4ca9de1435329432e7b2517fca58c1021927358f58edcedfc65a`
- Combined six frontend source files: `feb28cfc1d26aeecff44fdbe6b12335dbfe0ac0cc534a3b6018ca8686d1f8bed`

## Adapter boundary

The three applications share an Elm/MVU shape and issue HTTP commands whose
response messages carry no request or generation identity. The adapter records
causally valid requests with stable IDs, then applies responses using the same
uncorrelated response semantics as the pinned update branches.

`SwitchApp` is a test-harness matrix selector, not an upstream UI message. Only
the active application's actions are generated. Request IDs are stable per
application/domain so shrinking can delete unrelated matrix actions without
invalidating response identity.

## Findings

- Kanban permits direct `MoveCardTo` dispatch to a missing column, producing a
  dangling card-to-column reference.
- A late Kanban board load can restore a card removed by a newer optimistic
  deletion.
- A late Todo list load can overwrite a newer mutation response.
- A Note list load can remove the currently selected note without clearing the
  selected ID.

No upstream issue, pull request, comment, or commit was created.
