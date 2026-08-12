# Blind Web onboarding: moonbitlang/website

Status: closed

## Goal

Validate the unknown-project Web onboarding path against a third-party repository that had not been part of Proped-Rabbita's tracked Web dogfood corpus, without writing a project-specific executable adapter.

Target:

- repository: `moonbitlang/website`
- revision: `a6222f7292ce50f2a08847ef0852b1a8d456a393`
- license: Apache-2.0
- upstream writes: none
- project-specific executable Proped code: **0 LOC**
- human semantic contract: none

The target was selected from an existing ignored clone. Before the first Proped inspection, the tracked Proped repository contained no `moonbit-website` reference. The first classification was performed through `proped web inspect`; source inspection was not used to hand-author an adapter.

## Blind root result

Initial read-only inspection correctly inferred:

- pnpm
- `pnpm install --frozen-lockfile`
- `pnpm run build`
- `pnpm run serve`
- localStorage and service-worker hints

But it classified the Docusaurus root as plain React and left project mode/output/routing unknown. The blind run also exposed that the inferred install command was not connected to an explicit preparation workflow: `web run` attempted the build with dependencies absent, and `web doctor` did not report the missing preparation.

### General fixes from the root attempt

1. Added Docusaurus as a first-class inspection signal:
   - framework: `docusaurus`
   - mode: `static-export`
   - default output: `build`
   - routing: `docusaurus-client-router`
   - React remains a compatible subordinate signal.
2. Added explicit `proped web prepare`:
   - `web run` never installs dependencies implicitly.
   - unprepared runs fail early with `prepare_required`.
   - install argv runs with `shell=false` and project-root cwd.
   - credential-bearing environment variables are removed by the execution allowlist.
   - network use is explicit to the preparation phase; `--offline` is supported.
3. Added dependency readiness to `web doctor`.
4. Hardened install-completion detection:
   - pnpm requires `node_modules/.modules.yaml` rather than mere `node_modules` presence.
   - npm uses `node_modules/.package-lock.json`.
   - yarn uses PnP/state/integrity markers.
   This was necessary because a failed offline pnpm install created a partial `node_modules/.pnpm` tree that must not be treated as ready.

The root offline preparation could not complete in the Local MCP environment because the pnpm store lacked `@docusaurus/core@3.8.1` and Local MCP execution has network disabled. This is recorded as an environment limitation rather than a target failure.

After the fix, the same root is classified as:

- framework: `docusaurus`
- mode: `static-export`
- output: `build`
- routing: `docusaurus-client-router`

## Blind runnable subproject

The root build attempt had successfully prepared/built the repository's nested `src/pages/rabbita-home` Vite application before the missing root dependency stopped the Docusaurus build. This nested app was then used as the real-browser blind-validation target, still at the same pinned upstream revision and without project-specific Proped executable code.

Read-only inspection inferred:

- framework: Vite
- mode: SPA
- output: `dist`
- package manager: pnpm
- WebSocket hint: detected
- no auth / IndexedDB assumption

`web doctor` then confirmed:

- pnpm install completion marker present
- static output ready
- managed Chromium ready
- manifest v2 -> v1 compilation pass
- only warning: strict filesystem/network sandbox currently requires Linux bubblewrap; the macOS local run therefore used explicit caller-enforced mode.

## Generic Browser findings and fixes

### Storage access must fail closed

The first real-browser run reached Generic Browser Mode but failed on a document where the `localStorage` getter raised `SecurityError`. The snapshot helper passed `localStorage` as an argument, so the getter was evaluated before its `try/catch`.

Fix:

- obtain `window.localStorage` / `window.sessionStorage` inside the guarded helper;
- inaccessible storage becomes an empty semantic map instead of aborting the campaign;
- add an opaque/data-document regression test.

### Link locator fidelity

The first successful inventory had:

- descriptor count: 172
- actionable targets: 24
- unique locator targets: 13
- ambiguous locator targets: 11
- locator uniqueness: **54.2%**

The dominant cause was a difference between raw anchor `textContent` used by the generic descriptor and Playwright's accessible-name computation. The action could be semantically identified, but role/name lookup returned zero elements.

General fix:

- include raw link `href` as a secondary stable target identity;
- use role/name first and a unique `href` locator as fallback;
- include `href` consistently in action identity, coverage novelty, state novelty, and selector-survival contracts;
- if the same `name + href` remains duplicated, keep the action fail-closed rather than forcing a click.

After the fix on the same blind app:

- actionable targets: 24
- unique locator targets: 24
- ambiguous locator targets: 0
- locator uniqueness: **100%**
- recovered through href fallback: 11 links in the direct inventory probe
- one genuinely duplicated `name + href` action remained an action-level ambiguity and was excluded, as intended.

A framework-neutral synthetic regression now covers both unique-href recovery and duplicate-href fail-closed behavior.

## Bounded real-browser campaign

A bounded smoke was used to keep the Local MCP call below its transport timeout:

- build stage reused the already-built static output
- volatility probe runs: 0
- replay attempts: 1
- max states: 8
- max transitions: 8
- max depth: 2

These are operational test bounds only; no application-specific executable adapter or semantic rule was added.

Final run:

- Generic Browser stage: pass
- descriptor count: 172
- actionable targets: 24
- locator uniqueness: **100%**
- safe actions: 24
- browser-safety property probes: 12
- stable failures: 0
- exploration states: 6
- exploration transitions: 8
- executed action signatures: 8
- exploration failures: 0
- exploration diagnostics: 0

The campaign exercised both MoonBit feature buttons and outbound links using the generic action inventory.

One discovered link was unique but could not be clicked because another rendered element intercepted pointer events. It remains a `generic_action_execution_diagnostic` advisory. Proped intentionally does not use `force: true` or DOM `.click()` to turn this into a synthetic success, because doing so would stop representing user-operable interaction.

## What this validates

This blind run demonstrates that the current onboarding path can reach meaningful real-browser exploration on a previously unused third-party project with:

- project-specific executable adapter LOC: **0**
- project-specific property LOC: **0**
- project-specific projection/normalizer LOC: **0**
- managed browser dependency in target project: not required
- action inventory generated from the live application
- bounded state exploration generated automatically

It also produced several reusable framework-neutral fixes before the successful run, which is exactly the purpose of blind validation.

## Remaining product gaps

- Docusaurus is now recognized, but other meta-framework/static-site families still need blind coverage.
- Existing static output is detected by doctor, while the canonical generated manifest still retains its build command; run policy can later offer an explicit reusable-output mode without mutating the manifest manually.
- Pointer-intercepted but semantically unique actions are advisories; future work can classify whether the obstruction is persistent layout state or transient animation without using forced clicks.
- Strict sandbox validation still needs Linux/bubblewrap for a true OS-enforced blind campaign.
- A future blind target should include CRUD/persistence/auth/server state so that generic property generation is exercised beyond a mostly navigational/static application.

## Acceptance

- [x] target not present in the tracked prior Web dogfood corpus
- [x] exact upstream revision pinned
- [x] no upstream issue/PR/comment/write
- [x] read-only inspection before adapter work
- [x] project-specific executable adapter remains 0 LOC
- [x] root onboarding gaps converted into generic fixes
- [x] real third-party browser campaign reaches pass/fail evaluation
- [x] generic action inventory exercised
- [x] coverage-guided exploration exercised
- [x] locator uniqueness improved from 54.2% to 100% on the blind app
- [x] ambiguous duplicate action remains fail-closed
- [x] storage-denied snapshot path covered by regression
