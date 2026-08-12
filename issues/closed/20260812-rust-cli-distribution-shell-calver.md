# Rust CLI distribution shell + CalVer releases

Status: closed

## Goal

Make Proped-Rabbita install and run as a product-like native CLI without rewriting the working MoonBit exploration core or the Node/Playwright Web execution engine.

The architecture is intentionally a **Rust product shell around the existing engines**, not a full Rust port.

```text
proped (Rust native CLI)
├─ product CLI / version / diagnostics
├─ runtime discovery and process orchestration
├─ managed runtime/cache boundaries
├─ security/sandbox integration boundary
├─ dispatch to existing Web engine
│  └─ Node + Playwright + managed Chromium
└─ dispatch to existing exploration engine
   └─ MoonBit
```

## Decisions

- Keep MoonBit as the exploration/property/shrinking/model engine.
- Keep Node + Playwright as the Web/browser execution engine.
- Add a Rust-native `proped` executable as the stable product entry point.
- Do not reimplement Playwright in Rust.
- Do not rewrite the proven MoonBit core in Rust for distribution reasons.
- Existing `scripts/proped.mjs` remains an internal/compatibility entry point during migration.
- User-facing commands should converge on `proped ...`; Node script names become implementation details.

## Initial CLI surface

The first vertical slice must preserve the existing Web dispatcher semantics:

```text
proped web inspect ...
proped web init ...
proped web doctor ...
proped web prepare ...
proped web compile ...
proped web review ...
proped web approve ...
proped web apply ...
proped web run ...
```

The Rust shell must forward argv without a shell, preserve child stdout/stderr, and preserve the child exit code contract.

Product-level commands:

```text
proped --version
proped -V
proped doctor
```

`proped doctor` should expose the product/runtime boundary rather than forcing users to know which internal Node/MoonBit scripts exist.

## Runtime ownership

The Rust shell is the long-term owner of product/runtime concerns that are awkward to expose through raw Node scripts:

- runtime discovery
- Node/NVM/Volta/FNM/asdf inventory
- process lifecycle and process-tree cleanup
- timeout handling
- credential-safe environment construction
- managed cache paths
- Chromium/runtime preparation boundary
- Linux bubblewrap integration
- future macOS/Windows sandbox integration
- artifact root management
- release/update metadata

This first issue does not require migrating every existing Node runtime helper immediately. The first slice should create a stable Rust boundary and move responsibilities only where doing so reduces user-visible coupling.

## Repository layout

Add Rust outside the MoonBit `src/` tree, e.g.:

```text
crates/
  proped-cli/
    Cargo.toml
    src/
      main.rs
```

A root Cargo workspace may be added when useful. MoonBit source remains under `src/` per repository policy.

## CalVer

Adopt the `f4ah6o/calver-action` convention used by the user's other CLI work.

Canonical package version:

```text
YYYY.M.PATCH
```

Examples:

```text
2026.8.0
2026.8.1
```

Rules:

- month is not zero-padded in display/output
- release tags use `vYYYY.M.PATCH`
- package version remains the pure CalVer value; Git SHA is provenance, not part of the package version
- release builds embed the source commit's 7-character Git SHA
- `proped -V` / `proped --version` displays both version and provenance, for example:

```text
proped 2026.8.0 (abcdef0)
```

- non-release/development builds display `(dev)` when no release provenance was embedded
- release automation must use `f4ah6o/calver-action` rather than duplicating CalVer bump/tag logic locally
- tolerate the action's `vYYYY.M.PATCH` tag form while keeping application/package version as `YYYY.M.PATCH`

The existing `moon.mod` SemVer-era `0.35.0` must not remain the user-facing product version once the CalVer migration lands. Version consistency between Rust CLI, machine-readable CLI schema, and MoonBit metadata must be covered by regression tests.

## Distribution UX target

The user-facing target is:

```text
install proped
proped web inspect .
proped web init .
proped web doctor proped.web.json
proped web prepare proped.web.json
proped web run proped.web.json
```

The installed user should not need to know repository-local paths such as `scripts/proped.mjs` or `moon run src/cli` for normal Web onboarding.

Initial distribution work should prepare for:

- GitHub Release native artifacts
- macOS arm64/x86_64 where practical
- Linux x86_64/aarch64 where practical
- Windows x86_64 where practical
- Homebrew as a follow-up once release artifacts are stable

Do not block the first Rust-shell vertical slice on completing every platform packaging target.

## Security requirements

The Rust shell must not weaken the existing unknown-project safety model.

- no shell interpolation for target commands
- no implicit credential forwarding
- no implicit Node/runtime download during normal `run`
- explicit preparation remains separate from strict execution
- preserve fail-closed runtime/manifest diagnostics
- preserve upstream repository read-only expectations
- preserve exit-code semantics so CI cannot silently turn execution errors into passes

## Implementation slices

### Slice 1 — native shell

- [x] add Cargo workspace / `proped-cli`
- [x] implement `proped -V` / `--version`
- [x] implement `proped web ...` forwarding to the existing canonical Web dispatcher
- [x] locate the bundled/development Web runtime deterministically
- [x] preserve argv/stdout/stderr/exit codes
- [x] add Rust unit/integration coverage
- [x] document native CLI as the preferred entry point

### Slice 2 — product doctor

- [x] add `proped doctor`
- [x] report Rust CLI build/version provenance
- [x] report internal Web runtime availability
- [x] report Node and managed Chromium readiness using existing generic discovery rather than duplicating incompatible logic
- [x] machine-readable output suitable for agents/CI

### Slice 3 — CalVer release automation

- [x] migrate product version to `YYYY.M.PATCH`
- [x] integrate `f4ah6o/calver-action`
- [x] embed 7-char source SHA in release artifacts
- [x] keep package version pure CalVer
- [x] add version consistency regression
- [x] build native release artifacts

### Slice 4 — progressively internalize product-shell responsibilities

Move runtime/process/cache/security responsibilities from Node to Rust only when the boundary is clear and behavior can be kept compatible. Do not perform a flag-day rewrite.

## Implementation evidence — 2026-08-12

- Rust CLI unit tests: 4/4 pass.
- `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- Native/Web dispatcher parity covers `inspect`, `doctor`, `run` exit behavior, help, and invalid-command handling.
- MoonBit native tests: 159/159 pass.
- Existing Node `proped web` regression: pass.
- Unknown-Web onboarding acceptance: 6/6 known failure recall, deterministic replay, 10,000 healthy transitions, false positives 0.
- CalVer consistency regression covers Cargo package metadata, Cargo.lock, MoonBit package/CLI metadata, native CLI output, and separate provenance.
- Release workflow pins `f4ah6o/calver-action` by full commit SHA, allocates `YYYY.MM.PATCH` in `Asia/Tokyo`, creates `vYYYY.M.PATCH` immutable tags from a release-only metadata commit, and keeps registry publication disabled.
- Product doctor reports the existing managed Playwright/Chromium readiness and strict-sandbox capability through the shared runtime implementation.
- GitHub Release matrix builds Linux/macOS/Windows native CLI archives with SHA-256 sidecars and rejects release packaging when provenance is still `(dev)`.

## Acceptance

The first implementation milestone is accepted when all of the following hold:

1. `cargo test` for the new Rust CLI passes.
2. `proped -V` reports CalVer-shaped version plus `(dev)` or a 7-char provenance SHA.
3. `proped web inspect ...` produces the same effective output/exit behavior as `node scripts/proped.mjs web inspect ...`.
4. `proped web doctor ...` preserves existing fail-closed diagnostics.
5. `proped web run ...` preserves existing child exit codes.
6. Existing MoonBit tests remain green.
7. Unknown-Web onboarding acceptance remains 6/6 known-failure recall with 10,000 healthy transitions and zero false positives.
8. No Playwright or MoonBit core rewrite is introduced merely for packaging.
9. Release/version workflow is based on `f4ah6o/calver-action` and package/application version is `YYYY.M.PATCH` while `-V` separately exposes Git SHA provenance.
