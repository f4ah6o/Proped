# Installed Node runtime selection for unknown Web projects

Status: closed

## Problem

Blind server-state onboarding exposed a gap: a project can declare an `engines.node` range that excludes the Node version currently running Proped even though a compatible Node runtime is already installed on the host. Treating only `process.version` as available unnecessarily blocks `doctor`, `prepare`, and `run`.

## Implementation

- Added read-only Node runtime inventory for the current executable plus common NVM, Volta, FNM, and asdf layouts.
- Reuses the existing conservative Node-engine evaluator; unsupported range syntax is not guessed.
- Selects the highest installed compatible runtime, preferring the current runtime when it already satisfies the range.
- Prepends only the selected runtime bin directory to the credential-filtered PATH used by target install/build/server subprocesses.
- Keeps the Proped process and Proped-managed Chromium on the existing Proped-owned runtime.
- Never downloads or installs Node automatically; absence of a compatible installed runtime remains fail-closed as `node_runtime_required`.
- `web doctor`, `web prepare`, and `web run` expose the runtime selection metadata.

## Blind evidence: dowdiness/canopy

Pinned revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`

Canopy declares `^24.0.0 || ^22.15.0`. Proped itself was running on Node 25.7.0, while NVM already contained Node 22.22.3. The new resolver selected Node 22.22.3 automatically. `web doctor` changed from an engine failure to a pass. Offline `web prepare` reached `npm ci` under the selected runtime and failed only because the Zod tarball was not present in the local npm cache. No partial `node_modules` remained. `web run` then returned `prepare_required`, proving the Node mismatch was no longer the blocking condition.

## Validation

- `node scripts/test_web_node_runtime.mjs`
- `node scripts/test_web_project_prepare.mjs`
- `node scripts/test_web_project_runner.mjs`
- Canopy live doctor/runtime probe selected NVM Node 22.22.3.
- Canopy offline prepare reported the selected runtime and failed only with npm `ENOTCACHED`.
- Canopy run preflight reported `prepare_required`.
