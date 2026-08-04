# Signal Reader adapter provenance

- Repository: `CAIMEOX/signal_reader`
- Revision: `e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a`
- Module-declared license: MIT (`moon.mod.json`)
- Relevant paths: `frontend/model.mbt`, `frontend/update.mbt`, `frontend/commands.mbt`
- SHA-256:
  - `frontend/update.mbt`: `df8dd9c5382d0acdcee335ec8cc3ba88b386b47c4ab15cd178a352e1812b617e`
  - `frontend/model.mbt`: `2a4fb13befb42f551dbaea3381baa79f8e7a285864ebcf751260d87d3fff74b6`
  - `frontend/commands.mbt`: `02a1015a94132a5926e8e6cf2b6c27036eb119c32b7072b414c51b56751c4da0`

The pinned revision does not contain a standalone LICENSE file. No upstream source
is copied into this repository. This directory contains a clean-room, finite
behavioral adapter written for deterministic response-order exploration.

The adapter preserves the observable semantics relevant to this campaign:

- item and search responses are delivered without a request correlation token;
- any `ItemsLoaded` response replaces the current item list;
- any `SearchLoaded` response replaces the current search results;
- saved-state callbacks reapply the callback's requested state or roll it back on
  failure;
- HTTP work is recorded as deterministic descriptors and never executed.
