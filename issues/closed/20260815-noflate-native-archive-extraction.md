# Native archive extraction with `noflate`

## Decision

Allow one third-party Rust dependency, [`noflate`](https://github.com/sile/noflate), in `proped-cli` and use it to remove Proped's dependency on the host `tar` executable for managed Node archive extraction.

Keep the native shell dependency-light rather than enforcing an absolute zero-crate policy. The target dependency graph is:

```text
proped-cli
└── noflate
```

`noflate` is appropriate because it has no runtime crate dependencies, uses no unsafe code, exposes sans-I/O DEFLATE/gzip/zlib primitives, and does not pull a general archive framework into Proped.

## Current state

`proped-cli` currently has no third-party Rust dependencies.

Managed Node artifacts are pinned in `runtime-metadata.txt` as:

- macOS: `.tar.gz`
- Linux: `.tar.gz`
- Windows: `.zip`

`setup.rs` currently delegates extraction to the host `tar` command:

- `tar -xzf` for `.tar.gz`
- `tar -xf` for `.zip`

This makes setup depend on host tooling even though artifact discovery, download, hashing, staging, promotion, and runtime verification are already controlled by Proped.

## Goal

Make managed Node extraction native to `proped-cli` while keeping the Rust dependency graph intentionally small.

After this work:

- `noflate` is the only third-party runtime Rust crate.
- `.tar.gz` extraction on macOS/Linux does not execute `tar`.
- `.zip` extraction on Windows does not execute `tar`.
- extraction remains deterministic, integrity-checked, staging-first, and atomic at promotion time.
- unsupported archive constructs fail closed with stable Proped diagnostics instead of silently falling back to host tools.

## Non-goals

This issue does not attempt to:

- implement a general-purpose TAR or ZIP library;
- support arbitrary user-provided archives;
- replace `curl` or otherwise redesign HTTPS acquisition;
- add broad compression-format support beyond what the pinned Node distributions require;
- vendor or fork `noflate` unless an independently justified maintenance requirement appears.

## Design

### 1. Add `noflate`

Add `noflate` as a direct dependency of `proped-cli`, pinned according to the repository's normal lockfile policy.

Do not add `flate2`, `tar`, `zip`, `crc32fast`, macro-heavy parser libraries, or similar transitive dependency trees.

### 2. Introduce a narrow archive boundary

Move archive-specific logic out of `setup.rs` behind a small internal module, for example:

```text
crates/proped-cli/src/archive/
├── mod.rs
├── tar.rs
└── zip.rs
```

The public internal API should be narrow and driven by the format already selected from `runtime-metadata.txt`, for example conceptually:

```rust
extract_archive(archive_path, format, destination)
```

The archive implementation must not know about Node version selection, download URLs, npm, Playwright, or final runtime promotion.

### 3. `.tar.gz`: `noflate` + minimal TAR reader

For macOS/Linux:

```text
.tar.gz file
    ↓
noflate gzip decoder
    ↓
TAR byte stream
    ↓
Proped minimal TAR reader
    ↓
staging directory
```

The TAR implementation should support only the entry types required by the pinned official Node archives. Determine that required subset from fixtures/tests before finalizing the parser.

Expected support is likely to include regular files, directories, and symlinks plus the metadata required to materialize them correctly, but support must be justified by observed pinned artifacts rather than guessed into a general archive implementation.

Reject unsupported type flags and malformed headers with a stable extraction diagnostic.

### 4. `.zip`: minimal ZIP container + `noflate`

For Windows:

```text
.zip file
    ↓
Proped minimal ZIP container parser
    ├── stored   → copy bytes
    └── deflate  → noflate::deflate
    ↓
staging directory
```

Implement only the ZIP subset required by the pinned official Node Windows archives. Do not grow this into a general ZIP implementation.

Unsupported compression methods, encrypted entries, malformed directory records, unsupported flags, or inconsistent sizes/checksums must fail closed.

### 5. Preserve the existing integrity boundary

The existing SHA-256 verification of the downloaded archive remains mandatory and occurs before extraction.

Native extraction does not weaken the artifact-integrity contract. It only replaces the host extraction process.

### 6. Extraction safety requirements

All archive extraction code must treat archive paths as untrusted input even though the artifacts are pinned and hash-verified.

At minimum:

- reject absolute paths;
- reject path traversal through `..`;
- reject entries that escape the staging root after normalization;
- do not follow an archive-created symlink while materializing a later path;
- reject duplicate/conflicting entries when their behavior would be ambiguous;
- validate sizes and offsets before allocation or slicing;
- avoid unchecked integer conversions/overflow;
- bound allocations from archive-declared sizes;
- remove incomplete staging state on extraction failure;
- never extract directly into the final managed Node directory.

Symlink handling must preserve the official Node archive where required while preventing link-assisted writes outside staging.

### 7. Diagnostics

Keep extraction failures within the existing managed-runtime diagnostic model.

Prefer one stable top-level code, such as the existing `managed_node_acquisition_failed` where compatible, with stage-specific messages for archive decoding/extraction. Introduce a new public diagnostic code only if the existing contract cannot represent extraction failures cleanly.

Do not expose raw archive contents in diagnostics.

## Implementation sequence

1. Add representative pinned Node archive fixtures or fixture generators sufficient to lock down the required TAR/ZIP subset without checking large upstream archives into git.
2. Add `noflate` and the archive module boundary.
3. Implement gzip decoding and minimal TAR extraction for macOS/Linux.
4. Add hostile TAR tests: traversal, absolute paths, malformed headers, unsupported types, conflicting entries, and symlink escape attempts.
5. Implement minimal ZIP extraction for Windows using `noflate` for DEFLATE payloads.
6. Add hostile ZIP tests: traversal, unsupported/encrypted methods, malformed offsets/sizes, conflicting entries, and decompression/checksum failures.
7. Replace the `Command::new("tar")` extraction path in `ensure_managed_node` with the native archive module.
8. Remove extraction-specific host-tool assumptions and update tests/docs that assert or imply a `tar` requirement.
9. Verify managed Node setup and reuse behavior on macOS, Linux, and Windows CI targets available to the repository.

## Acceptance criteria

- `Cargo.lock` contains `proped-cli` plus `noflate` and only dependencies required by `noflate` itself; `noflate` currently has no runtime crate dependencies.
- `proped-cli` no longer executes `tar` for managed Node extraction.
- Both pinned archive families are handled natively: `.tar.gz` on macOS/Linux and `.zip` on Windows.
- Existing archive SHA-256 verification still runs before extraction.
- Existing staging and atomic promotion semantics are preserved.
- A corrupt, truncated, unsupported, traversal-bearing, or otherwise unsafe archive fails without writing outside staging.
- Tests cover the accepted Node archive subset and rejection cases.
- `cargo test --workspace` passes.
- `cargo clippy --workspace --all-targets -- -D warnings` passes where that command is part of the repository's normal gate.
- No fallback to external `tar`, PowerShell archive extraction, Python, Node, or another host archive utility is introduced.

## Follow-up boundary

`curl` remains a separate decision. Replacing archive extraction with `noflate` is intentionally independent from HTTPS/TLS acquisition because removing `curl` would introduce materially different networking, certificate, proxy, and platform concerns.

Close this issue by moving this file to `issues/closed/` once the native extraction path is implemented and the acceptance criteria are satisfied.

## Completion

Implemented on 2026-08-15.

- Added `noflate` 0.1.1 as the only third-party Rust runtime dependency.
- Added a bounded native archive boundary under `crates/proped-cli/src/archive/`.
- `.tar.gz` extraction supports the pinned Node subset: regular files, directories, and safe relative symlinks, with executable modes preserved.
- `.zip` extraction supports stored and DEFLATE entries, validates central/local headers, CRC-32, flags, offsets, sizes, and rejects ZIP64/encryption/symlinks/unsafe paths.
- Removed the managed Node `tar` subprocess path from `setup.rs`; extraction failures remain `managed_node_acquisition_failed` and staging is removed on failure.
- Added hostile archive tests for traversal, duplicate/conflicting entries, unsupported TAR types, symlink escape/follow attempts, corrupt gzip, encrypted ZIP entries, data descriptors, and CRC failures.
- Updated third-party notices with the `noflate` MIT license.

Verification:

- `cargo test --workspace`: 20 passed.
- `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- `cargo tree -p proped-cli`: `proped-cli -> noflate v0.1.1` only.
- `git diff --check`: passed before closure bookkeeping.
- Pinned macOS artifact `node-v22.23.2-darwin-arm64.tar.gz` SHA-256 matched metadata and extracted successfully through the native implementation in release mode. Its raw TAR entry types are exactly directory, regular file, and symlink.
- Pinned Windows artifact `node-v22.23.2-win-x64.zip` SHA-256 matched metadata and extracted successfully through the native implementation in release mode. Its entries use only stored/DEFLATE methods; all current general-purpose flags are zero.

