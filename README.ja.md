# Proped Rabbita

日本語 | [English](README.md)

Proped Rabbita は、Rabbita UI の到達可能状態を探索し、モデルと遷移のプロパティを検証し、失敗トレースを縮約して、決定的な HTML・SVG・JSON・Graphviz Atlas を出力します。

## CLIを実行する

```bash
moon run src/cli -- help
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

最後のコマンドは各デモを `demo/out/<demo-id>/` に出力し、stdout に1つのJSON結果を返します。

```json
{"ok":true,"command":"demo run","runs":[{"id":"newsletter","states":5,"failures":0},{"id":"rabbita-counter","states":7,"failures":0}]}
```

エージェントやスクリプトは `schema` を安定した探索入口として利用できます。

```bash
moon run src/cli -- schema --json
```

終了コードは、成功が `0`、引数エラーが `2`、プロパティ失敗が `3` です。`--json` は引数列の任意の位置に指定できます。`--output <dir>` で成果物のルートを変更できます。

完全なコマンド契約と出力契約は [docs/CLI.ja.md](docs/CLI.ja.md) にあります。

## 同梱デモ

| ID | 出所 | 検証内容 |
| --- | --- | --- |
| `newsletter` | プロジェクト内の例 | 入力検証、同意、送信、リセット、状態・遷移プロパティ |
| `rabbita-counter` | Rabbita公式exampleのvendor | upstreamの`Inc`・`Dec` semanticsを有限状態で探索 |

counter は upstream source と license を `src/vendor/rabbita_counter/` に保存し、revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357` に固定しています。adapter package は探索状態を `[-3, 3]` に制限し、決定的に終了させます。

各実行は次の成果物を生成します。

- `atlas.html` — 単独で開ける人間向け状態Atlas
- `atlas.svg` — 単独のFlow Canvasグラフ
- `atlas.json` — 完全な機械可読実行レポート
- `atlas.dot` — Graphviz遷移グラフ
- `summary.json` — 自動処理向けの簡潔なCLI結果

## ライブラリモデル

```text
initial Model
  + actions(Model) -> Array[Msg]
  + update(Model, Msg) -> Model
  + view(Model) -> Html
  + Property<Model, Msg>
  + shrink(Msg) -> Array[Msg]
  + dependencies(Model) -> Array[String]
  = 検証済みの到達可能UI状態グラフ
```

`Machine::actions` は、そのモデルで有効なメッセージだけを返します。Proped Rabbita は型付き遷移を実行し、各モデルをブラウザなしでrenderし、状態・遷移プロパティを検証して、失敗した操作列を最小化します。

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

`RunReport` は、実際に使用したseed、探索上限、状態、raw transition、構造化された失敗trace、依存関係、diagnosticを保持します。`affected_state_ids` は、指定された変更集合と依存識別子が交差する状態を選択します。

## Core API

| API | 役割 |
| --- | --- |
| `Machine[Model, Msg]` | pure update、到達可能action、render、identity、shrink、dependency |
| `state_property` | modelとrendered HTMLを検証 |
| `transition_property` | before/message/after遷移を検証 |
| `run` | 検証済みdefaultによる決定的探索 |
| `run_checked` | 型付き設定エラーを返す探索 |
| `affected_state_ids` | 差分UI build対象を計画 |
| `report_to_html` | 単独で開ける状態Atlas |
| `report_to_flow_svg` | 単独グラフ |
| `report_to_json` | CI・エージェント向けレポート |
| `report_to_dot` | Graphvizレポート |

## リポジトリ構成

```text
src/
  cli/                         CLIと機械可読コマンド契約
  examples/newsletter/         再利用可能なプロジェクトデモpackage
  vendor/rabbita_counter/      固定したupstream sourceとadapter
  core.mbt                     探索とshrink
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
