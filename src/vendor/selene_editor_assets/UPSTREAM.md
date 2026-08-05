# Selene Editor asset and preview boundary

- Repository: `moonbit-community/selene`
- Revision: `ca68f3a2898a80db9fc45ff96713d1531814371d`
- License: Apache-2.0
- Combined preserved-source SHA-256: `00a4443e3c035b2b089771584d7efe0ecbf42ff469eb2153f82880091804fbd2`

The exact source fixtures cover the frontend Model/Msg shape, root update dispatch,
project/asset response handling, selection normalization, asset-panel view, and shell
view. Browser/WebGPU rendering, filesystem access, service SSE, and preview execution
are not run. HTTP and subscription boundaries are represented by deterministic effect
descriptors; preview selection is record/replayed as a typed event.

The pinned `AssetsLoaded` message contains only the decoded result and no request
generation. The pinned `Initialize` branch installs service, preview, keyboard, and sidebar
subscriptions and requests the current project every time it is dispatched. Entity selection helpers do validate IDs
against the current scene, so stale preview selection for a deleted entity is retained
as a passing regression property rather than a finding.

No upstream issue, pull request, comment, commit, or other write is performed.
