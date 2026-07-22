# RabbitaアプリをvendorしてAtlasで解析するAdapter PoCを追加

Status: open
Model: unknown
Created: 2026-07-22
Updated: 2026-07-22
Branch: codex/feat/20260722-newsletter-atlas-demo

## 概要

外部のRabbitaアプリをソース付きでvendorし、薄いAdapterを介してProped Rabbitaの状態探索、プロパティ検証、Atlas出力へ接続できることを、代表例で検証する。

## 背景

Proped RabbitaのMVPは、`Machine[Model, Msg]`、`rabbita_machine`、browserless rendering、HTML/JSON/DOT exporterを提供する。一方、Rabbitaアプリをそのまま読み込んでActionや状態を自動抽出する機能はなく、現在の`demo/`はニュースレター登録フォーム専用である。

検証候補は次のとおりである。

- [Rabbita examples](https://github.com/moonbit-community/rabbita/tree/main/examples)：`counter`、`grocery`、`todo`、`sokoban`、`shiki_editor`、`websocket`など、複雑度の異なるアプリを含む。`counter`は最小の代表例として扱いやすい。
- [Rabbita website](https://github.com/moonbit-community/rabbita/tree/main/website)：`homepage`と`playground`を含む。`website/playground`はWarren、アセット生成、JS向けbuildを前提とするため、別のbuild境界を持つ候補である。

まずは[examples/counter](https://github.com/moonbit-community/rabbita/tree/main/examples/counter)を対象にし、外部アプリを解析するための最小契約を確立する。候補リポジトリのソースを複製する場合は、対象revision、ライセンス表示、依存関係を明示する。

## 問題

- vendorしたRabbitaアプリをProped Rabbitaのrunnerへ渡す標準的なAdapter境界がない。
- 任意のRabbitaアプリからAction候補、安定した状態fingerprint、依存関係を自動的に推測できる前提はまだ検証されていない。
- 外部API、WebSocket、時刻、乱数、ブラウザDOMなどの副作用があるアプリでは、決定的なbrowserless探索のためにmockまたは実行境界の定義が必要になる。
- ソースを解析するwhite-box方式と、ビルド済みサイトを操作するblack-box方式では、得られるAction名や状態の意味が異なる。

## 目標

- `examples/counter`のソースを固定revisionでvendorまたはfixture化し、Proped Rabbitaからビルドできるようにする。
- `initial state`、Action候補、状態更新、描画HTML、fingerprint、依存関係をAdapterでProped Rabbitaの既存`Machine`契約へ接続する。
- Adapterを通じた探索結果から、状態グラフ、遷移、JSON/DOT/HTML Atlasを生成する。
- Atlas上で、vendor対象の状態と遷移が現在のニュースレターdemoと同じ人間向け・機械向け出力規約で確認できるようにする。
- 任意のRabbitaアプリを完全自動解析するのではなく、明示的なAdapterを実装すれば解析できるという最小の拡張点を文書化する。

## 対象外

- 初回実装でRabbitaの任意アプリを無変更のまま自動解析すること。
- `examples`内の全アプリを同時にvendorし、個別のActionモデルや副作用を解決すること。
- `website/homepage`または`website/playground`を初回の実行対象に含めること。これらはWarren、アセット生成、JS buildの評価が必要な後続候補とする。
- ビルド済みHTML/JavaScriptだけを対象に、元の型付きModelやActionを復元すること。
- 外部API、WebSocket、永続化、時刻、乱数を実環境へ接続したまま探索すること。
- ブラウザでのCSSレイアウト、フォーカス、IME、スクロール、アニメーションの検証。必要な場合は既存のbrowser adapter構想で別途扱う。

## 提案する方針

1. Upstreamの`examples/counter`を対象revisionとライセンス情報付きでvendorする方法を決め、生成物、依存キャッシュ、Warrenの出力をGit管理対象から除外する。
2. `AtlasApp`相当の薄いAdapter契約を定義する。少なくとも初期状態、現在状態からのAction候補、Action適用、HTML rendering、状態fingerprint、Actionの説明、依存識別子を扱う。
3. Adapterの内部では既存の`Machine`および`rabbita_machine`を利用し、runnerやreport/exporterのデータ形式を変更しない。
4. `counter`の増加・リセットなど、実際のアプリに存在するActionだけを候補として返し、到達可能状態を探索する。Action列挙が自動化できない部分はAdapterの責務として明示する。
5. `moon run`からvendor fixtureの探索とAtlas生成を再現できる実行手順を追加する。既存のニュースレターdemoの実行結果と混同しない出力先またはfixture名を使用する。
6. `examples`の他の候補を、純粋な状態遷移、ブラウザ依存、外部I/O依存の観点で分類し、次のAdapter実装候補を注記する。

## 受け入れ条件

- [ ] `examples/counter`の対象revision、vendor方法、ライセンス情報、依存関係がリポジトリ内に記録されている。
- [ ] vendorしたcounterアプリをProped RabbitaのAdapter経由でnative targetからビルド・実行できる。
- [ ] Adapter経由で初期状態、増加、リセットを含む到達可能状態と遷移が探索される。
- [ ] Adapter経由の探索結果からHTML、JSON、DOTのAtlasが生成され、状態fingerprintとraw Action値が確認できる。
- [ ] `Machine`、`RunReport`、JSON/DOTの既存公開契約に不要な変更がない。
- [ ] Adapter方式の制約（Action列挙、外部I/O、black-box解析との差異）がREADMEまたは関連ドキュメントに記載されている。
- [ ] `examples`内の追加候補と`website/playground`を、次の検証対象として分類した結果が注記またはドキュメントに残っている。

## テスト計画

- `moon fmt`
- `moon check --target native`
- `moon test --target native`
- vendor fixtureを対象にした`moon run`コマンド
- 生成されたJSONを解析し、状態、遷移、raw Action値、property failuresを確認する。
- 生成されたHTMLをブラウザで開き、グラフ、選択状態、描画HTML、Atlas metadataを確認する。
- `git diff --check`および既存Issue CLIの`validate`

## リスク

- upstreamの構成変更やrevision更新により、vendorソースとAdapterの追従が必要になる。
- Rabbita examplesのライセンス・著作権表示を欠落させると再配布上の問題になる。
- `counter`だけでは、非同期処理、WebSocket、DOM依存、複雑なAction空間に対する適用可能性を証明できない。
- vendorソースと既存module依存を混在させると、名前衝突やMoonBit package境界の問題が発生する可能性がある。
- 外部I/Oをmockしない場合、探索結果が非決定的になり、Atlasの差分やproperty結果が不安定になる。

## 変更履歴

`CHANGES.md` impact: yes

項目案：

- Add a vendor-based Rabbita adapter example for exploring external application state in Atlas.

## 注記

- 2026-07-22: 候補比較の結果、最初の実行対象を最小構成の`examples/counter`とした。`examples`の他アプリおよび`website/playground`は複雑度・build境界の評価後に拡張する。
