# Exact package-manager runtime selection for unknown Web projects

Status: closed

## Goal

Honor a target project's exact `packageManager` declaration without silently using a different host npm/pnpm/Yarn version and without allowing package-manager downloads during normal Web campaigns.

## Implemented

- Preserve the full `packageManager` reference (including Corepack integrity suffix) and exact semantic version in read-only inspection.
- Carry `project.packageManagerReference` in manifest v2 as a backward-compatible optional field.
- Generate Corepack argv for exact npm/pnpm/Yarn declarations.
- Keep Yarn 1 install semantics on `--frozen-lockfile`; Yarn 2+ uses `--immutable`.
- Treat non-exact npm/pnpm/Yarn `packageManager` declarations as critical inference ambiguity instead of guessing a version.
- `web doctor` probes Corepack with network disabled: cached manager => pass, uncached manager => pending/prepare-required, missing/broken runtime => fail.
- `web run` fails with `package_manager_prepare_required` before build/preview when the declared manager is not cached.
- `web prepare` is the only phase allowed to enable Corepack network acquisition; `--offline` keeps it denied.
- Normal run/build/preview preserve `COREPACK_ENABLE_NETWORK=0`.
- Preserve `COREPACK_HOME` explicitly so strict sandbox changes to `HOME=/tmp` do not hide the prepared manager cache.
- bun remains direct-executable in this slice.

## Real evidence

Pinned `moonbitlang/website` declares `pnpm@9.15.0+sha512...`. Generic inspection now preserves that reference and generates `corepack pnpm` install/build/serve argv. On the current host the exact pnpm is not cached, so `web doctor` reports package-manager pending with network disabled instead of silently running host pnpm 10.29.3.

## Validation

- Synthetic pnpm integrity reference and npm exact reference generate Corepack argv.
- Yarn Classic uses `--frozen-lockfile`.
- Unpinned pnpm is a critical inference ambiguity and cannot compile.
- Runtime test proves uncached fail-closed, cached ready, run preflight, explicit prepare network policy, and strict-sandbox Corepack cache-path preservation.
