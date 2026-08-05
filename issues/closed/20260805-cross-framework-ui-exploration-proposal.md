# React・Vue・Next.js・Nuxt向けUI状態探索基盤を設計する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P1
Depends-On: none

## 概要

Proped Rabbitaで実証した、到達可能なUI状態の探索、state/transition property検査、failure traceの縮約、決定的replay、atlas出力を、React、Vue、Next.js、Nuxtへ適用できるframework横断のUI state-space explorerとして再設計する。

Rabbita固有の`Model`、`Msg`、`update`、`view`へ直接依存する現在の実装を捨てるのではなく、Rabbitaを最も純粋で決定的なreference adapterとして維持し、その外側にframework-neutralなdriver protocolを定義する。

本issueは実装issueではなくproposalである。最初に境界、実行mode、決定性、replay契約、性能目標を固定し、小さなReact targetで技術的成立性を検証してから本実装へ分割する。

## 背景

Proped Rabbitaは既に次の能力を持つ。

- 現在stateで有効なactionだけを列挙する。
- state propertyとtransition propertyを検査する。
- failureを再実行可能な最小action traceへ縮約する。
- state/action identity collisionを診断する。
- deterministicなHTML、SVG、JSON、Graphviz atlasを生成する。
- timer、subscription、command、network response orderingをeffect modelとして検査する。

これらの能力はRabbitaに限定されない。一方、React/Vueのcomponent runtimeとNext.js/Nuxtのfull-stack runtimeでは、純粋な`Model -> Msg -> Model`だけではなく、DOM、focus、router、storage、network、timer、SSR、hydration、server stateを扱う必要がある。

## 仮説

次の二層構成にすれば、既存の探索・縮約の価値を保ちながらWeb ecosystemへ拡張できる。

1. **Component Mode**: React/Vue componentをDOM test runtimeへmountし、大量の状態遷移を高速探索する。
2. **Browser Mode**: Next.js/Nuxtをproduction相当で起動し、Playwright browserでSSR、hydration、routing、storage、networkを含めて探索・replayする。

Component Modeでfailureを探索・縮約し、最小traceだけをBrowser Modeで再検証するhybrid campaignを標準とする。

## 目標

- framework-neutralな非同期UI driver protocolを定義する。
- React/Vueでrole・label・accessible nameを基準にactionを機械生成する。
- Next.js/NuxtでSSR、hydration、routing、browser effectを観測する。
- generic propertyだけでもruntime error、stale response、duplicate action、invalid input、focus、hydration不整合を発見できるようにする。
- application固有propertyを追加できる拡張点を提供する。
- failureをstable action IDを持つ最小traceへ縮約する。
- seed、bounds、fixture、runtime versionを固定し、CIで決定的にreplayできるようにする。
- Rabbita targetとWeb targetを同じreport schemaとatlasで比較できるようにする。

## 非目標

- Playwright、Vitest、Testing Library、Vue Test Utilsの置き換え。
- screenshot差分だけで視覚的正しさを自動判定すること。
- production環境へ無制限に入力を送るcrawler。
- 任意のWeb applicationを設定なしで完全探索すること。
- framework内部のprivate stateやFiber/VNode構造への恒久的依存。
- 実network、課金、メール送信、外部writeなど不可逆な副作用の実行。

## 提案アーキテクチャ

```text
                         proped-core
          exploration / shrinking / replay / report
                              |
                    driver protocol v1
                              |
              +---------------+---------------+
              |                               |
      proped-dom-driver               proped-browser-driver
              |                               |
       +------+------+                 +------+------+
       |             |                 |             |
   React adapter  Vue adapter      Next adapter  Nuxt adapter
```

### Core

Coreは以下だけを責務とする。

- exploration strategy
- state/action identity管理
- property実行
- failure retention
- trace shrinking
- replay verification
- diagnostics
- report/atlas生成

frameworkのmount、DOM操作、browser起動、network mockはdriver側へ置く。

### Driver protocol v1

最小protocolは非同期で、少なくとも次の操作を持つ。

```ts
interface UiDriver {
  reset(seed: number, fixture: string): Promise<Snapshot>
  actions(snapshot: Snapshot): Promise<Action[]>
  execute(action: Action): Promise<Snapshot>
  replay(trace: Action[]): Promise<ReplayResult>
  dispose(): Promise<void>
}

interface Snapshot {
  fingerprint: string
  url?: string
  dom: string
  accessibility?: unknown
  focus?: ElementIdentity
  forms: FormValue[]
  storage?: StorageSnapshot
  effects: Effect[]
  console: ConsoleEntry[]
  pending: PendingWork[]
  applicationState?: unknown
}
```

transportはJSON互換に限定し、Node process、MoonBit JS target、native CLIのどれからでも実装できるようにする。

### Core実装方針のgate

既存MoonBit coreをsource of truthとして維持する。Phase 0で次の方式を比較し、探索結果と縮約結果が一致するものを採用する。

1. MoonBit coreをJavaScript targetへcompileし、Node adapterから直接呼ぶ。
2. MoonBit native CLIとNode driverをJSON-RPC/JSON Linesで接続する。
3. TypeScriptへcoreを再実装する。

3は二重実装とsemantic driftの危険が高いため、1または2を優先する。選定結果はADRとして保存する。

## Component Mode

### React

- Testing Library互換のquery優先順位を使う。
- user-facingなrole、accessible name、labelからactionを生成する。
- event後はReact update、microtask、configured timerがsettleしてからsnapshotを取得する。
- optional hookでRedux、Zustand、useReducerなどのapplication stateをsnapshotへ追加できるようにする。
- React warning、uncaught exception、unhandled rejectionをgeneric failureとして扱う。

### Vue

- Vue Test Utils相当のmount boundaryを持つ。
- `nextTick`、Suspense、async component、teleportをsettle対象とする。
- optional hookでPiniaやapplication stateをsnapshotへ追加できるようにする。
- Vue warning、uncaught exception、unhandled rejectionをgeneric failureとして扱う。

### DOM action discovery

最初のaction集合は次に限定する。

- button/link: click
- checkbox: check/uncheck
- radio: select
- textbox/searchbox/spinbutton: clear/type corpus
- combobox/listbox: option selection
- form: submit
- dialog: confirm/cancel/close
- page: back/forward/reloadはBrowser Modeのみ

CSS selectorをstable action IDに使わない。例:

```text
click:button:"Save"
type:textbox:"Email":"invalid"
select:combobox:"Country":"Japan"
```

同じrole/nameが複数存在する場合は、ancestor landmark、form、dialog、stable test identityを組み合わせる。曖昧なactionは実行せずdiagnosticへ記録する。

## Browser Mode

### 共通

- Playwrightをbrowser driverとして使用する。
- Chromiumを必須baselineとし、Firefox/WebKitはreplay matrixとして追加可能にする。
- production buildまたは明示されたpreview serverを起動する。
- route、DOM、accessibility、focus、form、storage、console、network、pending workをsnapshotへ含める。
- service worker、WebSocket、timer、request orderingは明示的policyで制御する。

### Next.js

- App RouterとPages Routerを別fixtureとして扱う。
- Server Component、Client Component、Server Action、Route Handlerの境界をmanifestへ記録する。
- SSR HTMLとhydration後DOMの不一致をgeneric propertyで検査する。
- server stateを各caseでresetできないtargetは探索対象にしない。

### Nuxt

- SSR、client hydration、route middleware、server routeをmanifestへ記録する。
- Nuxt runtime fixtureとfull browser fixtureを分離する。
- Suspenseとasync dataがsettleした条件をdriver contractへ明示する。
- server stateを各caseでresetできないtargetは探索対象にしない。

## Snapshotとfingerprint

デフォルトfingerprintは次を正規化して生成する。

- URL pathname/query/hash
- semantic DOM
- form valueとchecked/selected state
- focus identity
- relevant storage
- pending effect descriptors
- optional application state

次はfingerprintから除外またはnormalizerで置換する。

- framework生成の不安定ID
- timestamp
- random token
- build hash
- request ID
- animation progress
- DOM node address

同じfingerprintが異なるDOM、effect、application stateへ対応した場合は`StateIdentityCollision`として報告する。

## 入力corpus

汎用corpusを型・role・attributeから生成する。

- empty、single space、whitespace sequence
- `0`、`-1`、`1`、境界値
- `NaN`、`Infinity`、`-Infinity`
- very long string
- Unicode、emoji、combining character、RTL
- HTML/URL-like string
- duplicate value
- invalid email/date/time/number
- valid representative value

application manifestからfield固有corpusとshrink ruleを追加できるようにする。

## Generic property pack

### Runtime

- uncaught exceptionが発生しない。
- unhandled rejectionが発生しない。
- configured severity以上のconsole error/warningが発生しない。
- 同じfixture、seed、traceは同じsnapshotとeffectを返す。
- settleがtimeoutまたは無限更新へ入らない。

### UI state

- duplicate DOM IDがない。
- enabled actionの実行後に対象が予期せず消失した場合、理由を説明できるstate changeがある。
- disabled actionを強制dispatchしてもstateを破壊しない。
- cancel/closeは未確定値をcommitしない。
- invalid inputは最後の正常結果を破壊しない。
- loading中のsubmit、delete、downloadなど非冪等actionを重複実行しない。
- modal、selection、entity referenceが存在しない対象を参照しない。

### Async/effect

- stale responseが新しいrequestのstateを上書きしない。
- unmount後のcallbackがstateを更新しない。
- abort済みrequestのresultを適用しない。
- retryでeffectを重複commitしない。
- version、generation、sequenceが宣言した単調性に反しない。

### SSR/hydration

- hydration warningが発生しない。
- SSRとhydration後でsemantic contentが不正に変化しない。
- server/client分岐によりinteractive elementのidentityが失われない。
- hydration完了前後でform valueが消失しない。

## Failure shrinking

shrinkerはaction列の削除だけでなく、action引数も縮約する。

- string: 長さ削減、空白、ASCII化、単一code point化
- number: 0、1、-1、境界値、finite/non-finite representative
- selection: option index縮小
- route: path segment/query削減
- network schedule: response数削減、順序交換数削減
- timer: callback数とadvance量削減

縮約後はfresh fixtureへresetし、同一propertyが同一failure classで再現することを必須とする。

## Effect安全性

- external repositoryはread-only inputとして扱う。
- upstreamへissue、pull request、comment、commitを作成しない。
- networkはdefault denyとし、manifest allowlistまたはmock responseだけを許可する。
- filesystem、mail、payment、cloud mutation、native bridgeはdescriptorとして記録する。
- browser targetはephemeral profileとisolated storageを使用する。
- credentialsとprivate user dataをfixtureへ含めない。

## Package/ディレクトリ案

最終形を先に固定せず、Phase 0の結果を踏まえてmonorepo内packageまたは別repositoryを選ぶ。論理packageは次の責務へ分ける。

```text
proped-core
proped-protocol
proped-dom-driver
proped-react
proped-vue
proped-playwright
proped-next
proped-nuxt
proped-property-pack
```

Proped Rabbita repository内で開始する場合も、Rabbita adapterとWeb adapterが相互にframework dependencyを引き込まない境界を維持する。

## 実装段階

### Phase 0: architecture spike

- [x] driver protocol v1 draftを作成する。
- [x] MoonBit JS targetとnative JSON transportを比較する。
- [x] 同一synthetic machineでstate、transition、failure、shrink結果が一致することを確認する。
- [x] ADRでcore hosting方式を決定する。

### Phase 1: React Component Mode

- [ ] 小規模React form fixtureをmountする。
- [ ] role/labelベースのaction discoveryを実装する。
- [ ] input corpus、runtime property、invalid-input propertyを実装する。
- [ ] failureを3 action以下へ縮約し、deterministic replayする。
- [ ] JSON/HTML/SVG/DOT atlasへ出力する。

### Phase 2: Vue Component Mode

- [ ] Reactと同じprotocol/property/reportを再利用する。
- [ ] Vue固有settle処理だけをadapterへ閉じ込める。
- [ ] Piniaを使うfixtureと使わないfixtureを検証する。

### Phase 3: Browser replay

- [ ] Component Modeの最小traceをPlaywrightでreplayする。
- [ ] route、focus、storage、console、networkをsnapshotへ追加する。
- [ ] Chromium baselineでCIを安定させる。

### Phase 4: Next.js/Nuxt campaign

- [ ] Next.js App Router fixtureでSSR/hydration propertyを検証する。
- [ ] Nuxt SSR fixtureで同等propertyを検証する。
- [ ] stale response、duplicate submit、route rollbackのfault fixtureを用意する。
- [ ] frameworkごとの差をadapter内へ限定できることを確認する。

### Phase 5: external dogfood

- [ ] permissive licenseの公開targetを各framework最低1件選ぶ。
- [ ] revision、license、source hash、adapter boundaryをmanifestへ固定する。
- [ ] generic propertyを先に実行する。
- [ ] failureまたはzero-failure結果と探索範囲を保存する。
- [ ] upstreamへのwriteを行わない。

## 最初の検証fixture

意図的なfaultを持つ小さなfixtureをrepository内に作る。

- whitespace-only Todo title
- stale search response
- loading中のduplicate submit
- modal対象entity削除後のdangling selection
- invalid numeric inputによるprevious result破壊
- hydration前後のform value消失

同じfaultをReact/Vue、可能な範囲でNext.js/Nuxtへ実装し、framework差ではなく探索能力を比較する。

## 成功指標

- React fixtureで10,000 transition以上をCI許容時間内に探索できる。
- 同じseedとfixtureでreportのsemantic hashが一致する。
- 既知faultを全て検出し、各failureを5 action以下へ縮約できる。
- Component Modeの最小traceをBrowser Modeで再現できる。
- ReactとVueでcore、property、report、shrinkerの大部分を共有できる。
- Next.js/Nuxt固有処理がdriver/adapter境界から漏れない。
- external dogfoodで少なくとも1件の実用的failure、または十分に説明可能なzero-failure結果を得る。

## 受け入れ条件

このproposal issueを完了扱いにする条件は実装完了ではなく、実装へ分割可能な設計判断が揃うことである。

- [x] driver protocol v1の入出力とversioning方針が確定している。
- [x] core hosting方式がADRで選定されている。
- [x] Component ModeとBrowser Modeの責務が分離されている。
- [x] snapshot、fingerprint、stable action ID、settle、replayの契約が定義されている。
- [x] effect安全性とexternal read-only policyが定義されている。
- [x] React spikeのfixture、性能基準、期待failure signatureが定義されている。
- [x] 実装作業が独立したissueへ分割されている。

## 実装issueへの分割案

- framework-neutral driver protocol v1
- MoonBit core hosting ADR/spike
- DOM semantic snapshot and normalization
- accessible action discovery
- generic Web property pack
- React Component Mode adapter
- Vue Component Mode adapter
- Playwright Browser Mode driver
- Next.js SSR/hydration adapter
- Nuxt SSR/hydration adapter
- network/timer schedule exploration
- cross-mode replay and failure signature
- mutation testing and detection benchmark
- external React/Vue/Next/Nuxt dogfood campaign

## リスク

- DOMから生成できるactionは有限corpusへ制限しないとstate explosionする。
- async settle条件が緩いとflakyになり、厳しすぎると正しいlong-running stateをfailure扱いする。
- semantic DOMだけでは内部state差を失い、application stateを含めるとframework/library依存が増える。
- browser探索はcomponent探索より桁違いに遅い。
- adapterがupstream semanticsを変え、架空のfailureを作る可能性がある。
- SSR/server stateをcaseごとにresetできないtargetは決定的探索に向かない。
- generic propertyは仕様ではないため、false positiveをproperty policyで管理する必要がある。

## リスク低減

- component探索を主、browser探索をreplay中心とする。
- adapterとupstreamの同値性testを用意する。
- failureごとにproperty、trace、fixture、seed、runtime versionを保存する。
- unsupported effectを暗黙に無視せずdiagnosticにする。
- exploration boundsと未探索frontierをreportする。
- generic propertyをseverityとpolicyでenable/disable可能にする。
- synthetic fault fixtureとmutation testingで検出能力を定量化する。

## テスト計画

- protocol schema validation
- cross-language fixture parity
- deterministic replay
- action identity collision diagnostics
- snapshot normalization golden test
- state-space bound enforcement
- shrink replay equivalence
- fake timer and response-order exploration
- React/Vue component parity
- Component Mode to Browser Mode replay
- SSR/hydration fault fixtures
- report schema backward compatibility
- `git diff --check`

## 変更履歴

`CHANGES.md` impact: no

- 2026-08-05: initial proposal。React/Vue Component Mode、Next.js/Nuxt Browser Mode、hybrid exploration、driver protocol v1、段階導入案を定義した。

## Phase 0 実施結果

- `protocol/ui-driver-v1.schema.json`でprotocol version、request envelope、action、snapshot、settle schemaを固定した。
- `docs/WEB_DRIVER_PROTOCOL.md`でsession、stable action ID、normalization、settle、replay、safety契約を定義した。
- `docs/adr/0001-web-core-hosting.md`でnative MoonBit core + Node JSONL driverを採用し、TypeScript core再実装を却下した。
- `spikes/web-driver/parity.mjs`でdirect driverとJSONL child processを比較した。両方とも15 state・48 transition、同一property、`type:a -> type:ab -> deliver:1`、semantic hash `da41ee1bed57dc6c67ad4a6feb910dc7e0ca460df7939ab9c13ca5d66d2c4d20`となった。
- `spikes/web-driver/react-spike.json`でReact fixture、10,000 transition性能基準、fault corpus、期待failure signatureを固定した。
- 実装を14件の独立issueへ分割した。
