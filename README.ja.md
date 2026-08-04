# Proped Rabbita

日本語 | [English](README.md)

Proped Rabbita は、Rabbita UI の到達可能状態を探索し、モデルと遷移のプロパティを検証し、failure traceを縮約して、決定的なHTML・SVG・JSON・Graphviz Atlasを出力します。

## CLIを実行する

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

最後のcommandは各demoを `demo/out/<demo-id>/` に出力し、stdoutへ1つのJSON result envelopeを返します。エージェントやscriptは次のcommandから安定した契約を取得します。

```bash
moon run src/cli -- schema --json
```

終了コードは、各demoが宣言した期待結果と一致した場合が `0`、引数エラーが `2`、期待結果との不一致が `3` です。`--json` は引数列の任意の位置に指定でき、`--output <dir>` でartifact rootを変更できます。

完全なcommand・output契約は [docs/CLI.ja.md](docs/CLI.ja.md) にあります。

## 同梱demo

| ID | 出所 | 期待結果 | 検証内容 |
| --- | --- | --- | --- |
| `newsletter` | プロジェクト内の例 | pass | 入力検証、同意、送信、reset、状態・遷移property |
| `rabbita-counter` | Rabbita公式exampleのvendor | pass | upstreamの`Inc`・`Dec` semanticsを有限状態で探索 |
| `rabbita-todo` | Rabbita公式exampleのvendor | failure | add/delete/toggle/tabを含む実用規模探索と最小counterexample縮約 |

TODO demoは固定した決定的設定で169状態・2,251 transitionを探索します。upstream実装が空白だけのtitleを受け付けるbehaviorを検出し、failureを次の2 actionまで縮約します。

```text
TitleChanged(" ")
Add
```

CLIはこれを期待済みfailureとして扱い、`firstFailure` にproperty、message、state ID、trace長、人間向けtrace、stable action IDを出力します。

vendorしたsource、revision、hash、license、adapter変更点は `src/vendor/`、[docs/VENDORED_DEMOS.md](docs/VENDORED_DEMOS.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記録しています。

各実行は次のartifactを生成します。

- `atlas.html` — 単独で開ける人間向けstate Atlas
- `atlas.svg` — 単独のFlow Canvas graph
- `atlas.json` — 完全なmachine-readable run report
- `atlas.dot` — Graphviz transition graph
- `summary.json` — 最初の最小failureを含む簡潔なCLI result

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
  cli/                         CLIとmachine-readable command契約
  examples/newsletter/         再利用可能なproject demo package
  vendor/rabbita_counter/      固定したcounter sourceとadapter
  vendor/rabbita_todo/         固定した実用TODO sourceとadapter
  core.mbt                     探索、shrink、最小failure保持
  rabbita_adapter.mbt          browserless Rabbita rendering
  atlas*.mbt                   report exporter
  flow*.mbt                    決定的graph layout
```

## 開発

```bash
moon update
moon fmt --check
moon check --target native
moon test --target native
moon run src/cli -- demo run all --json
```

Rabbita upstreamではserver-side rendererがexperimental扱いのため、`moon check` は `rabbita_adapter.mbt` から warning `0014` を出します。

## License

Proped Rabbita は Apache-2.0 です。vendorしたコードの帰属は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記録しています。
