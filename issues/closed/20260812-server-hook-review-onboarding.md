# Review-only server-hook onboarding

## Goal

Reduce unknown server-state project setup without guessing or automatically enabling mutation-capable endpoints. Convert evidence already visible in source into review-only `server.hooks` candidates that enter the manifest only after explicit human approval.

## Contract

- literal same-origin `GET` / `HEAD` fetch or server-route evidence may produce a read-only candidate
- client fetch + server route corroboration raises confidence
- dynamic/template paths are rejected
- ordinary POST/PUT/PATCH/DELETE mutation endpoints are not proposed
- only explicitly reset-like POST paths may produce a reset candidate
- reset candidates are `semanticRisk: high` and require explicit risk acknowledgement
- all candidates remain `review-only` with `automaticActivation: false`
- approved read-only hooks merge by stable id; conflicting ids are rejected
- at most one non-conflicting reset hook can be applied

## Implementation

- `protocol/web-server-hook-candidates.mjs`
- `scripts/test_web_server_hook_candidates.mjs`
- semantic review report adds `server-hook` candidates and counts
- semantic approval compiles approved server hooks as human-approved hints
- approved-hint validation checks hook shape through the existing server-hook validator
- `withApprovedWebSemantics()` merges approved hooks into manifest v2 `server.hooks`

## Synthetic acceptance

The committed fixture contains:

- GET `/api/items`
- HEAD `/api/health`
- POST `/api/reset`
- POST `/api/delete`
- a dynamic template path

Expected result:

- 2 read-only candidates
- 1 reset candidate
- `/api/delete` omitted
- dynamic path omitted
- reset approval fails without explicit risk acknowledgement
- approved read-only hook is written into manifest `server.hooks.readOnly`

## Real Canopy dogfood

Target:

- `https://github.com/dowdiness/canopy.git`
- revision `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- project `apps/web`

`proped web review` produced 13 semantic candidates total and exactly one server-hook candidate:

- ref: `server-hook:read-only-api-pi-resume-chat-status-905878dd`
- method/path: `GET /api/pi-resume-chat/status`
- confidence: `0.85`
- semantic risk: `low`
- automatic activation: `false`

Approving only this candidate produced:

- approved count: 1
- pending count: 12
- `server.hooks.readOnly`: exactly `GET /api/pi-resume-chat/status`
- `server.hooks.reset`: `null`
- automatic activation: `false`

No upstream issue/PR/comment/write was created.
