# Add content-blind opaque Web exploration and portable minimal replay export

Status: closed
Created: 2026-08-18
Updated: 2026-08-18
Priority: P0

Related:
- `issues/closed/20260816-checkpoint-aware-stateful-exploration.md`
- `issues/closed/20260816-web-finding-groups-and-one-minimal-replay.md`
- Madobe: `issues/open/20260818-proped-content-blind-web-oracle-replay.md`

## Context

Proped already provides Generic Playwright Browser exploration, deterministic replay, checkpoint-aware stateful exploration, finding identity, and bounded 1-minimal replay.

A new consumer needs a stricter privacy mode for unknown/private Web applications where the explorer must discover and minimize executable UI paths without ever exporting content-bearing browser observations.

The motivating integration is a Web-runtime compatibility oracle: explore an application in a reference browser, then replay the same opaque action sequence in another runtime and compare only structural transition outcomes.

This must remain a generic Proped capability. Do not add game-, Madobe-, product-id-, save-, story-, or private-application-specific behavior to the driver/protocol.

## Goal

Add an opt-in content-blind exploration projection that can:

1. explore an already-running local Web application with Playwright;
2. enumerate a small portable structural action vocabulary;
3. perform the existing stateful/coverage-guided exploration and replay semantics without semantic content export;
4. produce a deterministic bounded/minimal `OpaqueWebReplayV1` suitable for replay by a different runtime;
5. optionally execute the same replay under both Chromium and Playwright WebKit.

The result should answer only structural questions such as:

```text
opaque action sequence A0,A3,A1 reaches a changed state in Chromium
same sequence is deterministic across fresh Chromium contexts
same sequence changes / does not change in Playwright WebKit
```

It must not reveal what the page says or what the action means.

## Preserve existing Proped architecture

Do not build a separate exploration engine.

Reuse:

- `web/playwright-browser/generic-browser-driver.mjs`
- existing managed Playwright runtime
- `protocol/web-coverage-guided-exploration.mjs`
- checkpoint/environment capability from `protocol/environment-checkpoints.mjs`
- `protocol/web-exploration-replay-gate.mjs`
- existing bounded replay/minimization machinery where its identity predicate fits

The new work is primarily:

- an observation/action projection policy;
- a portable replay export;
- optional browser-engine selection;
- privacy regression coverage.

## Content-blind policy

Introduce an explicit versioned profile, conceptually `content-blind-opaque-v1`.

When enabled, exported/persisted evidence MUST NOT contain:

- DOM text / textContent / innerHTML;
- input values;
- accessible names / accessibility tree text;
- screenshot / video / trace snapshot content;
- image/canvas/pixel readback;
- semantic CSS/XPath selectors;
- page title;
- raw URL / query / fragment;
- raw console/error/exception message;
- raw stack/source text;
- browser storage values;
- project/application source snippets.

Do not merely redact these fields after a full semantic snapshot is persisted. The content-blind projection must prevent them from entering the durable exploration/replay artifact in the first place.

Internal browser execution may use DOM APIs required for structural enumeration, but semantic values must not be returned to the Node/agent evidence boundary.

## Portable action contract

P0 exports a deliberately small cross-runtime vocabulary.

```text
OpaqueWebReplayV1
  version
  candidateOrderVersion
  browserEngine
  steps[]
    kind: dom_activate | pointer_point
    ordinal: bounded integer
    expectedTransition: changed | unchanged | terminal | not_observed
  minimality
```

The exact field spelling may follow Proped conventions, but semantics must remain compatible with the consumer fixture.

### Action identity rules

- exported identity is fixed `kind + ordinal`, not Playwright locator text;
- ordinal comes from a deterministic content-blind candidate enumeration contract;
- no selector, text, label, href or accessible name may appear in the exported action;
- action count is bounded;
- candidate ordering is versioned;
- if the page cannot be represented by the P0 vocabulary, report unsupported/inconclusive rather than exporting a semantic locator.

P0 should not expand to `fill`, text entry, keyboard semantics, drag/drop, file upload, etc. unless required by a separate issue. The initial purpose is deterministic activation/pointer path discovery for Web compatibility.

## Candidate ordering v1

Define and fixture-test a portable structural ordering equivalent to the consumer runtime:

- structurally activatable elements in deterministic document order;
- fixed bounded pointer points under a deterministic geometry policy;
- no text/label/accessibility semantics used for ordering;
- deterministic caps;
- a version bump for any compatibility-breaking enumeration change.

The implementation may use Playwright/page evaluation internally, but the output is only action kind + ordinal.

## Opaque state identity

Proped still needs state novelty/deduplication for exploration.

For the content-blind profile:

- use an opaque deterministic state projection containing only approved structural features;
- never include text, values, screenshot/pixel hashes, raw URLs or semantic names;
- checkpoint/environment identity remains opaque as already designed;
- state identity may be run/producer-local and does not need to be portable to another browser runtime;
- the portable replay contract relies on action sequence and expected transition classes, not cross-engine equality of state hashes.

Prefer fail-closed non-merge when equivalence cannot be established safely.

## Browser engines

Current Generic Browser is Chromium-oriented. Add engine selection only at the generic browser boundary, with Chromium remaining the default/backward-compatible path.

P0 target:

- `chromium`;
- `webkit` when installed/available.

Requirements:

- existing Chromium campaign semantics stay unchanged when content-blind mode is off;
- engine identity is explicit in the opaque result;
- managed runtime/prerequisite failure is explicit;
- no claim that Playwright WebKit equals macOS WKWebView.

The purpose of WebKit execution is comparative classification, not platform equivalence proof.

## Minimal replay semantics

For compatibility-path export, minimize a deterministic transition trace rather than only browser exception findings.

A candidate deletion is acceptable only when fresh replay still reproduces the required opaque transition predicate and reaches the same target structural condition under the content-blind profile.

Do not weaken the existing finding-group minimality contract. If the existing shrinker cannot express this transition predicate cleanly, add a separate versioned opaque-path minimization contract rather than overloading `findingGroupId`.

Budget exhaustion must be explicit and must not be reported as one-minimal.

## Already-running URL mode

Support a simple developer/oracle path for an already-running local application.

Conceptually:

```text
proped web explore-url <loopback-url> --profile content-blind-opaque-v1 --engine chromium
```

Final CLI spelling may follow existing command architecture.

Constraints:

- do not require project onboarding/prepare when the caller already owns the server lifecycle;
- accept loopback HTTP(S) only for the strict P0 oracle mode unless a broader security decision is made;
- do not persist the raw URL in the privacy-safe result;
- preserve fresh-context replay and cleanup;
- no shell execution delegated from the URL mode.

This mode is additive; existing project campaign/onboarding behavior remains unchanged.

## Synthetic fixture

Add a content-free synthetic SPA with only generic structural states.

It must prove:

1. multiple activatable candidates exist in one state;
2. some candidates are legitimate no-ops;
3. one non-default branch reaches a later state;
4. external/checkpoint state can affect future transitions without leaking values;
5. coverage-guided exploration finds the progressing branch;
6. fresh replay reproduces it;
7. deletion shrinking produces a bounded/1-minimal opaque action trace;
8. Chromium and WebKit can both execute the same `kind + ordinal` trace where supported;
9. exported JSON contains none of the forbidden content-bearing fields or fixture private strings.

Also export fixture vectors for the consumer repository to pin `candidateOrderVersion` compatibility.

## P0 implementation plan

### 1. Add privacy projection

- explicit content-blind profile at the Generic Browser observation boundary;
- structural state/action projection only;
- schema/validator forbidding arbitrary semantic strings in `OpaqueWebReplayV1`;
- public-disclosure regression checks.

### 2. Add portable candidate enumeration

- `dom_activate` + `pointer_point` only;
- deterministic ordinal order;
- version the algorithm;
- synthetic vectors.

### 3. Add already-running loopback URL entry point

- reuse managed Playwright runtime;
- Chromium default;
- no onboarding/build requirement;
- bounded lifecycle/fresh context replay.

### 4. Add optional WebKit execution

- generic engine option;
- preserve Chromium defaults and existing tests;
- explicit unsupported prerequisite diagnostics.

### 5. Add opaque transition replay/minimize export

- export deterministic portable traces;
- minimize against a structural transition predicate;
- explicit minimality/budget status;
- do not mix this identity with existing browser-exception finding groups unless semantics are truly equivalent.

### 6. Production-regression protection

- current normal Generic Browser snapshots/campaigns unchanged when the profile is disabled;
- existing production/promoted-production gates do not change identity/hash solely because this capability exists;
- content-blind URL mode does not become a new critical-path requirement for normal CI.

## Non-goals

- game-specific exploration APIs;
- understanding story/UI semantics;
- selectors as portable replay identity;
- screenshots or visual AI;
- replacing current project onboarding/campaigns;
- treating Chromium as correctness truth;
- claiming Playwright WebKit equals WKWebView;
- arbitrary remote URLs in P0;
- private application fixtures or identifiers.

## Acceptance criteria

- [x] Generic Browser supports an explicit content-blind profile without changing default campaign semantics.
- [x] An already-running loopback Web app can be explored without project onboarding/prepare.
- [x] `OpaqueWebReplayV1` exports only versioned fixed action kinds, bounded ordinals, fixed transition classes, engine identity and minimality metadata.
- [x] No text/selector/URL/accessibility/screenshot/pixel/error/source/storage value can enter the exported replay artifact.
- [x] Candidate ordering is deterministic, versioned and covered by portable fixture vectors.
- [x] Coverage-guided exploration finds a progressing non-default branch among legitimate no-op candidates.
- [x] Fresh-context replay is deterministic.
- [x] A deterministic opaque transition path can be bounded/minimized without using semantic finding identity.
- [x] Chromium remains backward-compatible/default; WebKit is optional and explicit.
- [x] Checkpoint-aware sibling isolation remains correct under the content-blind profile.
- [x] Existing Web/Browser, replay, production corpus, promoted-production and public-disclosure gates remain green with no unintended semantic-hash churn.

## Handoff / parallel-development rule

This issue is designed to proceed independently from the consumer repository.

Pin `OpaqueWebReplayV1` and `candidateOrderVersion` semantics with synthetic fixture vectors first. The consumer can implement against those vectors in parallel.

Do not add consumer-specific executable code to Proped. Any necessary contract change must be versioned and reflected in the fixture vectors rather than silently changing ordinal semantics.

## Completion evidence

Implemented the P0 capability as a generic, opt-in Web/Browser contract. The normal semantic Browser path remains the default and the opaque transition-path minimizer is separate from browser-exception `findingGroupId` identity.

- `protocol/opaque-web-replay-v1.mjs` defines `content-blind-opaque-v1`, `OpaqueWebReplayV1`, `candidateOrderVersion = 1`, bounded `dom_activate` / `pointer_point` ordinal actions, fixed transition classes, strict artifact validation, fresh replay, and bounded deletion shrinking with explicit `one-minimal` / `budget-exhausted` status.
- `protocol/fixtures/opaque-web-candidate-order-v1.json` pins the consumer-visible candidate-order contract, including DOM activation eligibility, bounds, and fixed viewport pointer geometry.
- `web/playwright-browser/generic-browser-driver.mjs` adds an explicit opaque profile at the observation/action boundary. The opaque projection returns only structural counts/booleans/buckets plus an opaque topology hash; it does not build semantic snapshots, console/error provenance, route evidence, storage values, accessibility names, screenshots/pixels, selectors, or raw URLs for portable evidence.
- `scripts/web_explore_url_opaque.mjs` and `proped web explore-url` accept already-running loopback HTTP(S) applications directly, without project onboarding, prepare, command-server ownership, or delegated shell execution. Invalid/failed strict-mode paths return fixed diagnostics without echoing the raw URL.
- Managed Playwright engine selection is generic and additive. Chromium remains the default with its existing metadata shape; WebKit is explicit/optional and reports `managed_webkit_launch_failed` when its executable is unavailable. The opaque replay test executes the same ordinal trace under WebKit whenever that runtime is installed.
- Existing coverage-guided exploration and environment-checkpoint machinery are reused. Portable action identity is `kind + ordinal`; checkpoint restoration isolates sibling candidates and the opaque minimizer restores the initial environment checkpoint before each fresh candidate replay.
- The synthetic fixture contains legitimate no-op candidates, a non-default progressing branch, and external checkpoint state. Coverage-guided exploration finds the progressing branch and minimizes it to two opaque actions: `dom_activate:001` (`changed`) then `dom_activate:001` (`terminal`). Repeated fresh replay is deterministic and budget exhaustion is never mislabeled one-minimal.
- Privacy regression assertions seed private sentinels into title/text/accessibility/storage/console/source/URL/route content and verify that the browser boundary, exploration evidence, CLI result, and `OpaqueWebReplayV1` contain none of them. A separate runtime-salt fixture proves portable replay does not require cross-runtime fingerprint equality.

Validation completed successfully:

- `node scripts/test_content_blind_opaque_web_replay.mjs`
- `node web/playwright-browser/test-generic-browser-driver.mjs`
- `node scripts/test_web_coverage_guided_exploration.mjs`
- `node scripts/test_web_exploration_replay_gate.mjs`
- `node scripts/test_web_state_novelty.mjs`
- `node scripts/test_web_project_onboarding_v2.mjs`
- `node scripts/test_web_project_baseline.mjs`
- `node scripts/test_release_gate.mjs`
- `node scripts/test_proped_web_cli.mjs`
- `node scripts/test_github_actions_workflow.mjs`
- `python3 scripts/check_public_disclosure.py`
- local production corpus: 5/5 auto-onboarded, 0 interventions, deterministic replay 5/5, 0 baseline regressions; existing baseline semantic hash preserved as `e1c22176372f104081a04ba12c343bba6422a64d6cfe1d00c2bdc22afbf738e8`
- GitHub Actions CI run `32082184180` for implementation commit `d3a81b4e013c25099fb45073ec92edc4236d1c20`: success, including Web generic contracts
- GitHub Actions Production contracts run `32082184197`: success; all seven promoted-production shards succeeded, both fresh actionable-acceptance campaigns compared successfully, and the Production aggregate gate succeeded under the workflow's strict sandbox path
- `git diff --check`

Local direct promoted-production execution was additionally attempted. The local-MCP sandbox prevented four external projects from completing because dependency/network access and nested process execution are intentionally restricted there; the corresponding network-enabled GitHub Actions shards all succeeded, so these were execution-environment limitations rather than product regressions.

