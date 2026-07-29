# Proped Rabbita

[English](README.md) | 日本語

[Rabbita](https://github.com/moonbit-community/rabbita) 向けの、プロパティベースかつモデルベースの UI 検証と静的な状態グラフです。

Proped Rabbita は、次の要素を UI フレームワークの概念として扱います。

- 到達可能なアプリケーション状態
- 型付きのユーザー操作とシステム操作
- 状態と遷移のプロパティ
- 生成した操作トレース
- 失敗の自動縮約
- ブラウザを使わない Rabbita レンダリング
- HTML、JSON、Graphviz による静的な状態グラフ
- 依存関係にもとづく差分 UI ビルド

中核となるモデルは次のとおりです。

```text
initial Model
  + actions(Model) -> Array[Msg]
  + update(Model, Msg) -> Model
  + view(Model) -> Html
  + Property<Model, Msg>
  + shrink(Msg) -> Array[Msg]
  + dependencies(Model) -> Array[String]
  = verified reachable UI state graph
```

Proped Rabbita は、現在の状態で有効な操作をモデルから取得し、型付きの遷移を実行し、プロパティを検査し、失敗を再現可能なトレースへ縮約します。
各レンダリング済み状態に影響する入力も記録します。

## 現在のパッケージ

- バージョン：`0.1.0`
- 対応ターゲット：native、JS
- ライセンス：Apache-2.0

## 機能

### 到達可能状態の探索

`Machine::actions` は現在のモデルを受け取り、その状態で有効なメッセージだけを返します。
そのため、生成したトレースは到達可能な状態空間にとどまり、任意のフィールド値を組み合わせた状態を作りません。

### 状態と遷移のプロパティ

```moonbit
let properties : Array[Property[Model, Msg]] = [
  state_property("loading disables submit", fn(model, html) {
    if model.loading && !html.contains("disabled") {
      Fail("submit remained enabled")
    } else {
      Pass
    }
  }),
  transition_property("cancel restores persisted data", fn(before, msg, after) {
    match msg {
      Cancel if after.form != before.persisted => Fail("form was not restored")
      _ => Pass
    }
  }),
]
```

### 失敗の縮約

プロパティが失敗すると、Proped Rabbita はまずトレースから不要な操作を取り除き、次にメッセージごとの縮約器を適用します。
レポートには、生成時の操作列ではなく、縮約後の操作列が含まれます。縮約では評価済みトレースを記録し、`RunConfig.shrink_budget` を使うため、循環・重複・自己参照する候補も停止し、予算超過時は診断を残します。

### ブラウザを使わない Rabbita レンダリング

`rabbita_machine_with_action_id` は Rabbita のサーバーサイドレンダラーを使い、安定した操作 ID と表示ラベルを分離します。

```moonbit
let machine = rabbita_machine_with_action_id(
  initial_model,
  update,
  available_actions,
  shrink_msg,
  fn(model) { @rabbita.Val::constant(view(model)) },
  model_fingerprint,
  stable_action_id,
  describe_msg,
  fn(model) { dependencies_for(model) },
)
```

アダプターが各モデルを Rabbita のサーバーサイドレンダラーで描画するため、状態プロパティと構造プロパティを Playwright やブラウザなしで実行できます。

### 差分 UI ビルド

探索した各状態は、ソースファイル、fixture、スタイルシート、デザイントークンなどの安定した依存識別子を記録します。

```moonbit
let affected = affected_state_ids(report, [
  "theme/tokens.mbt",
  "components/button.mbt",
])
```

`affected_state_ids` は、記録済みの依存識別子と指定した識別子が重なる状態を返します。
呼び出し側は、その状態 ID を使って再レンダリングやプロパティ検査の対象を選べます。

## 最小例

```moonbit
enum Msg {
  Inc(Int)
  Reset
}

struct Model {
  count : Int
}

let machine : Machine[Model, Msg] = {
  initial: { count: 0 },
  update: fn(model, msg) {
    match msg {
      Inc(amount) => { count: model.count + amount }
      Reset => { count: 0 }
    }
  },
  actions: fn(model) {
    if model.count < 3 { [Inc(1), Inc(2)] } else { [Reset] }
  },
  shrink: fn(msg) {
    match msg {
      Inc(amount) if amount > 1 => [Inc(1)]
      _ => []
    }
  },
  render: fn(model) { "<button>\{model.count}</button>" },
  fingerprint: fn(model) { "counter:\{model.count}" },
  action_id: fn(msg) { msg.to_string() },
  describe_msg: fn(msg) { msg.to_string() },
  dependencies: fn(model) {
    if model.count == 0 {
      ["counter/view.mbt", "theme/base.css"]
    } else {
      ["counter/view.mbt"]
    }
  },
}

let properties : Array[Property[Model, Msg]] = [
  state_property("count is non-negative", fn(model, _) {
    if model.count >= 0 { Pass } else { Fail("negative count") }
  }),
]

let report = run(machine, properties, RunConfig::default())
let html_report = report_to_html(report)
let graph_json = report_to_json(report)
let graph_dot = report_to_dot(report)
let changed_states = affected_state_ids(report, ["theme/base.css"])
```

## 実行可能なデモ

ニュースレター登録フォームの一連の例をローカルで実行します。

```bash
moon run src/demo
```

生成される Flow Canvas の HTML/SVG 状態遷移グラフ、JSON、Graphviz DOT の出力は [demo/README.md](demo/README.md) を参照してください。

## API

### `Machine[Model, Msg]`

| フィールド | 役割 |
| --- | --- |
| `initial` | アプリケーションの初期モデル |
| `update` | 型付きの純粋な遷移関数 |
| `actions` | 現在のモデルで有効な操作候補 |
| `shrink` | メッセージのより小さい代表値を生成する縮約器 |
| `render` | ブラウザを使わない状態レンダラー |
| `fingerprint` | 状態の安定した識別子と重複排除キー。衝突は診断されます |
| `action_id` | replay とグラフの辺で使う機械可読な安定操作 ID |
| `describe_msg` | 人間向けのトレースラベル。ラベルは共有できます |
| `dependencies` | レンダリング済み状態に影響する安定した入力 |

### `Property[Model, Msg]`

プロパティは、レンダリング済み状態、遷移、その両方を検査できます。

- `state_property(name, check)`
- `transition_property(name, check)`

### レポートと差分ビルド

- `run`：状態を探索し、プロパティを評価し、レポートを生成する。seed、上限、PRNG 戦略、診断、schema version も保存する
- `run_checked`：`RunConfigError` を明示的に返す探索 API。`RunConfig::validate` は `cases >= 0`、`max_depth >= 0`、`max_states > 0`、`shrink_budget > 0` を検査する
- `affected_state_ids`：変更された依存識別子の影響を受ける状態を選ぶ

各 `FailureReport` は互換用の人間向け `trace` に加え、正確な `from`、`action_id`、ラベル、`to` を持つ `structured_trace` を保持します。Atlas の exporter は失敗辺の判定にこの構造化情報を使います。既存利用者は `rabbita_machine` をそのまま使えますが、この場合は互換性のため `describe_msg` が操作 ID にもなります。新しい Machine では `rabbita_machine_with_action_id`、または `Machine.action_id` と `Machine.describe_msg` の分離を使ってください。

### 出力形式

- `report_to_html`：外部依存のない静的な状態グラフ表示
- `report_to_json`：依存関係を含む CI 向けの機械可読レポート
- `report_to_dot`：Graphviz の遷移グラフ

## 検証できる動作

- 型付きモデルの遷移
- 到達可能状態の不変条件
- 遷移の不変条件
- 生成して再生できるトレース
- 縮約済みの失敗トレース
- 静的なレンダリング済み HTML
- 状態グラフと遷移グラフの構造
- 差分ビルドにおける状態単位の依存関係の影響

## アーキテクチャ

```text
proped-rabbita core
  ├─ state-machine runner
  ├─ property evaluation
  ├─ trace replay
  ├─ shrinking
  ├─ state dependency index
  ├─ differential-build planner
  └─ report model

Rabbita adapter
  └─ Model -> Val[Html] -> static HTML

状態グラフの出力
  ├─ HTML state-flow graph
  ├─ JSON graph
  └─ Graphviz DOT
```

## 開発

```bash
moon update
moon fmt --check
moon check --target native
moon test --target native
```

## ライセンス

Apache-2.0
