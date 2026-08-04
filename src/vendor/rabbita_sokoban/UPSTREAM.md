# Vendored Rabbita Sokoban

- Upstream: `moonbit-community/rabbita`
- Source: `examples/sokoban`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Retrieved: 2026-08-04
- License: Apache-2.0
- `upstream/main.mbt.txt` SHA-256: `ac616b8fa958ed6f9f27751e0622474190efc5a593cce9a9dd8493f73b21e5e4`
- `upstream/styles.css` SHA-256: `18da281946fad1b58efc7da27024c8787c981c833b9aecbddcff8068dc44760b`

The preserved upstream source is 259 lines. `sokoban.mbt` keeps board movement, crate pushing, branching history, timeline jumps, and rendering semantics while replacing browser keyboard events with typed directions for native exploration.

The property fixture models malformed timeline input. Upstream catches parse errors as index `0`, so an invalid value received after movement unexpectedly rewinds the cursor instead of preserving the current point.
