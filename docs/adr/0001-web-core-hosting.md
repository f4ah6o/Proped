# ADR 0001: Host Web drivers behind native JSON Lines

- Status: accepted
- Date: 2026-08-05

## Context

React, Vue, Playwright, Next.js, and Nuxt expose asynchronous runtimes, while Proped Rabbita already owns deterministic exploration, shrinking, collision diagnostics, and report generation. Reimplementing this core in TypeScript would create semantic drift. Compiling the core to JavaScript keeps one process but couples lifecycle, abort, dependency, and framework failures to the explorer.

## Spike

`spikes/web-driver/parity.mjs` runs the same synthetic asynchronous fault through a direct driver and through a JSONL child-process driver. It compares discovered states, transitions, retained property, minimized trace, and semantic hash. The fixture intentionally accepts a stale search response after a newer response. Both modes reduce it to `type:a -> type:ab -> deliver:1`.

## Decision

Use the MoonBit native core as source of truth and connect Node drivers through protocol v1 JSON Lines. A driver process owns one isolated session. Component mode performs bounded discovery; browser mode primarily replays minimized traces and performs narrowly bounded browser-specific exploration.

## Consequences

- React/Vue/Playwright dependencies do not enter MoonBit packages.
- Process timeout and termination provide a hard safety boundary.
- Protocol serialization has overhead, but component snapshots are compact and browser exploration is replay-oriented.
- A future in-process MoonBit JS host remains possible only if it passes the same parity suite.
- TypeScript core reimplementation is rejected.
