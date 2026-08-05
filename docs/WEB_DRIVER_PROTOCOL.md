# Web UI driver protocol v1

## Decision

Proped core remains the source of truth. Web runtimes connect through versioned JSON Lines. One driver process owns one isolated session; `reset` creates a fresh fixture and `dispose` destroys it.

## Request envelope

```json
{"protocolVersion":"1.0","id":1,"method":"reset","params":{"seed":1,"fixture":"react-form"}}
```

Every response echoes `id` and contains either `result` or `error`. Unknown fields and protocol versions fail closed.

## Lifecycle

1. `hello` negotiates protocol and capabilities.
2. `reset` creates an isolated session and returns a snapshot.
3. `actions` returns only currently valid semantic actions.
4. `execute` applies one action and returns snapshot, settle result, and emitted effects.
5. `replay` resets the fixture and verifies a complete trace.
6. `dispose` releases timers, browser contexts, servers, and storage.

## Stable action identity

Action identity is separate from its human label. CSS selectors, DOM addresses, translated copy, framework IDs, and list indexes are not sufficient identities. The canonical form is composed from kind, role, accessible name, ancestor scope, stable test identity when necessary, and normalized input. Ambiguous actions are not executed and become diagnostics.

## Snapshot and fingerprint

Exploration fingerprints URL, normalized semantic DOM, forms, focus, relevant storage, pending effects, and optional application-state hash. Full DOM and accessibility trees are retained only for initial, failure, collision, and debug states. Timestamps, random tokens, build hashes, request IDs, animation progress, and framework-generated unstable IDs are normalized out.

## Settle contract

`execute` completes only after the configured settle policy reports `settled`, `timeout`, `cycle`, or `unsupported`. Component drivers drain framework updates and bounded microtasks/fake timers. Browser drivers wait for explicit application readiness; network idle alone is not a valid universal settle condition.

## Replay and failure signature

Replay always starts from a fresh fixture. A minimized trace is accepted only when protocol version, fixture, property name, failure class, and semantic snapshot hash match. Runtime versions, seed, bounds, corpus, normalizer version, and driver capabilities are recorded.

## Safety

Network is denied by default. External repositories are read-only. Mail, payment, cloud mutation, filesystem writes, native bridges, and credentials are unsupported effects unless replaced by deterministic descriptors. Browser sessions use ephemeral profiles and isolated storage.


## Production module

The executable protocol implementation lives in `protocol/ui-driver-v1.mjs` and `protocol/jsonl-server.mjs`. The server rejects unknown fields, unsupported versions, duplicate request IDs, non-negotiated calls, disposed-session calls, and bounded-operation timeouts. Error responses use stable machine-readable codes.

The bounded fixture host is `scripts/web_driver_protocol_host.mjs`. It models network work as descriptors and explicitly reports real network, filesystem writes, mail, payment, cloud mutation, and native bridges as unsupported effects. `scripts/test_web_driver_protocol.mjs` validates negotiation, malformed requests, replay signatures, timeout mapping, disposal, shutdown, and real JSONL child-process transport.

## Native core host

`scripts/web_native_jsonl_host.mjs` keeps JSONL, timeout, cleanup, and error mapping in Node while delegating bounded exploration and fresh-fixture replay to `src/web_native_host`, which uses the existing MoonBit Proped core. Driver-owned DOM action execution remains outside the native host; unsupported `execute` calls fail closed.

## DOM semantic snapshot v1

`protocol/dom-semantic-snapshot.mjs` normalizes framework-generated IDs, timestamps, random tokens, attribute order, form values, focus identity, relevant storage, pending effect descriptors, and optional application state. The fingerprint includes semantic state but excludes unstable request IDs and build/runtime noise. Full DOM is represented as a normalized semantic tree rather than a framework-private Fiber or VNode graph.

When two observations claim the same fingerprint but differ in semantic DOM, form, focus, storage, pending work, or application state, `compareSnapshotIdentity` emits `state_identity_collision` evidence. Screenshot pixels, layout geometry, animation progress, cross-origin frame contents, and closed shadow roots are unsupported inputs and must be handled by a browser-specific diagnostic.

## Accessible action discovery

Drivers provide semantic element records rather than CSS selectors. The v1 discovery layer supports button/link clicks, checkbox state changes, radio/combobox/listbox selection, textbox/searchbox/spinbutton clear and bounded typing, form submit, and dialog confirm/cancel/close. Stable action IDs combine kind, role, accessible name, ancestor scope, optional stable test identity, and normalized input. Hidden or disabled elements are excluded. Duplicate identities are not executed and are emitted as `ambiguous_action` diagnostics.


## Generic Web property pack

`protocol/web-property-pack.mjs` evaluates stale responses, duplicate submits, pending-effect leaks, focus integrity, entity consistency, hydration warnings, unhandled runtime failures, and deterministic replay. Each property has an error/warning/off policy and produces a replayable failure signature. Framework adapters supply normalized snapshots; the pack does not read React Fiber, Vue VNodes, or other private runtime state.

## React Component Mode

`web/react-component/` mounts a real React 19 component into an isolated JSDOM document. The adapter discovers actions from role, accessible name, label, and form scope; executes native DOM input, click, and submit events inside React `act`; and records semantic snapshots after bounded microtask settling. Network and submit completion are deterministic injected effect descriptors. No real network or external write is performed.

The committed fixture explores 10,000 transitions and retains three signatures: stale search response in three actions, duplicate submit in two actions, and invalid numeric input destroying the previous result in one action. Generated `atlas.html`, `atlas.json`, `atlas.svg`, `atlas.dot`, and `summary.json` are written below the ignored `web/react-component/out/` directory.

## Vue Component Mode

`web/vue-component/` mounts a real Vue 3.5 component with a fresh Pinia store into an isolated JSDOM document. The adapter settles through bounded `nextTick` and microtask drains, observes a resolved Suspense boundary, includes Teleport output in the semantic snapshot, and verifies Pinia-backed form state. Network and submit completion remain deterministic effect descriptors; no external mutation is performed.

The committed fixture explores 10,000 transitions and retains the same cross-framework signatures as React Component Mode: stale search response, duplicate submit, and invalid numeric input destroying the previous result. Generated Atlas artifacts are written below the ignored `web/vue-component/out/` directory.

## Network and timer schedule exploration

`protocol/network-timer-schedule.mjs` provides a framework-neutral virtual effect runtime. Real network calls and wall-clock timers fail closed with `unsupported_effect`; adapters instead expose deterministic request, abort, failure, response-delivery, virtual-clock advance, and timer-fire descriptors. Request generations, retry attempts, callback counts, timer ownership, and pending effects are included in the semantic fingerprint.

The bounded explorer replays each candidate from a fresh fixture, deduplicates semantic states, and deletion-shrinks failures while retaining the protocol v1 failure signature. The committed fixture explores all 580 transitions and 377 states reachable within depth six, records that the depth frontier was reached, and confirms that the 2,000-transition safety cap was not reached. It retains minimal traces for stale-response commit, response commit after abort, retry-budget overflow caused by duplicate timers, and duplicate completion callback invocation. Generated `summary.json`, `atlas.json`, `atlas.html`, `atlas.svg`, and `atlas.dot` are written below the ignored `protocol/out/network-timer-schedule/` directory.

## Playwright Browser Mode

`web/playwright-browser/` launches Playwright-managed Chromium with a fresh non-persistent Browser Context for every reset. The only allowed navigation is `http://fixture.local/browser-mode`, which is fulfilled from an in-memory HTML fixture. All other HTTP(S) requests are aborted before network access; service workers are blocked, permissions are empty, downloads are disabled, and WebSocket routes are closed when the installed Playwright runtime exposes that interception API.

The driver resolves actions by role, accessible name, and ancestor scope, then records normalized DOM, form values, focus, local/session storage, pending effects, console/page errors, and route decisions. Settle waits for the fixture's explicit readiness and pending-task counters rather than `networkidle`. Replay closes the previous context and starts from empty storage and a new context. The committed bounded fixture executes 128 transitions across 17 semantic states, records one denied external fetch, and retains the same stale-response, duplicate-submit, and invalid-number-input failures as Component Mode. Generated Atlas artifacts are written below the ignored `web/playwright-browser/out/` directory.
## Component Mode to Browser Mode replay

`protocol/cross-mode-replay.mjs` translates stable Component Mode action IDs into currently available Browser Mode actions. Exact IDs are preferred. A scope difference may be relaxed only when kind, role, accessible name, input, test identity, and effect attributes match and exactly one Browser action remains. Missing or ambiguous mappings fail closed and are emitted as machine-readable diagnostics. CSS selectors, DOM indexes, and framework-private identities are never used as fallback locators.

Replay requires matching protocol, snapshot normalizer, action identity, and fixture-contract versions. Each accepted trace is executed twice from a fresh Playwright Browser Context; the property, failure class, translated trace, final semantic snapshot hash, and target failure signature must remain deterministic. Source and target signatures are both retained because runtime-specific DOM structure can legitimately produce different snapshot hashes while preserving the same failure class. External network, filesystem, mail, payment, cloud mutation, credentials, native bridges, and unmodeled effects remain denied or descriptor-only.

The committed fixture replays three React Component Mode failures and three Vue Component Mode failures into Chromium. Search actions require a unique `target-scope-omitted` translation because the Browser fixture exposes the same searchbox without a form scope; submit, injected response, and numeric-input actions map exactly. Generated cross-mode HTML/JSON/SVG/DOT artifacts are written below the ignored `protocol/out/cross-mode-replay/` directory.

## Next.js SSR and hydration adapter

`web/next-ssr-hydration/` builds and runs an actual Next.js 16.3 production server with one App Router fixture and one Pages Router fixture. For each router, the adapter fetches the server-rendered HTML before navigation, starts a fresh Playwright Browser Context, waits for an explicit `data-ready` marker, and compares the server label with the hydrated DOM. Build IDs and injected Next runtime scripts are excluded from the committed identity; the stable server hash contains only the fixture's semantic label and metadata.

The stable cases must hydrate without a warning. The mismatch cases deliberately render different server and client labels and are classified from development hydration messages or production React error `#418`. Each mismatch is replayed twice from a fresh context and must retain the same `hydration_warning` failure signature and semantic snapshot hash. Local and session storage, form/action state, console entries, page errors, and route decisions are reset between cases.

The App Router fixture invokes a real Server Action whose result is a deterministic descriptor with `externalMutation: false`. The Pages Router fixture records Server Actions as `unsupported_effect` rather than substituting an API route. Browser traffic is limited to the loopback fixture origin; an explicit external fetch is aborted before network access, service workers are blocked, permissions are empty, and downloads are disabled. Generated Atlas artifacts are written below the ignored `web/next-ssr-hydration/out/` directory.
