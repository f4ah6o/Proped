# Upstream provenance

- Repository: `moonbit-community/rabbita_xterm`
- Revision: `9734f6a39ce3899dbf6738fa3a100c2cebaefc23`
- License: Apache-2.0
- Preserved source: `upstream/xterm.mbt.txt`
- SHA-256: `4b1b32a105a5c7cb4b58b24684a546ba3a98d3acea75209ca9b26acc10068c02`

The native adapter preserves the managed lifecycle state transitions needed for deterministic exploration. Browser objects, dynamic imports, DOM mounting, and xterm.js listeners are replaced with generation-tagged messages. The pinned `Resize` and `Resized` behavior is intentionally preserved: both store dimensions without checking that columns and rows are positive.

No upstream repository writes are performed.
