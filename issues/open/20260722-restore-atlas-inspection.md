# Flow Canvas 化後の Atlas 調査機能を復活する

Status: open
Model: gpt-5.6-luna
Created: 2026-07-22
Updated: 2026-07-22
Branch: codex/feat/20260722-flow-canvas-demo

## 概要

Flow Canvas ベースの静的 Atlas への移行後も、状態遷移を調査するために有用な既存の選択・Inspector・多言語表示機能を復活する。実装方式は、着手時点の Flow Canvas と Rabbita の API に基づいて決定する。

## 背景

既存の `src/atlas_html.mbt` は、inline SVG と JavaScript により、ノード／エッジ選択、Rendered app の preview、Atlas metadata、関連 transition、property failure の詳細、英語／日本語の表示切り替えを提供していた。

Flow Canvas (`src/flow.mbt`、`src/flow_atlas.mbt`) は、`RunReport` から再利用可能な `FlowGraph` を構築し、静的 SVG を生成する。まず `src/demo` と `report_to_html` のグラフ描画を Flow Canvas に一本化するが、Flow Canvas の現行公開 API は静的 SVG が中心であり、旧 Atlas の調査 UI はそのまま移植しない。

関連:

- `issues/open/20260722-atlas-ui.md`
- `docs/FLOW.ja.md`
- `src/flow_atlas.mbt`
- `src/atlas_html.mbt`

## 問題

Flow Canvas 化により、静的 SVG だけでは次の既存機能が失われる。

- ノードまたはエッジを選択して表示を更新する操作
- 選択対象の Inspector
- 選択 state の rendered app preview
- state fingerprint、depth、dependencies などの metadata
- 選択 state に関連する incoming / outgoing transition
- property failure の名前、メッセージ、対象 state、minimized trace
- 英語／日本語の表示切り替え

これらを記録せずに旧 renderer を削除すると、状態グラフを目視することはできても、失敗した状態や遷移を人間向けに追跡しにくくなる。

## 目標

- Flow Canvas のグラフを起点に、状態・遷移の選択と調査を再び行えるようにする。
- 選択 state の rendered app と Atlas metadata を同じレポート内で確認できるようにする。
- 関連 transition、property failure、minimized trace を確認できるようにする。
- 英語と日本語を切り替えて主要な UI 文言を表示できるようにする。
- `RunReport`、`atlas.json`、`atlas.dot` の既存データ契約を不要に変更しない。

## 対象外

- この issue での Flow Canvas 静的 SVG 化そのもの。
- 実装方式を Rabbita の pointer-event view、inline JavaScript、その他の特定技術に固定すること。
- 英語と日本語以外の言語を追加すること。
- 汎用 i18n 基盤を新設すること。
- ノードドラッグ、ズーム、検索、ミニマップ、接続編集、multi-selection を追加すること。
- JSON または DOT のスキーマを変更すること。

## 提案する方針

1. 復活時点の `FlowGraph`、`RunReport`、Rabbita の利用可能な view/event API を確認し、旧 Atlas の機能を利用者向けの振る舞いとして分解する。
2. Flow Canvas の graph geometry と、Inspector・preview・metadata のレポート状態を重複管理しない構成を選ぶ。具体的な view 実装はこの調査後に決定する。
3. ノード／エッジ選択、関連 transition、property failure 表示、英語／日本語切り替えを最小の UI として復活する。
4. `atlas.html` の静的 SVG、`atlas.json`、`atlas.dot` の出力と互換性を確認し、必要な場合は機械向け成果物を変更せずに人間向け表示だけを拡張する。
5. 旧 `src/atlas_html.mbt` の独自 graph renderer をそのまま再導入するのではなく、復活後も Flow Canvas をグラフの基盤として利用できるかをレビューする。

## 受け入れ条件

- [ ] Atlas 上でノードとエッジを選択でき、選択対象が視覚的に分かる。
- [ ] 選択 state の rendered app preview、fingerprint、depth、dependencies を確認できる。
- [ ] 選択 state の incoming / outgoing transition を確認できる。
- [ ] property failure の名前、メッセージ、対象 state、minimized trace を確認できる。
- [ ] 英語と日本語を切り替えると主要な Atlas UI 文言が切り替わる。
- [ ] `atlas.json` の既存キー、raw action、states、transitions、failures が不要に変更されない。
- [ ] Flow Canvas の静的 SVG 出力と、復活した調査 UI の表示内容に状態・遷移の不一致がない。
- [ ] 初期状態、空の report、failure を含む report で上記機能が壊れない。

## テスト計画

- `moon fmt`
- `moon check --target native`
- `moon test --target native`
- `moon run demo`
- 生成された `demo/out/atlas.html` をブラウザで開き、ノード選択、エッジ選択、preview、metadata、関連 transition、failure trace、英語／日本語切り替えを手動確認する。
- `demo/out/atlas.json` を解析し、既存の `states`、`transitions`、`failures`、raw action が保持されていることを確認する。
- `git diff --check`
- `issues` の既存 Issue CLI が利用可能になった環境で `validate` を実行する。

## リスク

- Flow Canvas の SVG と調査 UI が別々の graph model を持つと、選択対象や遷移表示が不一致になる可能性がある。
- rendered app の HTML を preview に埋め込む場合、sandbox、サイズ、HTML のエスケープを維持する必要がある。
- 多言語文言を view に直接追加すると、将来の言語追加時に重複が増える可能性がある。
- 旧 UI の機能を一度に復活すると、静的 report の簡潔さや出力サイズを損なう可能性がある。

## 変更履歴

`CHANGES.md` impact: no

## 注記

- 2026-07-22: Flow Canvas 化に伴って失われる機能のうち、状態調査と多言語表示に有用なものだけを将来作業として記録した。
- 2026-07-22: 実装方式は YAGNI に従い固定せず、実装着手時の API と利用要件に基づいて決定する。
