# First-class Waku full-stack onboarding

## Trigger

Blind onboarding of pinned `dowdiness/canopy` (`cb41945b04801084e8abe1d8edc27eb0cdce4a1c`) exposed a lifecycle classification error. `apps/web` depends on React, Vite, Waku, and Hono. The previous framework ranking selected `react-vite`, inferred `spa`, and therefore generated a `static-output` manifest. That would omit the server/API lifecycle discovered in the same repository.

## Generic fix

- detect dependency `waku` as a first-class framework signal
- rank Waku above its React/Vite implementation dependencies
- treat React as a subordinate signal when Waku is primary
- infer Waku as `server-rendered` with no guessed static output directory
- infer routing as `waku-router`
- prefer the existing server-rendered lifecycle command order, so a project with `preview` generates a managed command server

No Waku output directory is guessed. The browser runner receives the target's explicit preview/start command.

## Canopy result

Read-only inspection now reports:

- framework: `waku`
- mode: `server-rendered`
- routing: `waku-router`
- server framework signal: `hono`
- serve command source: `scripts.preview`

Generated manifest v2 now contains:

```text
server.mode = command
server.start = [npm, run, preview]
properties = browser-safety, navigation, reload-persistence
```

Compilation produces the normal build stage plus Generic Browser stage with `--server-mode command` and the serialized preview argv.

The target cannot be executed in the current host because its Node engine excludes Node 25; the separate engine preflight stops before install/build/server execution.

## Acceptance

- [x] synthetic Waku fixture classified as Waku, not React/Vite
- [x] server-rendered lifecycle inferred without output-dir guessing
- [x] preview command selected as managed command server
- [x] Waku router signal retained
- [x] real Canopy classification verified
- [x] existing Next/Nuxt/Vite/TodoMVC/drawDB classification regressions remain green
