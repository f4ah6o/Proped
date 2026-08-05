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
