# READMEから将来候補と検証範囲を分離する

Status: closed
Model: unknown
Created: 2026-07-22
Updated: 2026-08-04
Branch: codex/docs/20260722-current-readme

## 概要

README に混在していた将来候補と検証範囲を、現在の実装説明から分離して管理する。
候補ごとの実装判断と検証範囲をこの issue に集約し、実装時には独立した issue へ切り出す。

## 背景

Proped Rabbita には、`Machine`、`Property`、状態空間の探索、失敗トレースの縮約、Rabbita のサーバーサイドレンダリング、HTML/JSON/DOT exporter、明示的な依存識別子による状態選択が実装されている。

変更前の README には、実装済みの API と、Warren 連携、ブラウザ検証、追加の生成器や shrinker、状態グラフ viewer などの将来候補が同じ文書に記載されていた。

## 問題

- README の現在の機能説明と将来候補を同時に読む必要があり、利用者が現時点の利用方法を特定しにくい。
- 実装候補が個別の目的、依存関係、検証範囲に分かれていない。
- ブラウザを使わない状態検証と、ブラウザ固有のレイアウトや入力動作の検証が同じ説明に並んでいる。
- Warren または MoonBit のビルドグラフからの依存関係自動抽出と、現在の明示的な依存識別子の指定が区別されていない。

## 目標

- README.md と README.ja.md は、現在実装されている機能、API、実行方法だけを記載する。
- README から分離した実装候補と検証範囲を、この issue で追跡できる状態にする。
- 各候補の実装に着手する前に、独立した受け入れ条件とテスト計画を持つ issue へ分割できるようにする。

## 対象外

- この issue で候補機能を実装すること。
- `Machine`、`Property`、`RunReport`、HTML/JSON/DOT exporter の公開契約を変更すること。
- 実装時期、リリース順序、対応バージョンを決定すること。
- README に将来計画や検証対象外の一覧を再掲載すること。

## 提案する方針

次の候補を、実装候補と検証範囲に分けて管理する。

### 実装候補

- 重み付き操作生成と決定的な PRNG 状態
- 成功、失敗、タイムアウト、キャンセル結果を扱う command interpreter
- モデルと fixture の shrinker
- Warren または MoonBit のビルドグラフとの依存メタデータ連携
- HTML、JSON、DOT artifact の書き出しと差分更新を行う Warren command
- 選択した状態を対象にするブラウザアダプター
- 状態グラフを操作する無限キャンバス型 viewer

### 検証範囲

- 任意の Rabbita コンポーネントから状態や操作を自動抽出する経路
- CSS レイアウト、テキスト折り返し、実フォント、画像寸法
- focus、selection、IME、clipboard、drag-and-drop、scrolling
- hover、media query、animation、ブラウザエンジン差異
- 外部 I/O、WebSocket、時刻、乱数、ブラウザ DOM を含むアプリケーションの決定的な探索

候補を実装する場合は、対象範囲、既存 API との関係、決定性、生成物、互換性を個別 issue に記録する。

## 受け入れ条件

- [x] README.md に現在の実装と将来候補を区別するための MVP、Phase、Roadmap、Future、未対応機能の列挙がない。
- [x] README.ja.md が README.md と同じ現在の機能範囲を記載している。
- [x] 上記の実装候補が、重複なくこの issue で確認できる。
- [x] ブラウザ固有の検証範囲が、状態検証や静的 HTML 生成の説明と区別されている。
- [x] Warren 連携と明示的な依存識別子による現在の状態選択が別の項目として記載されている。
- [x] 各実装候補の着手時に、独立した受け入れ条件とテスト計画を持つ issue を作成できる。

## テスト計画

- `git diff --check` を実行する。
- README.md と README.ja.md に MVP、Phase、Roadmap、Future、`What still requires` がないことを検索する。
- README.md と README.ja.md の見出し、コード例、API 項目、リンクを比較する。
- `python3 /home/hirohito-fujita/.codex/skills/issues/scripts/local_issues.py --repository-root . --path issues/open/20260722-readme-current-state.md validate` を実行する。

## リスク

- 候補を一つの issue に集約すると、実装着手時に依存関係の調査が不足したまま分割される可能性がある。
- README と README.ja.md の更新時期がずれると、現在の機能範囲の説明が一致しなくなる。
- ブラウザアダプターの対象範囲を広く取りすぎると、状態検証とブラウザ検証の責務が再び混在する。
- Warren 連携を実装する場合、明示的な依存識別子を使う現在の API と、ビルドグラフ由来の識別子の対応を定義する必要がある。

## 変更履歴

`CHANGES.md` impact: no

## 注記

- 2026-07-22: README の現在位置を実装済み機能と利用方法に限定し、将来候補と検証範囲をこの issue に分離した。

- 2026-08-04: English and Japanese READMEs now describe only implemented behavior and link future work to issues; issue closed.
