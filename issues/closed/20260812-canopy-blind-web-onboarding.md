# Blind Web onboarding: dowdiness/canopy

## Target

- Repository: `https://github.com/dowdiness/canopy.git`
- Revision: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- Project: `apps/web` (`lambda-crdt-editor`)
- Upstream writes/issues/PRs/comments: none
- Project-specific executable adapter code: 0 LOC

## Goal

Use a previously unused server-state/persistence-heavy Web target to test how far unknown-project onboarding gets from read-only inspection before any project-specific integration.

## Blind inspection result

Proped classified the project without running install/build/start scripts:

- framework: `react-vite`
- package manager: `npm`
- Node requirement: `^24.0.0 || ^22.15.0`
- output: `dist`
- state sources: DOM, forms, URL, localStorage, sessionStorage, IndexedDB
- WebSocket: detected
- server framework: `hono`
- relative API call sites: 5
- server route syntax: detected
- authentication dependency signal: none

This exposed a useful distinction: the browser surface looks like a static Vite SPA, but the repository contains server-side/API state signals that should remain visible to later semantic review rather than being lost during onboarding.

## Environment finding

The available runtime is Node `v25.7.0`, which does not satisfy the target's declared `^24.0.0 || ^22.15.0` range. An earlier offline install attempt also showed that the local npm cache was incomplete, but dependency availability is secondary: the Node runtime is already incompatible.

Blind validation therefore produced a generic onboarding improvement instead of bypassing the target constraint.

## Generic improvements

1. Manifest v2 now carries `project.nodeRequirement` from `package.json#engines.node`.
2. A conservative Node engine evaluator handles common caret/tilde/comparator/wildcard ranges; unsupported syntax returns `unknown` instead of guessing.
3. `web doctor` reports incompatible Node engines as a failure.
4. `web prepare` and `web run` reject provably incompatible Node engines before install/build execution.
5. Read-only inspection now reports server framework, server persistence dependency, relative API-call count, and server-route syntax signals.

## Real-target verification

With the generated manifest:

- `web doctor`: `node-engine` = fail (`v25.7.0` does not satisfy target range)
- `web prepare`: exit 2 / `node_engine_incompatible`
- `web run`: exit 2 / `node_engine_incompatible`
- `node_modules` after both commands: absent

So incompatible projects now fail before package-manager mutation instead of producing a later, noisier install/build failure.

## Acceptance

- [x] unknown target inspected with 0 LOC project-specific executable adapter
- [x] local/session storage, IndexedDB, WebSocket discovered
- [x] Hono/server/API signals discovered
- [x] Node requirement propagated into manifest v2
- [x] doctor catches incompatible runtime
- [x] prepare/run fail before dependency installation
- [x] engine and inspection behavior covered by regression tests
