# MoonBit Flow Canvas

[English](FLOW.md) | 日本語

Proped Rabbita に、React Flow 風の小さなグラフ基盤を MoonBit で追加しています。

初期実装はブラウザ非依存です。型付き Node／Edge、決定論的レイアウト、Viewport 状態、単一選択、直交 Edge routing、standalone SVG 出力を native／JS の両ターゲットで扱います。

## モデル

```moonbit
let nodes = [
  FlowNode::new("idle", "Idle", 0),
  FlowNode::new("ready", "Ready", 1),
]
let edges = [
  FlowEdge::new("submit", "idle", "ready", "Submit"),
]
let graph =
  FlowGraph::new(nodes, edges)
  |> layout_flow(_, FlowLayoutConfig::default())

let selected = select_flow_node(graph, "ready")
let fitted = fit_flow_view(selected, 1200, 720, 32)
let svg = flow_to_svg(fitted)
```

`FlowGraph` は次の情報を保持します。

- `nodes`：Node ID、表示名、rank、座標、サイズ、種別、選択状態、ドラッグ可否
- `edges`：接続元・接続先、表示名、種別、選択状態、renderer 非依存の route
- `viewport`：native と JS で共通利用する整数の pan／zoom 状態
- `selection`：未選択、Node 1件、Edge 1件

## Atlas Adapter

`RunReport` は直接 Flow Graph へ変換できます。

```moonbit
let graph = report_to_flow_graph(report)
let svg = report_to_flow_svg(report)
```

Adapter は状態の depth を layout rank に対応させ、初期状態、失敗状態、通常状態、自己遷移、失敗遷移を Node／Edge の意味的な kind に変換します。

## レイアウト境界

`layout_flow` は組み込みの決定論的 fallback です。Node を rank ごとの列に配置し、同一 rank 内で lane を割り当て、直交 route を生成します。

Flow Core は特定の layout engine に依存しません。後続 Adapter で `FlowGraph` を Diago、Dagre、ELK へ変換し、算出された座標と route を同じモデルへ戻せます。Atlas の公開 API を変更する必要はありません。

## 現在の対象

実装済み：

- 型付き Graph Model
- 決定論的 rank layout
- self-loop を含む直交 Edge routing
- pan、zoom、fit-view 状態
- Node／Edge 選択
- standalone SVG renderer
- `RunReport` Adapter
- native test

後続対象：

- Rabbita の pointer event を使う View
- interactive Node dragging
- connection handle と Graph 編集
- 複数選択
- minimap と controls
- Diago／Dagre／ELK Adapter

操作層を追加するときも、JavaScript 専用の別 Graph Model は作らず、同じ `FlowGraph` 状態を使います。
