# Proped Rabbita

日本語 | [English](README.md)

Proped Rabbita は、Rabbita UI の到達可能状態を探索し、モデルと遷移のプロパティを検証し、failure traceを縮約して、決定的なHTML・SVG・JSON・Graphviz Atlasを出力します。

## CLIを実行する

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
moon run src/cli -- external inspect-source src/vendor/ensenzu_app/upstream/app.mbt.txt --json
moon run src/cli -- external run all --json
```

`demo run all` は各demoを `demo/out/<demo-id>/` に、`external run all` は外部targetを `demo/out/external/<id>/` に出力します。どちらもstdoutへ1つのJSON result envelopeを返します。エージェントやscriptは次のcommandから安定した契約を取得します。

```bash
moon run src/cli -- schema --json
```

終了コードは、各demoが宣言した期待結果と一致した場合が `0`、引数エラーが `2`、期待結果との不一致が `3` です。`--json` は引数列の任意の位置に指定でき、`--output <dir>` でartifact rootを変更できます。

完全なcommand・output契約は [docs/CLI.ja.md](docs/CLI.ja.md) にあります。

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

外部targetは `external/manifests/` のmanifestでrevisionとhashを固定します。`external inspect-source` はlocal source fileから `Model`、`Msg`、`update`、`view`、command、subscriptionの候補を機械検出します。upstreamのnetwork・native処理は実行せず、決定的なeffect descriptorとして記録します。

external campaignには `proton-demo-todo`、`ensenzu-app`、`signal-reader` が含まれます。Signal Readerは720 state・1,265 transitionを探索し、feed切替、live search、saved optimistic updateの3種類のresponse-order failureを保持します。primary traceは `SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)` です。

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
