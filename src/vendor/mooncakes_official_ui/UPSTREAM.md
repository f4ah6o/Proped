# Upstream provenance

This directory preserves four Apache-2.0 MoonBit sources as read-only fixtures:

- `moonbitlang/mooncakes.io` revision `f7877338598f6a13387b889dd912b15029a0ce5f`
  - `src/page/build_queue/state.mbt`
  - `src/page/build_queue/view.mbt`
- `moonbitlang/website` revision `a6222f7292ce50f2a08847ef0852b1a8d456a393`
  - `src/pages/rabbita-home/main/main.mbt`
- `moonbitlang/moonbit-docs` revision `24f6b9a0b9ac997119ecd3069825edf65d3473fe`
  - `next/sources/fullstack-one-project/frontend/main.mbt`

The Mooncakes and website sources use Apache-2.0 repository licenses. The MoonBit documentation repository states in `LICENSE.md` that code examples and website code are Apache-2.0; that statement is preserved as `LICENSE.moonbit-docs.md`.

The finite adapter keeps the Build Queue `GotBuilds` replacement behavior, the
website tab/carousel index state, and the tutorial submit/reply lifecycle. HTTP
work is recorded as descriptors. Request IDs and response origin metadata are
harness-only delivery metadata and are intentionally not consulted when applying
responses, matching the pinned message boundaries.

Browser DOM, Shiki, real HTTP, clocks, and backend validation execution are out
of scope. No upstream repository was modified.
