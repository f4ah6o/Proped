# Proped Rabbita

日本語 | [English](README.md)

Proped Rabbita は、Rabbita UI の到達可能状態を探索し、モデルと遷移のプロパティを検証し、failure traceを縮約して、決定的なHTML・SVG・JSON・Graphviz Atlasを出力します。

## CLIを実行する

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
moon run src/cli -- external inspect-source src/vendor/ensenzu_app/upstream/app.mbt.txt --json
moon run src/cli -- external inspect-source src/vendor/moonbit_editor_file_tree/upstream/file_tree.mbt.txt --json
moon run src/cli -- external run all --json
```

`demo run all` は各demoを `demo/out/<demo-id>/` に、`external run all` は外部targetを `demo/out/external/<id>/` に出力します。どちらもstdoutへ1つのJSON result envelopeを返します。エージェントやscriptは次のcommandから安定した契約を取得します。

```bash
moon run src/cli -- schema --json
```

終了コードは、各demoが宣言した期待結果と一致した場合が `0`、引数エラーが `2`、期待結果との不一致が `3` です。`--json` は引数列の任意の位置に指定でき、`--output <dir>` でartifact rootを変更できます。

完全なcommand・output契約は [docs/CLI.ja.md](docs/CLI.ja.md) にあります。

## 未知Webプロジェクトのinspection

Proped Rabbitaは未知のWebプロジェクトに対して、install/build/start scriptを実行せずread-only inspectionできます。package manager、framework、build/serve command、render mode、output directory、routing、storage/IndexedDB、WebSocket、service worker、authenticationのhintを推定し、無言で断定せずconfidenceとambiguityを返します。

```bash
node scripts/web_project_inspect.mjs .
node scripts/web_project_inspect.mjs . --json
```

現在の実装入口はNode scriptで、配布CLIでは`proped web inspect`を予定しています。

## Generated GitHub Actions quality gate

review済みmanifest v2からGitHub Actions workflowを生成できます。`--output`を明示しない限りrepositoryは変更せずstdoutだけに出します。

```bash
node scripts/web_project_ci.mjs proped.web.json > proped-web.yml
node scripts/web_project_ci.mjs proped.web.json --output .github/workflows/proped-web.yml
```

generated workflowはProped Rabbitaを**full commit SHA**でpinし、repository permissionをread-onlyに保ち、project dependency bootstrapをstrict executionから分離します。その後Proped-managed Playwright/Chromium、bubblewrap、`web_project_run_v2.mjs`を実行し、quality gate失敗時も`.proped/out`をuploadします。

## Unified Web CLI

Web onboardingのcanonical入口を`proped web`へまとめました。repository内では`node scripts/proped.mjs web ...`として同じdispatcherを実行できます。dispatcherはshellを使わず、各既存commandのstdout/stderr/exit codeをそのまま保持します。

```bash
node scripts/proped.mjs web inspect . --json
node scripts/proped.mjs web init . --output proped.web.json
node scripts/proped.mjs web doctor proped.web.json
node scripts/proped.mjs web review . --json
node scripts/proped.mjs web approve init review.json --output approvals.json
node scripts/proped.mjs web apply proped.web.json semantic-hints.json --output proped.web.approved.json
node scripts/proped.mjs web run proped.web.approved.json
```

既存`web_project_*` / `web_semantic_*` scriptsは互換入口として残します。

## Low-config Web project manifest v2

read-only inspection結果からhigh-level manifest v2を生成し、既存のv1 stage graphへcompileします。現時点のcanonical formatはJSONで、`--output`を明示しない限りstdout-onlyです。

```bash
node scripts/web_project_init.mjs . > proped.web.json
node scripts/web_project_doctor.mjs proped.web.json
node scripts/web_project_compile.mjs proped.web.json
```

`web doctor`はinstall/build/start commandを実行せず、project/runtime/server/browser/sandbox readinessを検査します。static outputやmanaged command serverはcompile後にProped-owned browser stageが扱います。

## Fresh-campaign replay gate

manifest v2はfresh campaignを既定3回実行します。candidate errorは同じcanonical failure classが全attemptで再現した場合だけquality failureへ昇格します。一部runだけに出るclassはCI failureではなく`nondeterministic_failure_candidate` diagnosticへ降格します。fresh-browser determinismを手動確認ではなくquality gate自体へ組み込みます。

## Canonical failure classes

Web failureには人間向けfailure codeとは別にstableなcanonical classを付与できます。oracle family、normalized action pattern、semantic evidence path、route family、exception kindを使い、generated ID、runtime generation、具体的input valueを正規化してからhashします。元failure codeは保持したまま反復発生をclusterし、runner summary/Atlasにもcanonical IDを出します。

## Generic Web property packs

Low-config Generic Browser Modeでは現在`browser-safety`、`navigation`、`reload-persistence`を提供します。false positive抑制のため保守的に判定し、uncaught exceptionや観測可能なlocal/session storage driftだけをquality failureにします。storage evidenceなしでreload後にvisible stateが消える場合は自動CI failureではなくadvisory candidateに留めます。

このgeneric discoveryだけで、TodoMVC React/Vueのreload state lossをTodoMVC固有Playwright adapter/semantic contractなしにsurfaceできています。

## Dexie-aware metadata

inspectionでDexieを検出すると、manifest v2がdeclared versionと、install済みならresolved versionをGeneric Browser Modeへ渡します。初版adapterはversion-boundedで、実依存から`indexedDB.open(name, Math.round(db.verno * 10))`と`idbdb.version / 10`を確認できたDexie 3.xだけを自動変換します。未知majorは推測せずdiagnosticを出してnative IndexedDB versionを保持します。

実drawDBは`^3.2.4`を宣言し`3.2.7`へresolveされ、native IndexedDB version `670` / Dexie logical version `67`として自動認識されます。`++id,diagramId,lastModified,loadedFromGistId`のようなstore schema descriptorも再構成します。

## IndexedDB metadata inventory

manifest v2で`state.indexedDB.mode = "auto-metadata"`を選ぶと、Generic Browser ModeはIndexedDBのdatabase名、native version、object store keyPath、auto-increment、index定義、record countを取得します。record payload自体は**読みません**。実drawDB dogfoodではdrawDB固有adapterなしで`drawDB` native version 670と`diagrams`/`templates` storeを検出できています。

## Volatility mining

manifest v2はgeneric campaign前にboundedなno-action fresh-context probeを実行できます。run間で変化するpathを抽出し、generated ID/token/timestampと、storage/form/domain stateの揺れを分離してnormalizer candidateを提案します。**candidateは自動適用せず**、raw volatile valueもreportへ出しません。state-bearing volatilityは必ずreview-requiredです。

## Selector survival benchmark

`web-selector-survival`はdiscovery済みaction inventoryをsemantic locator contractへ変換し、minor UI revision間で比較します。class名、生成DOM id、wrapper node、要素順が変わってもrole/name/scope/test identityが維持されていればsurvivalを保てます。commit済みbenchmarkではminor revisionに95%以上を要求し、semantic accessibility contractを意図的に壊した場合は低下を検出できることも別に確認します。

```bash
node scripts/test_web_selector_survival.mjs
```

## State novelty weighting

exploration frontierはdeterministicなsemantic novelty scoreで順位付けできます。新しいstate fingerprint、route family、storage key shape、IndexedDB schema shape、accessible action target frontierを別々のnovelty signalとして扱います。動的route IDやstorage valueそのものはnoveltyにしないため、volatile dataへの過剰反応を抑えます。

```bash
node scripts/test_web_state_novelty.mjs
```

## Unknown-project onboarding acceptance

commit済みonboarding regression corpusには、TodoMVC React 3件 + drawDB 3件のreal-browser failure classを記録しています。pinした実runで**6/6**をmanaged Chromium上でdeterministicに再検出しました。別のgeneric-property benchmarkでは10,000 healthy semantic transitionsを実行して**false positive 0件**（0 / 1000）で、duplicate-submit / invalid-entity sensitivity controlは正常に検出します。

```bash
node scripts/test_web_healthy_transition_benchmark.mjs
node scripts/test_unknown_web_onboarding_acceptance.mjs
```

## Human semantic approval workflow

semantic suggestionは人間が明示decisionを記録するまでinertです。approval planはsemantic review hashをpinし、stable candidate refごとに`approve`/`reject`/`defer`を保持します。high-risk approveは明示risk acknowledgement必須で、stale/tampered planは拒否します。compileして得られるのはhuman-approved hintsだけで、自動activationは行いません。

```bash
node scripts/web_semantic_approval.mjs init review.json --output approvals.json
node scripts/web_semantic_approval.mjs decide review.json approvals.json property:undo-redo-inverse approve --output approvals.json
node scripts/web_semantic_approval.mjs compile review.json approvals.json --output semantic-hints.json
```

## Coverage-guided Generic Browser exploration

生成manifest v2は小さくboundedなcoverage-guided explorationを既定で有効化し、`maxStates=32` / `maxTransitions=64` / `maxDepth=4`から開始します。frontierはsemantic state noveltyと未実行actionを優先し、各stateはfresh contextへtrace replayして再構成します。**destructive actionは常に探索対象外**で、bounded mutationもself-containedな`static-output`実行時だけ許可します。server/external modeではsafe actionだけを探索します。探索failureは、発見したtraceそのものをfresh contextで再実行し、全attemptで同じfailure classが再現した場合だけquality failureへ昇格します。flaky candidateはdiagnosticのままです。

## Approved semantic runtime integration

`semantic-hints.json`はmanifest v2の`semantics.approved`へ明示的に適用できます。承認済みhintだけがruntimeへ入り、未承認candidateは実行されません。初版runtimeは`property:saved-state-survives-reload`を既存`reload-persistence` packへ接続し、`projection:route-identity` / `projection:persistence-summary`をsemantic stateへ追加し、具体的なapproved normalizer ruleをfresh-context fingerprintへ適用します。未対応のapproved hintは黙って実行せずdiagnosticとして保持します。

```bash
node scripts/web_semantic_approval.mjs compile review.json approvals.json --output semantic-hints.json
node scripts/web_semantic_apply.mjs proped.web.json semantic-hints.json --output proped.web.approved.json
node scripts/web_project_run_v2.mjs proped.web.approved.json
```

`web_semantic_apply.mjs`は`--output`を省略するとstdout-onlyで、元manifestを書き換えません。compiled hintsのsemantic hashを再検証するため、承認後の改変も拒否します。

## Unified semantic review report

property/projection/normalizer提案を1つのbounded review reportで確認できます。各candidateにstableな`kind:id` ref、HIGH/MEDIUM/LOW confidence band、必要に応じたsemantic risk、recommended decision、evidence source、automatic activation flagを表示します。既定CLIは人間向け表示、`--json`では同じreview dataをtooling向けに出力します。

```bash
node scripts/web_semantic_review.mjs .
node scripts/web_semantic_review.mjs . --volatility volatility.json --json
```

## Review-only normalizer candidates

volatility findingをそのまま適用せず、説明付きnormalizer候補へ昇格できます。fresh-context volatilityとsource evidenceを組み合わせ、semantic riskと推奨判断を付けます。DOM generated ID/timestamp/tokenはlow-risk replacement候補にできますが、storage/form/application-state/IndexedDB pathはhigh-riskのまま保持し、自動replacementは出しません。

```bash
node scripts/web_normalizer_candidates.mjs . --volatility volatility.json --json
```

## Review-only semantic projection candidates

project-specificなPlaywright codeを生成する代わりに、小さなdeclarative state projection候補を提案できます。現在はselected entity identity、entity collection count、undo/redo history position、persistence metadata、normalized route identity、graph/domain summaryを候補化します。各提案にはoutput shape・source kind・confidence・evidenceを付け、実行projection codeは生成も自動activationもしません。

```bash
node scripts/web_projection_candidates.mjs . --json
```

## Review-only semantic property candidates

boundedなread-only static analyzerで、repository source snippet・既存test title・UI vocabularyの3系統から高価値なsemantic property候補を提案できます。現在はundo/redo inverse、import/export roundtrip、Escapeによるedit cancel、delete後のselection consistency、save後reload persistence、filter/source consistencyなどを候補化します。候補は**review-only**で、confidence/evidenceを表示し、自動activationは常に無効です。

```bash
node scripts/web_property_candidates.mjs . --json
```

## Multi-context scheduler prototype

deterministicなmulti-context schedulerで、shared stateとcontextごとのstateに対するcontext-tagged semantic actionのinterleavingを探索できます。wall-clock concurrencyへ依存せずtransition graphを記録し、failure traceをreplayします。synthetic regressionでは2 contextのlost-update raceを検出し、記録した4-step interleavingから同一failure signatureを再現します。

```bash
node scripts/test_web_multi_context_scheduler.mjs
```

## Server reset / read-only API hooks

manifest v2ではdeterministic campaign向けにsame-origin server hookを任意宣言できます。reset hookはcredentialなしの明示`POST` relative pathで、fresh browser resetの直前に毎回呼びます。read-only hookは`GET`/`HEAD`だけに制限し、redirect/cross-originを拒否、responseはbyte上限を設け、artifactにはraw bodyではなくstatus/content hash/JSON shapeだけを残します。server-backed appでもproject-specific adapterなしでfresh replayへ参加できます。

```json
{
  "hooks": {
    "reset": { "method": "POST", "path": "/__test/reset", "expectedStatus": [204], "timeoutMs": 1000 },
    "readOnly": [{ "id": "state", "method": "GET", "path": "/api/state", "expectedStatus": [200], "timeoutMs": 1000, "maxBytes": 65536 }]
  }
}
```

## Coverage-guided Web exploration

bounded explorerはsemantic traceをfresh browser contextへreplayしてfrontier stateを再構成し、discovery noveltyと未実行semantic actionを優先します。browser state cloneへ依存せずreproducibleに探索できます。synthetic regressionでは3 transitionsで新route上のfailureへ到達し、2回目も同一transition graph/semantic hashを再現します。

```bash
node scripts/test_web_coverage_guided_exploration.mjs
```

## Generic browser inventory

起動済みアプリに対して、project-specificなPlaywright codeなしでgeneric browser adapterがaction discoveryとsemantic state captureを行えます。

```bash
node scripts/web_browser_inventory.mjs http://127.0.0.1:3000 --json
```

locatorが曖昧な場合は`.first()`で推測せずdiagnosticへ倒します。target originは許可し、外部networkはdefault denyです。

## Semantic browser quiescence

Generic Browser Modeはready判定を`networkidle`へ依存させません。各action後に2 animation frame進め、DOM/form/URL/storageのsemantic fingerprintをsamplingし、観測可能なsame-origin requestを追跡したうえで、pending request=0かつ連続安定sampleを要求します。安定し続けないページは不透明なwait failureではなく`semantic_quiescence_timeout` diagnosticになります。

## Managed Chromium runtime

Generic Browser Modeはtarget projectのbrowser dependencyを使わず、Proped側でbrowser runtimeを所有します。現在はPlaywright 1.62.0 / Chromium revision 1234（Chromium 151.0.7922.34）をpinしています。target側にPlaywright dependencyは不要で、再現性のためruntime metadataをbrowser snapshotへ含めます。

## Strict Web execution sandbox

LinuxではWeb project stageをOS-enforcedなbubblewrap境界で実行できます。

```bash
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json \
  --strict-sandbox \
  --writable web/next-ssr-hydration/.next \
  --writable web/nuxt-ssr-hydration/.output
```

strict modeではoutbound networkをdenyし、repositoryと`.git`をread-only mountし、明示したbuild/artifact directoryだけwrite可能にし、private `/tmp`とallowlist済みenvironmentを使います。完全なfilesystem strict modeは現時点でLinux + bubblewrapを要求し、未対応platformではsilent downgradeせずfail-closedします。

## Web mutation品質ゲート

framework-neutralなWeb mutation benchmarkは、generic Web propertyごとにレビュー済みmutationを1件実行し、対応するhealthy controlも検証します。品質ゲートはmutation score、false-positive rate、deterministic replay、最小traceのずれ、throughput、elapsed timeの違反を機械可読codeで返します。

```bash
node scripts/test_web_mutation_benchmark.mjs
node scripts/test_web_mutation_benchmark.mjs --iterations 2000 --output .tmp/web-mutation
node scripts/test_web_mutation_benchmark.mjs --minimum-mutation-score 1 --maximum-false-positive-rate 0 --no-artifacts
```

不正な引数は終了コード`2`、品質ゲート違反は終了コード`1`で、完全な結果をstderrへJSON出力します。default実行は`protocol/out/web-mutation-benchmark/`へ`summary.json`、`atlas.json`、`atlas.html`、`atlas.svg`、`atlas.dot`を生成します。

## Web project runner

厳格なWeb project manifestから、generic property pack、mutation quality gate、React/Vue Component Mode、Playwright Browser Mode、cross-mode replay、Next.js/Nuxt SSRを依存順に1つのquality graphとして実行できます。

```bash
node scripts/web_project_runner.mjs validate web/project-manifests/proped-web-quality.json
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json
node scripts/web_project_runner.mjs run web/project-manifests/proped-web-quality.json --output .tmp/web-quality
```

runnerはshellを経由しません。manifest pathとstage cwdはrepository root外へescapeできません。stageのexit `1`はquality gate failure、exit `2`はusage error、その他のnon-zeroはexecution failureとして分類し、依存stageが失敗した後続stageはblockedになります。child processのnetwork、filesystem write、upstream write、credential制約はrunner内sandboxではなくcaller-enforcedであることを明示します。runner自身はmanifest/cwd/artifact pathをrepository内へ制限し、stage起動時にallowlist外の環境変数を引き継ぎません。

## 同梱demo

| ID | 出所 | 期待結果 | 検証内容 | 最小counterexample |
| --- | --- | --- | --- | --- |
| `newsletter` | project | pass | validation、consent、submit、reset | — |
| `rabbita-counter` | Rabbita `examples/counter` | pass | 有限counter状態空間 | — |
| `rabbita-todo` | Rabbita `examples/todo` | failure | CRUD、tab、filter、statistics | `TitleChanged(" ") -> Add` |
| `rabbita-sokoban` | Rabbita `examples/sokoban` | failure | move、crate、branch history、timeline | `Move(Up) -> JumpTo("not-a-number")` |
| `rabbita-subscriptions` | Rabbita `examples/subscriptions` | failure | timerと6種類のbrowser event subscription | `ToggleTicker -> Tick` |
| `rabbita-websocket` | Rabbita `examples/websocket` | failure | command client lifecycleとtranscript | `Connect -> Disconnect -> Disconnect` |

追加した実用runは、Sokoban 255 state・1,163 transition、subscriptions 640 state・1,718 transition、WebSocket 800 state・4,428 transitionを探索します。expected failureはproperty名と最小traceが宣言済みsignatureに一致した場合だけ成功扱いになります。

vendor source、revision、hash、license、adapter変更、failureの根拠は `src/vendor/`、[docs/VENDORED_DEMOS.md](docs/VENDORED_DEMOS.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記録しています。

## 外部Rabbitaアプリケーション

外部targetは `external/manifests/` のmanifestでrevisionとhashを固定します。`external inspect-source` はlocal source fileから `Model`、`Msg`、`update`、`view`、command、subscriptionの候補を機械検出します。upstreamのnetwork・native処理は実行せず、決定的なeffect descriptorとして記録します。`scripts/external_harness.py` はmanifest validation、単純な`Msg` payloadの有限action scaffold生成、決定的なsource hash report、明示的revision更新のpreview、network deny環境でのinspection command実行を提供します。

external campaignは15 runnable targetです。`canopy-editor-integration`は900 state・1,633 transitionでdocument callbackの逆順適用とunmount後配送を保持します。`rabbita-utility-batch`は公開10 repositoryを分類し、supported 4境界を3,400 state・7,646 transitionで機械探索して、初期空タイトル送信を`FullstackSubmit`へ縮約しました。`scripts/utility_batch.py`はcommit済み分類reportを検証し、upstreamへ書き込まずに固定checkoutを再確認できます。

`scripts/utility_batch.py validate` は分類reportとfixture hashを検証し、`scripts/utility_batch.py diff` は固定revisionと各upstream既定branchを比較してcommit数・変更対象path・更新後source hashをJSONで出力します。upstream側への書き込みは行いません。

Utility batchは初期空タイトル送信と古いtitleへのlate replyに加え、`IssuesSave -> IssuesSave -> IssuesDeliver(id=2) -> IssuesDeliver(id=1)`によるGraphSaved rollbackを保持します。

外部repositoryはread-only inputとして扱い、相手側へissue、PR、comment、commitを作成しません。`external handoff <id>`はissue、再現、fix plan、PR本文のローカル下書きだけを生成します。security-sensitive findingはpublic exportを拒否し、Gitでignoreされる `.private/disclosures/`へ隔離します。詳細は [docs/DISCLOSURE.ja.md](docs/DISCLOSURE.ja.md) を参照してください。

public runは `atlas.html`、`atlas.svg`、`atlas.json`、`atlas.dot`、`summary.json` を生成します。

## ライブラリモデル

```text
initial Model
  + actions(Model) -> Array[Msg]
  + update(Model, Msg) -> Model
  + view(Model) -> Html
  + Property<Model, Msg>
  + shrink(Msg) -> Array[Msg]
  + dependencies(Model) -> Array[String]
  = 検証済みの到達可能UI状態graph
```

`Machine::actions` は、そのmodelで有効なmessageだけを返します。Proped Rabbitaは型付きtransitionを実行し、各modelをbrowserなしでrenderし、状態・遷移propertyを検証して、失敗したaction列を最小化します。実用規模のrunでは、生成caseごとに同じfailureを繰り返さず、propertyごとに最短のcounterexampleだけを保持します。

```moonbit
let machine = rabbita_machine_with_action_id(
  initial_model,
  update,
  available_actions,
  shrink_msg,
  view,
  model_fingerprint,
  stable_action_id,
  describe_msg,
  dependencies_for,
)

let report = run(machine, properties, RunConfig::default())
let html = report_to_html(report)
let svg = report_to_flow_svg(report)
let json = report_to_json(report)
let dot = report_to_dot(report)
```

`RunReport` は、実際に使用したseed、探索上限、state、raw transition、構造化された最小failure trace、dependency、diagnosticを保持します。`affected_state_ids` は、指定した変更集合とdependency識別子が交差するstateを選択します。

## Core API

| API | 役割 |
| --- | --- |
| `Machine[Model, Msg]` | pure update、到達可能action、render、identity、shrink、dependency |
| `state_property` | modelとrendered HTMLを検証 |
| `transition_property` | before/message/after transitionを検証 |
| `run` | 検証済みdefaultによる決定的探索 |
| `run_checked` | 型付き設定エラーを返す探索 |
| `affected_state_ids` | 差分UI build対象を計画 |
| `report_to_html` | 単独で開けるstate Atlas |
| `report_to_flow_svg` | 単独graph |
| `report_to_json` | CI・agent向けreport |
| `report_to_dot` | Graphviz report |

## リポジトリ構成

```text
src/
  cli/                              CLIとmachine-readable command契約
  external/                         manifest検証、source検出、effect model
  examples/newsletter/              再利用可能なproject demo package
  vendor/rabbita_counter/           passするcounter baseline
  vendor/rabbita_todo/              blank title failure
  vendor/rabbita_sokoban/           malformed timeline failure
  vendor/rabbita_subscriptions/     stale timer failure
  vendor/rabbita_websocket/         duplicate disconnect failure
  vendor/proton_todo/               stale snapshot ordering failure
  vendor/ensenzu_app/               numeric form・SVG application adapter
  vendor/ensenzu_core/              固定したEnsenzu計算実装
  vendor/moonbit_editor_file_tree/  file tree resolve・auto-reveal adapter
  vendor/canopy_components/         resizable・menu・tabs finite adapter
  vendor/canopy_editor_integration/ CodeMirror lifecycle・browser replay adapter
  vendor/rabbita_utility_batch/     supported公開utility app batch
  vendor/incr_typed_spreadsheet/     worksheet UI・backdating adapter
  vendor/incr_typed_spreadsheet_core/ pinned worksheet実装
  vendor/isomorphic_suite/           Kanban・Todo・Note matrix adapter
  vendor/circular_state/              clean-room workspace・modal adapter
  core.mbt                          探索、shrink、最小failure保持
  rabbita_adapter.mbt               browserless Rabbita rendering
  atlas*.mbt                        report exporter
  flow*.mbt                         決定的graph layout
external/                            pinned external manifestとschema
```

## 開発

```bash
moon update
moon fmt --check
moon check --target native
moon test --target native
moon run src/cli -- demo run all --json
moon run src/cli -- external run all --json
```

Rabbita upstreamではserver-side rendererがexperimental扱いのため、`moon check` は `rabbita_adapter.mbt` から warning `0014` を出します。

## License

Proped Rabbita は Apache-2.0 です。vendorしたコードの帰属は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記録しています。
