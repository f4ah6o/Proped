# OpenSeek desktop lifecycle boundary

- Repository: `moonbitlang/openseek`
- Revision: `b21e078a4f3cdd11129b4d33348dcc09abf22026`
- License: Apache-2.0
- Combined preserved-source SHA-256: `f649bdad2293cacc60f752eb422d4c744e54fad58027d4e903dc6b0316bc214b`

The preserved source covers the root model/update and self-update flow, terminal
state/update, and file-editor state/update. The clean-room adapter records native
bridge requests instead of executing a desktop host, PTY, filesystem, DOM, or
network operation.

The pinned self-update reply carries `result` and `explicit`, but no request or
update channel. `ProviderChanged` resets the UI when the channel changes, so an
older check can later be accepted in `UpdateUnknown`. The pinned terminal
`EmulatorReady` branch leaves the tab `TabOpening` with no pending marker while
`terminal_open` is in flight, allowing a duplicate ready report to issue another
open. The file editor intentionally re-reads an already-open `TabLoading` tab on
selection; `FileLoaded` correlates only owner/path, so reverse response order can
replace newer content.

The temporary pinned-source wbtest could not run with the current compiler because
its resolved `moonbitlang/editor` dependency uses an older `Repr` constructor API.
The adapter therefore validates the exact preserved branches without claiming the
whole upstream package currently builds under this toolchain.

No upstream issue, pull request, comment, commit, or other write is performed.
