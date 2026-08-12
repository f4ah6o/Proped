# `proped setup` managed runtime bootstrap

Status: open

## Goal

Add an explicit product-level `proped setup` command so a GitHub Release installation can become runnable without requiring users to understand Proped's internal Node/Playwright layout.

The target pre-Homebrew installation flow is:

```text
download + extract Proped release artifact
put `proped` on PATH
proped setup
proped doctor
proped web inspect .
```

`setup` is the only product command allowed to acquire missing managed runtime dependencies. Normal `proped web run` remains offline-by-default with respect to runtime installation and must never silently download Node, npm packages, or Chromium.

## Product boundary

Rust owns the setup orchestration and stable user-facing contract.

```text
proped setup (Rust CLI)
├─ inspect installed Proped runtime
├─ discover compatible existing Node
├─ prepare managed Node when no compatible Node is available
├─ prepare Proped's pinned JS dependencies
├─ prepare pinned Playwright Chromium
├─ verify the prepared runtime by launching/probing it
└─ report deterministic diagnostics
```

The existing Node/Playwright implementation remains the Web execution engine. This issue does not port Playwright or the exploration core to Rust.

## Runtime policy

### Node

Selection order:

1. a compatible Node already available through the existing Proped runtime discovery rules
2. a Proped-managed Node installed by explicit `proped setup`

The command must not modify the user's global Node installation, npm prefix, shell profile, NVM/Volta/FNM/asdf configuration, or project dependencies.

Managed Node must live under a Proped-owned per-user runtime/cache root, not inside the target project and not require root after the Proped release archive itself has been installed.

The supported Node line/version must be pinned by Proped release metadata rather than resolved as an unconstrained `latest` version at setup time.

### JS dependencies

The release archive intentionally does not need to embed `node_modules`.

`proped setup` prepares only Proped's own pinned runtime dependencies from the lockfile shipped in the release artifact. It must not run `npm install` in the user's target project.

Dependency preparation must be deterministic and lockfile-based (`npm ci` or an equivalent pinned operation).

### Chromium

Prepare the Playwright-managed Chromium revision required by the Proped release. Reuse an already valid managed browser when possible.

Readiness must be verified by the same launch-based probe used by `proped doctor`; presence of a guessed executable path alone is not sufficient.

## Commands

Initial surface:

```text
proped setup
proped setup --json
```

Expected behavior:

- idempotent: rerunning setup on a healthy installation performs no destructive reinstall
- explicit: network acquisition occurs only because the user invoked `setup`
- non-interactive by default so it is usable by agents and CI
- shell-free child process execution
- stable non-zero exit code on failure
- human-readable default output and machine-readable JSON output

A successful run should end with a concise readiness summary equivalent to the relevant `proped doctor` runtime checks.

Example human output shape:

```text
Proped 2026.8.0 setup
✓ Node 22.x
✓ Proped JS runtime
✓ Managed Chromium
✓ Runtime probe
Ready
```

Exact wording is not part of the compatibility contract; diagnostic codes and exit behavior are.

## Managed paths

Setup state must be outside target repositories and scoped to the current user.

Use platform-appropriate Proped-owned roots and expose the resolved paths through `proped doctor --json` for debugging. The implementation must not assume `/opt/proped` or `/usr/local` is writable.

Release files under the installed `lib/proped` tree are treated as read-only product inputs. Downloaded runtimes, browser binaries, npm cache/state, and setup metadata belong in the managed user root.

A future Homebrew package should be able to use the same setup state without changing the command contract.

## Integrity and security requirements

- runtime download versions are pinned by the Proped release
- verify downloaded runtime artifacts before execution using an upstream checksum or stronger available integrity metadata
- do not pass credentials from the invoking shell unless already allowed by the existing credential-safe environment policy
- do not use shell interpolation for download/install subprocesses
- do not execute package lifecycle scripts unless required and explicitly justified; prefer the existing `--ignore-scripts` policy where compatible
- no writes to the inspected target project
- no implicit network access from `proped doctor`, `proped web inspect`, `proped web prepare`, or `proped web run`
- setup failure is fail-closed and must not leave a partially prepared runtime reported as healthy
- partial downloads/installations should use staging paths and atomic promotion where practical

## Diagnostics

At minimum provide stable diagnostic codes for:

- unsupported host platform/architecture
- release runtime metadata missing or invalid
- compatible Node not found and managed Node acquisition failed
- runtime checksum/integrity verification failed
- Proped JS dependency preparation failed
- Chromium acquisition failed
- Chromium launch/readiness probe failed
- managed runtime path unavailable/not writable
- final runtime verification failed

`proped setup --json` must include enough structured information for an agent to distinguish discovery, acquisition, preparation, and verification failures without scraping stderr text.

## Relationship with `proped doctor`

`doctor` remains observational and must not repair or download anything.

```text
proped doctor
  -> inspect only

proped setup
  -> explicitly repair/prepare managed product runtime
  -> run the same readiness probes before success
```

This separation preserves the existing prepare-vs-run safety model at the product distribution layer.

## Implementation slices

### Slice 1 — setup contract and managed paths

- [ ] add `proped setup` / `proped setup --json` to the Rust CLI
- [ ] define stable setup result/diagnostic schema
- [ ] resolve per-user managed runtime/cache roots on macOS/Linux/Windows
- [ ] make reruns idempotent
- [ ] expose managed paths/readiness through `proped doctor --json`

### Slice 2 — Node runtime

- [ ] reuse a compatible discovered Node when available
- [ ] define pinned managed-Node release metadata
- [ ] acquire managed Node only from explicit `setup`
- [ ] verify artifact integrity before installation
- [ ] atomically install/reuse managed Node without changing global user configuration
- [ ] cover unsupported platform/architecture and acquisition failures

### Slice 3 — Proped JS runtime + Chromium

- [ ] prepare Proped's own lockfile-pinned JS dependencies without touching the target project
- [ ] preserve the lifecycle-script safety policy
- [ ] install/reuse the release-pinned Playwright Chromium
- [ ] verify browser readiness by actual headless launch
- [ ] keep normal Web execution download-free

### Slice 4 — distribution regression

- [ ] package a native release archive without `node_modules` or Chromium
- [ ] install it into a temporary read-only-style product prefix
- [ ] run `proped setup` using only per-user writable managed paths
- [ ] run `proped doctor --json`
- [ ] run native `proped web inspect` against a temporary unknown Web fixture
- [ ] prove second `proped setup` is idempotent
- [ ] prove `doctor` and `run` do not perform implicit runtime downloads
- [ ] cover macOS/Linux in CI and keep Windows behavior covered where hosted CI permits

## Acceptance

The issue is complete when:

1. A GitHub Release installation can be prepared with `proped setup` without users manually entering `lib/proped` or running npm/npx commands.
2. A compatible existing Node is reused; otherwise setup can prepare a pinned Proped-managed Node without changing global Node configuration.
3. Proped-owned JS dependencies and Playwright Chromium are prepared outside the target project.
4. Downloads happen only during explicit `proped setup`.
5. `proped doctor` remains read-only and reports the same runtime as healthy after setup.
6. The installed release prefix may be read-only after extraction; setup needs only a user-writable managed root.
7. Setup is idempotent and a healthy second run does not reinstall runtimes unnecessarily.
8. Integrity failures and partial installations fail closed with stable machine-readable diagnostics.
9. Existing native CLI, MoonBit, unknown-Web onboarding, and privacy/safety regressions remain green.
10. The future Homebrew flow can become `brew install proped && proped setup` without changing the setup contract.
