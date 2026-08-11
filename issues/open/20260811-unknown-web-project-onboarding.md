# Unknown Web Project Onboarding / Zero-config Discovery

## Status

Open

## Summary

Proped-Rabbita を未知の Web プロジェクトへ適用するとき、現在もっとも大きい導入コストは manifest ではなく、project-specific な **contract / adapter** の作成にある。

TodoMVC と drawDB の real dogfood により、Proped-Rabbita は実 Web アプリから deterministic な実不具合を検出できることを確認できた。一方で、次の準備をかなり手作業している。

- build / serve / ready 条件
- action discovery と selector
- semantic state projection
- property / oracle
- noise normalization
- persistence / reload setup
- deterministic replay wiring
- project-specific diagnostics

Deep Research の結論は、完全な「zero-config で domain oracle まで自動生成」を狙うべきではなく、次の形を目指すべきというものだった。

> **zero-config discovery + low-code semantic testing**
>
> 環境設定、browser setup、server lifecycle、action discovery、selector、generic state、normalization、replay、CI、sandbox は極力自動化し、人間には「このアプリで意味的に何が正しいか」という高価値な semantic decision だけを書かせる。

Proped-Rabbita の差別化は Playwright test の自動生成ではなく、次に置く。

> **未知 Web アプリから操作可能な状態機械を半自動で抽出し、semantic property を stateful に探索し、failure を最小 counterexample へ shrink し、fresh browser で deterministic replay し、stable failure class として CI へ返す。**

## Current Baseline

Research 時点の基準は `main` / `47f137f`。

既存資産:

- Web project runner / manifest v1
- React / Vue Component Mode
- Playwright Browser Mode
- Next / Nuxt SSR-hydration
- cross-mode replay
- network / timer schedule exploration
- mutation quality gate
- external dogfood runner
- accessible action discovery
- DOM semantic snapshot / normalization
- deterministic replay / semantic hash
- JSON / HTML / SVG / DOT Atlas

Real dogfood:

### TodoMVC

実装間で共通 behavioral contract を流し、実仕様違反を検出した。

Known unique failure classes:

- `toggle_all_reflects_all_todos`
- `escape_cancels_edit`
- `reload_persists_todos`

### drawDB

IndexedDB、undo/redo、selection、relationship、import/export、drag/reload まで実 browser で検証し、実不具合を検出した。

Known unique failure classes:

- `add_table_redo_preserves_order`
- `delete_table_undo_preserves_order`
- `sql_ui_import_rejects_valid_mysql`

この TodoMVC 3 + drawDB 3 の **6 failure classes** は、unknown-project onboarding 自動化の regression corpus として扱う。

## Problem

未知 project の onboarding cost は次のように分解できる。

```text
C_onboarding
  = C_environment
  + C_bootstrap
  + C_server
  + C_action
  + C_state
  + C_oracle
  + C_noise
  + C_replay
  + C_security
  + C_CI
```

現行 runner は主に orchestration と `C_CI` を大きく削減している。

次に優先して削減すべきものは:

```text
C_action + C_state + C_oracle + C_noise
```

ただし `C_oracle` を完全に自動化しようとすると false positive generator になりやすい。

## Goals

1. 未知 repo を clone した直後から、最低限の人手で generic campaign を開始できるようにする。
2. build / serve / browser / action / selector / generic state / replay / CI を project-specific code から追い出す。
3. generic property は高信頼な metamorphic relation に限定する。
4. domain-specific semantic property は小さな projection / hint として追加できるようにする。
5. candidate failure は fresh BrowserContext で replay し、deterministic なものだけ quality failure とする。
6. dangerous / destructive action は fail-closed で扱う。
7. unknown repo 実行は bootstrap と execution を分離し、execution phase を strict sandbox 化する。
8. onboarding cost を定量的に計測する。

## Non-goals

- LLM に domain oracle を全面的に決めさせること。
- Playwright / Cypress の代替 runner を作ること。
- あらゆる canvas / WebGL / collaboration app を完全 zero-config で理解すること。
- CSS selector generation を主戦場にすること。
- 初期段階から Chromium / Firefox / WebKit 全 matrix を要求すること。
- 認証情報を zero-config campaign へ自動投入すること。

## Product UX

unknown project onboarding は四層に分ける。

| Level | User input | Proped-Rabbita automation | Target |
|---|---|---|---|
| **Inspect** | 原則ゼロ | framework / package manager / build / start / route / storage / browser requirement / CI dependency を推定 | 数十秒〜数分で分類 |
| **Generic** | generated config の review | accessible action discovery、generic invariants、crash/error、navigation、reload、storage、replay | simple SPA で 15 分以内に campaign |
| **Semantic** | 数十行程度の projection / property hints | exploration、shrinking、normalization、failure clustering、replay | CRUD / SSR / editor の意味検証 |
| **Custom** | 小さい adapter hook | canvas、IndexedDB domain model、server state、collab scheduling | complex editor / collaboration |

重要なのは「adapter をゼロにする」ことではない。

**低付加価値な準備をゼロへ近づけ、高付加価値な domain semantics だけを人間に残す。**

## Proposed CLI

配布CLIの最終surfaceは以下を予定する。現在は同等のNode entry pointを実装済みで、`web inspect` / `web init` / `web doctor` / v2 compileを段階的に統合している。

```bash
# Read-only discovery
proped web inspect . --json

# Generate high-level manifest / contract skeleton
proped web init . --preset auto

# Check runtime / package / browser / server / sandbox requirements
proped web doctor proped.web.yaml

# Local campaign
proped web run proped.web.yaml

# CI strict mode
proped web run proped.web.yaml --profile ci --replay 3
```

### `proped web inspect`

最初に実装する。

read-only で以下を推定する。

- Git revision
- package manager
  - `packageManager`
  - lockfile
- Node/runtime requirements
- framework
  - React / Vue / Next / Nuxt / Vite / static / unknown
- install command
- build command
- start / preview / static serve command
- output directory
- SSR / static / SPA mode
- Playwright dependency presence
- route hints
- local/session storage usage hints
- IndexedDB / Dexie usage hints
- WebSocket / collaboration hints
- authentication hints
- confidence
- ambiguities

Example:

```json
{
  "framework": "next",
  "packageManager": "pnpm",
  "install": "inferred",
  "build": "inferred",
  "serveMode": "node-server",
  "stateSources": ["dom", "forms", "localStorage"],
  "browser": "chromium",
  "confidence": {
    "packageManager": 1.0,
    "build": 0.98,
    "serveMode": 0.94
  },
  "ambiguities": []
}
```

## Manifest v2

現行 manifest v1 の runner semantics は捨てない。

user-facing な high-level manifest v2 を、内部的に **manifest v1 stage graph へ compile** する。

Example:

```yaml
schemaVersion: 2

project:
  root: .
  framework: auto
  packageManager: auto

bootstrap:
  install: auto
  build: auto

server:
  mode: auto
  start: auto
  readiness:
    strategy: semantic-quiescence
    timeoutMs: 30000

browser:
  engine: chromium
  headless: true
  viewport: [1280, 900]
  locale: en-US
  timezone: UTC
  serviceWorkers: block

discovery:
  actions: accessibility
  selectorPolicy: role-first
  ambiguity: fail-closed

state:
  sources:
    - dom
    - forms
    - url
    - localStorage
    - sessionStorage
  indexedDB:
    mode: auto-metadata

normalization:
  builtin: true
  volatilityProbeRuns: 3

properties:
  packs:
    - browser-safety
    - navigation
    - form-consistency
    - reload-persistence
    - reversible-actions

exploration:
  maxStates: 1000
  maxDepth: 12
  seed: 1

replay:
  attempts: 3
  freshContext: true

sandbox:
  mode: strict
  executionNetwork: deny
  credentials: deny

artifacts:
  output: .proped/out
  traceOnFailure: true
```

## Generic Browser Adapter

現在の `PlaywrightBrowserDriver` から fixture-specific assumptions を外す。

特に除去するもの:

- `window.__fixture`
- fixture-specific readiness
- synthetic effect assumptions

標準機能:

1. ARIA / accessibility semantics から actionable node を発見。
2. locator candidate を confidence 付きで保持。
3. action 前後の semantic snapshot を共通形式で取得。
4. project-specific ready hook がなければ semantic quiescence で settle。
5. ambiguous locator は適当に `.first()` せず diagnostic に倒す。
6. fresh BrowserContext replay を runner 標準機能にする。

### Locator policy

優先順位:

```text
test-id
  > role + accessible name + scope
  > label
  > text / placeholder
  > CSS fallback
```

CSS / XPath generator の高度化を主目的にしない。

## Semantic Quiescence

unknown project では `networkidle` 一本に依存しない。

```text
explicit project ready hook
  ↓ unavailable
Playwright actionability complete
  + microtask flush
  + 2 animation frames
  + semantic fingerprint unchanged N times
  + tracked pending requests == 0 where observable
  ↓
bounded timeout
```

settle 自体にも provenance を持たせる。

```json
{
  "strategy": "semantic-quiescence",
  "stableSamples": 3,
  "pendingRequests": 0,
  "elapsedMs": 214,
  "confidence": 0.92
}
```

## State Sources

| State source | Automation | Zero-config suitability |
|---|---|---|
| DOM / ARIA | semantic tree auto-capture | High |
| forms / focus | auto-capture | High |
| URL / route | auto-capture | High |
| localStorage | auto-capture + normalization | High |
| sessionStorage | auto-capture + normalization | High |
| IndexedDB | DB/store/index metadata + bounded sample | Medium |
| Dexie | detected plugin / introspector | Medium-High |
| server/API | read-only probe or reset hook | Low-Medium |
| WebSocket/collab | deterministic scheduler / peer model | Low |

### Optional projection hook

project-specific code が必要でも、巨大な Playwright test を書かせない。

```js
// proped.adapter.mjs
export default {
  state: {
    async project(page) {
      return {
        documentCount: await page.getByRole("article").count(),
      };
    },
  },

  normalize: [
    { path: "$.generatedId", replaceWith: "<generated>" },
  ],
};
```

locator / action / replay / trace management は Proped-Rabbita 側に残す。

## Action Discovery

既存 `accessible-action-discovery.mjs` を fixture driver から切り離し production browser へ一般化する。

初期対象:

- button
- link
- checkbox
- radio
- textbox
- searchbox
- spinbutton
- combobox
- listbox
- form submit
- dialog action

action inventory 例:

```json
{
  "kind": "click",
  "role": "button",
  "name": "Add item",
  "scope": "form:Todo",
  "confidence": 0.99,
  "destructiveRisk": "low"
}
```

### Destructive action policy

unknown app では destructive action を自動で自由に押さない。

Risk classification:

- `safe`
  - filter
  - sort
  - tab switch
  - local toggle
  - navigation within same origin
- `bounded-mutation`
  - create local item
  - edit form
  - undo / redo
  - local delete with reversible state
- `destructive`
  - account delete
  - logout where auth cannot be restored
  - payment / purchase
  - email / message send
  - irreversible server mutation
- `unknown`
  - default deny / review

Generic zero-config campaign は `safe` と reset/replay 可能と判断できる bounded mutation に限定する。

## Property Strategy

### Zero-config で安全に適用しやすい property

高信頼な generic / metamorphic property を中心にする。

- browser crash / uncaught exception freedom
- deterministic replay
- action → reload で semantic state が意図せず消えないか
- Undo → Redo reversibility
- repeated Undo / Redo drift
- idempotent action consistency
- route back/forward consistency
- filter / sort が underlying entity identity を壊さないか
- modal open/close round-trip
- export → import semantic equivalence
- serialization round-trip
- focus / selected element が削除後 stale にならないか
- duplicate submit / duplicate pending effect
- stale async responseがnewer stateを上書きしないか
- same input / same seed / fresh context で semantic hash が一致するか

### Confidence / review が必要な property

- delete 後に必ず件数が1減る
- save 成功後の domain-specific state
- business rule
- permission / role semantics
- accounting / financial correctness
- workflow transition correctness
- server-side side effect
- cross-user collaboration semantics

これらは generated candidate として提示し、人間 approve 後に quality gate とする。

## Generic Property Packs

提案:

```text
browser-safety
navigation
form-consistency
reload-persistence
reversible-actions
async-causality
storage-consistency
roundtrip
selection-consistency
```

property pack は app の発見情報に応じて有効化候補を出す。

例:

- Undo / Redo controls を検出 → `reversible-actions`
- localStorage / IndexedDB usage を検出 → `reload-persistence`
- import / export controls を検出 → `roundtrip`
- search / filter controls を検出 → `filter-consistency`

ただし自動有効化は confidence threshold を持つ。

## Noise / Normalization

現在の builtin normalizer は維持し、**volatility mining** を追加する。

同一 revision / seed / no-action fresh run を 2〜3 回行い、差分から candidate noise を抽出する。

候補:

- timestamp
- generated ID
- request token
- build hash
- random animation state
- transient request state

ただし「変わる値 = 無視」にはしない。

```text
observed volatile
  → proposed normalizer
  → action correlation analysis
  → replay comparison
  → safe-to-ignore / needs-review
```

normalization rule は provenance と confidence を持つ。

## Failure Classification

project author に毎回 failure code を手書きさせない。

Canonical signature proposal:

```text
failure-class = hash(
  oracle-family,
  normalized-action-pattern,
  normalized-semantic-delta-path,
  route-family,
  normalized-exception-kind
)
```

例:

同じ Undo → Redo bug が generated ID 違いで100回起きても1 failure classへclusterする。

human-readable alias は後付け可能。

## Deterministic Replay

現行 dogfood の「contract 全体を2回」から、runner-native replay gate へ昇格する。

Candidate failure:

```text
initial discovery
  → shrink
  → fresh BrowserContext replay × 3
  → 3/3 same failure class
      => deterministic quality failure
  → otherwise
      => nondeterminism diagnostic
```

CI では stability を優先し、初期段階は worker=1 / Chromium-first とする。

## Security / Sandbox

unknown repo の自動実行では、現在の caller-enforced policy だけでは不足する。

### Bootstrap / Execution separation

```text
Bootstrap phase
  network: registry/browser distribution only
  credentials: deny by default
  writes: dependency/build cache only

        ↓ freeze environment

Execution phase
  network: deny by default
  source tree: read-only
  writable: build output / temp / Proped artifacts only
  secrets: none
  upstream git writes: deny
```

既存 CI の bubblewrap network-deny mechanism を Web runner へ統合することを検討する。

### Auth

zero-config default:

```yaml
credentials: deny
```

将来 auth profile を追加する場合も:

- runtime secret injection
- auth storage artifact を Atlas へ保存しない
- trace / summary redaction
- explicit opt-in

を必須とする。

## What Can Be Generalized from TodoMVC / drawDB

### TodoMVC

現在手書きしたもののうち一般化可能:

- build / static serve
- fresh context
- network deny
- ARIA controls
- text input / click / submit actions
- route/filter discovery
- localStorage inventory
- reload property
- deterministic replay
- failure serialization

残りやすい semantic input:

- Toggle All の意味
- Escape が edit cancel を意味すること
- completed filter と全体stateの関係

### drawDB

一般化可能:

- Vite build / static serve
- IndexedDB DB/store/version inventory
- Dexie detection
- pointer-based drag primitive
- Undo / Redo discovery
- repeated reversible-action property
- reload persistence
- file upload/download action primitive
- export/import control discovery
- selected element stale-state check
- deterministic replay
- semantic failure clustering

project-specific に残りやすいもの:

- table / relationship semantic projection
- DBML / SQL の semantic equivalence projection
- canvas entity identity
- domain-specific IndexedDB record interpretation

## Research-backed Positioning

既存 tool に任せるもの:

### Playwright

- browser automation runtime
- actionability / auto-wait
- locator primitives
- ARIA snapshot
- browser isolation
- Trace Viewer
- browser binary management

### Existing PBT / MBT ideas

- property-based generation
- stateful rules
- shrinking
- model / postcondition concept

Proped-Rabbita が独自化すべきもの:

- unknown app の action/state inventory
- accessibility-first state machine extraction
- semantic state hashing
- generic metamorphic property packs
- stateful exploration over real browser
- semantic shrinking
- canonical failure clustering
- fresh-browser deterministic replay gate
- onboarding cost instrumentation
- generic → semantic → custom の段階的 UX

**「AI で Playwright test を書く」方向へ寄せない。**

LLM は P3 以降で:

- source / existing tests / UI vocabulary を読む
- semantic projection candidate を提案
- property candidate を提案
- normalizer candidate を説明

という **semantic accelerator** に限定する。

## Roadmap

## P0 — Unknown Project Bootstrap

最優先。

### P0.1 `proped web inspect`

- [x] package manager inference
- [x] framework inference
- [x] build/start/static output inference
- [x] SSR/static/SPA mode classification
- [x] Node requirement inference
- [x] storage / IndexedDB / Dexie hints
- [x] auth / WebSocket hints
- [x] confidence + ambiguities
- [x] JSON output

Acceptance:

- [x] TodoMVC React / Vue を正しく分類
- [x] drawDB を Vite SPA + IndexedDB/Dexie として分類
- [x] existing Next fixture を Next SSR/static config に応じて分類
- [x] existing Nuxt fixture を Nuxt server/static config に応じて分類

### P0.2 Generic Playwright Adapter

- [x] fixture-specific dependency を除去
- [x] unknown URL へ直接接続
- [x] ARIA action inventory
- [x] locator confidence
- [x] ambiguity fail-closed
- [x] DOM/forms/URL/storage snapshot
- [x] fresh-context replay

Acceptance:

- [x] project-specific Playwright code 0 行で TodoMVC generic campaign 開始
- [x] actionable control recall >= 90% を benchmark 化
- [x] generated locator uniqueness >= 99% を目標

### P0.3 Semantic Quiescence

- [x] generic settle detector
- [x] fingerprint stability
- [x] animation frame settling
- [x] bounded request tracking
- [x] timeout diagnostic

### P0.4 Managed Chromium

- [x] target project に Playwright dependency を要求しない
- [x] Proped 側で Playwright/browser revision を pin

### P0.5 Strict Sandbox Integration

- [x] execution outbound network deny
- [x] source read-only
- [x] artifact/temp/build writable only
- [x] credentials deny
- [x] upstream git writes deny

## P1 — Low-code Semantic Testing

- [x] manifest v2 + v1 compiler
- [x] `proped web init`
- [x] `proped web doctor`
- [x] generic property packs
- [x] local/session persistence pack
- [ ] IndexedDB inventory
- [ ] Dexie adapter
- [ ] volatility noise miner
- [ ] canonical failure classifier
- [ ] runner-native replay × 3
- [ ] GitHub Actions workflow generator

### P1 generic pack evidence

- TodoMVC React/Vueの既存production distへproject-specific contractなしで適用。
- 両実装で`reload_state_loss_without_persistence_evidence`をconfidence 0.65 advisoryとして自動抽出。
- storage driftの実evidenceがある場合だけ`reload_persistence_storage_drift`をerrorに昇格する。
- synthetic healthy fixtureではfailure 0、faulty fixtureでは`browser_uncaught_exception`と`reload_persistence_storage_drift`を検出。

Acceptance:

- [ ] TodoMVC known failure 3/3 再検出
- [ ] drawDB known failure 3/3 再検出
- [ ] candidate failure deterministic replay 3/3
- [ ] generic healthy transition false positive < 1 / 1000 transitions を目標

## P2 — Exploration Depth

- [ ] selector survival benchmark
- [ ] state novelty weighting
- [ ] coverage-guided exploration
- [ ] server reset/read-only API hooks
- [ ] multi-context scheduler prototype

## P3 — AI Semantic Assistance

- [ ] repository source / existing tests / UI vocabulary から property candidate 提案
- [ ] projection candidate 提案
- [ ] normalizer candidate 提案
- [ ] confidence / evidence 表示
- [ ] human approval workflow

## Minimum Vertical Slice

最初の implementation slice は広げすぎない。

### Scope

1. `proped web inspect . --json`
2. generic Playwright adapter
3. ARIA action discovery
4. DOM/forms/URL/localStorage snapshot
5. semantic quiescence
6. generic `browser-safety` + `reload-persistence`
7. fresh-context replay × 3
8. generated manifest v2 を既存 v1 runner へ compile

### Validation targets

#### Known corpus

- TodoMVC React
- TodoMVC Vue
- drawDB

#### First genuinely unknown target

候補:

- `vercel/next-learn` の credential 不要 subset
- `nuxt/examples` の self-contained example

unknown target は実装開始時に revision pin する。

### Success condition

```text
clone
→ proped web inspect
→ proped web init
→ proped web run
```

まで project-specific executable JS なしで進み、generic campaign artifact を生成できること。

## PoC Metrics

North Star は supported frameworks 数ではない。

### Primary metrics

| Metric | Definition | Initial target |
|---|---|---:|
| **TTFI** | clone → `inspect` success | <= 2 min |
| **TTFG** | clone → first generic campaign の人間作業時間 | simple SPA <= 15 min |
| **TTFM** | first meaningful domain property までの人間作業時間 | SPA <= 90 min / editor <= 2 h target |
| manual commands | user が手入力した non-Proped command 数 | SPA <= 2 |
| manual config LOC | generated config への人手修正 | SPA <= 20 LOC |
| custom adapter LOC | project-specific executable code | SPA = 0 / editor <= 100 LOC target |
| environment inference accuracy | package/build/start/mode correct | >= 95% |
| action discovery recall | meaningful actionable controls discovered | >= 90% |
| locator uniqueness | generated locator uniquely resolves | >= 99% |
| selector survival | minor upstream revision 後も有効 | >= 95% target |
| known failure recall | TodoMVC + drawDB corpus | **6/6** |
| generic false positives | healthy transitions | < 1 / 1000 target |
| replay determinism | same candidate failure class | **3/3** |
| clean CI reproducibility | clean environment same semantic result | **5/5** |
| sandbox escape tests | path/env/network probes blocked | 100% |

### North Star metrics

1. **Median time to first meaningful property**
2. **Manual semantic LOC per project**
3. **Deterministic real-bug yield per onboarding hour**

TTFG と TTFM は分けて計測する。

「15分で動く」と「15分で深いdomain oracleを書ける」は別問題。

## Benchmark Plan

PoC target:

| Target | Category | Main validation |
|---|---|---|
| TodoMVC React/Vue | SPA | env/build/action/CRUD/reload auto generation |
| drawDB | complex editor | IndexedDB/undo-redo/persistence + small semantic hint |
| vercel/next-learn subset | Next/full-stack | build/start/SSR/hydration/server boundary |
| Nuxt self-contained example | Nuxt | mode/output/hydration classification |
| Excalidraw local-only | complex editor | canvas/local-first boundary |

Excalidraw collaboration は local-only onboarding が成立した後の P2/P3 とする。

## Risks

### False positive amplification

最大リスク。

Mitigation:

- generic property は高信頼 metamorphic relation に限定
- confidence threshold
- generated oracle は default advisory
- deterministic replay gate
- failure clustering

### Selector instability

Mitigation:

- accessibility-first
- confidence
- ambiguity fail-closed
- selector survival benchmark

### ARIA-poor UI / canvas

Mitigation:

- test-id / text / CSS fallback
- optional pointer/canvas adapter
- custom projection hook

### Over-normalization

Mitigation:

- volatilityだけで auto-drop しない
- provenance
- action correlation
- reviewable candidates

### Async flake

Mitigation:

- semantic quiescence
- bounded request tracking
- replay 3x

### Server state contamination

Mitigation:

- ephemeral server / reset hook / fresh tenant
- unavailableなら read-only properties のみ

### Auth leakage

Mitigation:

- credentials deny default
- secret runtime injection only
- trace/artifact redaction

### Unknown repo execution risk

Mitigation:

- bootstrap / execution separation
- strict OS sandbox
- lifecycle script policy
- outbound network deny during campaign

## Decisions

- **Do not** optimize for “zero-config deep domain oracle”.
- **Do** optimize for “zero-config discovery + generic campaign + tiny semantic hook”.
- Keep manifest v1 runner semantics; add high-level v2 compiler.
- Chromium-first.
- Accessibility tree is the primary action-discovery input.
- LLM semantic suggestions are P3, not P0.
- Candidate bugs must pass deterministic fresh-context replay before CI failure.
- Safety policy must move from caller-enforced toward OS-enforced for unknown repo execution.

## External Research References

Primary / authoritative references used in Deep Research:

- Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- Playwright Codegen: https://playwright.dev/docs/codegen
- Playwright locators: https://playwright.dev/docs/locators
- Playwright browser isolation / contexts: https://playwright.dev/docs/next/browser-contexts
- Playwright auth: https://playwright.dev/docs/auth
- Playwright browsers: https://playwright.dev/docs/browsers
- Playwright CI: https://playwright.dev/docs/ci
- Playwright Trace Viewer / debugging: https://playwright.dev/docs/debug
- Hypothesis stateful testing: https://hypothesis.readthedocs.io/en/latest/stateful.html
- QuickCheck / stateful model-based testing research: https://research.chalmers.se/en/publication/155860
- Stateful model-based testing research: https://research.chalmers.se/en/publication/249538
- Deterministic / parallel QuickCheck research: https://research.chalmers.se/en/publication/542175
- Coverage-guided property-based testing: https://doi.org/10.1145/3360607
- Microsoft Research coverage-guided PBT: https://www.microsoft.com/en-us/research/video/coverage-guided-property-based-testing/
- Web application automata research: https://www.jstage.jst.go.jp/article/imt/1/1/1_1_66/_article/-char/ja
- GitHub-hosted runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Next.js deployment: https://nextjs.org/docs/app/getting-started/deploying
- Next.js static export: https://nextjs.org/docs/app/guides/static-exports
- Nuxt deployment: https://nuxt.com/docs/3.x/getting-started/deployment
- TodoMVC: https://github.com/tastejs/todomvc-app-template
- drawDB: https://github.com/drawdb-io/drawdb
- Excalidraw: https://github.com/excalidraw/excalidraw
- Next Learn: https://github.com/vercel/next-learn

## Related Internal Evidence

- `issues/closed/20260811-real-todomvc-dogfood.md`
- `issues/closed/20260811-real-drawdb-dogfood.md`
- `issues/closed/20260811-drawdb-roundtrip-drag-dogfood.md`
- `protocol/web-project-runner.mjs`
- `protocol/web-project-manifest.schema.json`
- `protocol/accessible-action-discovery.mjs`
- `protocol/dom-semantic-snapshot.mjs`
- `web/playwright-browser/playwright-browser-driver.mjs`
- `web/react-component/react-component-driver.mjs`
- `.github/workflows/ci.yml`
