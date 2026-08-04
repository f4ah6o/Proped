# ニュースレター登録フォームの実行可能な atlas PoC を追加

Status: closed
Model: unknown
Created: 2026-07-22
Updated: 2026-08-04
Branch: codex/feat/20260722-newsletter-atlas-demo

## 概要

Rabbita の状態遷移、プロパティ検証、browserless rendering、HTML/JSON/DOT atlas 出力をローカルで一通り確認できる実行可能なニュースレター登録フォーム PoC を追加する。

## 背景

Proped Rabbita には `Machine`、`Property`、`run`、atlas exporter、`rabbita_machine` が実装されているが、これらを同時に実行して成果物を確認できる `demo/` パッケージはまだ存在しない。

Rabbita 0.13.1 の `render_to_string` は `Experimental API` として alert を発する。今回の PoC ではこの warning を抑制せず、実験的 API を使用している事実を残す。

## 問題

利用者がライブラリの状態空間探索、Rabbita の HTML レンダリング、プロパティ評価、静的 atlas 生成をローカルで再現するための最短経路がない。

## 目標

- `moon run demo` で決定的なニュースレター登録フォームの状態空間を探索する。
- Rabbita の `@html` 要素を `rabbita_machine` 経由で静的 HTML にレンダリングする。
- モデル不変条件、レンダリング結果、Reset 遷移をプロパティとして検証する。
- `demo/out/atlas.html`、`demo/out/atlas.json`、`demo/out/atlas.dot` を生成する。
- 実行手順を `demo/README.md` に記載し、ルート README から参照できるようにする。

## 対象外

- ブラウザを使ったレイアウト、フォーカス、IME、スクロール、アニメーション検証。
- `render_to_string` の安定 API への置き換えや alert warning の無効化。
- 意図的な失敗プロパティをデフォルト atlas に含めること。
- 自動依存抽出、Warren 連携、永続キャッシュ、production 用 CLI の追加。

## 提案する方針

- `demo/` に native 専用の `moon.pkg` と実行エントリポイントを追加する。
- ファイル出力には `moonbitlang/async` の `async/fs` を使用し、必要な依存を `moon.mod` に追加する。core 本体の API 依存は変更しない。
- モデルは `email : String`、`consented : Bool`、`submitted : Bool` とし、フォームの表示状態はこれらの値から導出する。
- アクションは `SetEmail("")`、`SetEmail("alice@example.com")`、`ToggleConsent`、`Submit`、`Reset` とし、`Submit` は有効なメールアドレスかつ同意済みの場合だけ候補にする。
- プロパティは、送信済み状態のモデル不変条件、送信済み HTML の確認メッセージ、Reset 後の初期状態復元を検証する。
- `run` のレポートから既存の `report_to_html`、`report_to_json`、`report_to_dot` を呼び出し、`demo/out/` に生成する。生成物は Git 管理対象外にする。
- `moonbit-agent-guide` に従い、package 境界を守り、`moon check`、`moon test`、`moon fmt`、`moon info` で検証する。

## 受け入れ条件

- [x] `moon run demo` が native target で成功し、`demo/out/atlas.html`、`demo/out/atlas.json`、`demo/out/atlas.dot` が生成される。
- [x] 生成レポートに Empty、Invalid、Ready、Submitted に対応する到達可能状態と遷移が含まれる。
- [x] デフォルト実行の property failures が 0 件である。
- [x] Rabbita の `@html` と `rabbita_machine` を通した HTML が atlas に含まれる。
- [x] `demo/README.md` に実行方法、生成物、確認方法が記載され、ルート README から参照できる。
- [x] `moon check --target native` と `moon test --target native` がエラーなしで完了する。`render_to_string` に由来する warning 0014 は抑制しない。
- [x] `demo/out/` が Git の変更として扱われない。

## テスト計画

- `moon update`
- `moon fmt`
- `moon check --target native`
- `moon test --target native`
- `moon run demo`
- 生成された HTML をブラウザで開き、状態カード、遷移、property 結果を手動確認する。
- JSON が `states`、`transitions`、`failures` を含み、DOT が `digraph ui_states` から始まることを確認する。

## リスク

- atlas の生成は native filesystem API に依存するため、demo パッケージは native 専用になる。
- Rabbita の `render_to_string` は実験的 API のため、`moon check` と `moon test` に warning 0014 が残る。
- `demo/out/` は生成物であり、実行結果の差分はレビュー対象にしない。
- async 依存のバージョンや API が更新された場合、demo のファイル出力実装に追従が必要になる。

## 変更履歴

`CHANGES.md` impact: no

## 注記

実装ブランチ: `codex/feat/20260722-newsletter-atlas-demo`

検証結果: `moon fmt --check`、`moon check --target all`、`moon test --target native`、`moon run demo`、JSON parse を実行済み。すべて成功し、warning 0014 のみ残る。

- 2026-08-04: The newsletter flow was migrated into a reusable package and exposed through the CLI; issue closed.
