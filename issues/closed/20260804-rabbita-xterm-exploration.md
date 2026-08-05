# Rabbita xterm bindingのterminal lifecycleを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbit-community/rabbita_xterm`

## 調査時revision

- `moonbit-community/rabbita_xterm`: `9734f6a39ce3899dbf6738fa3a100c2cebaefc23`

## 主な対象path

- `examples/web/`
- `src/`

## Adapter方針

xterm.js boundaryをmock terminal descriptorへ置換し、mount、write、resize、input subscription、disposeをstate machineとして探索する。

## 最初に試すproperty仮説

- dispose後にwrite/resize/input callbackを適用しない。
- mountを重複実行してterminal instanceを二重作成しない。
- resize dimensionが非正値にならない。
- UTF-8 chunk境界でinput/outputが破損しない。
- subscription解除後にstale inputをdispatchしない。

## 生成するaction・event

- mount/dispose
- write text/bytes/chunks
- resize boundary values
- input callback
- focus/blur if exposed
- duplicate/stale native events

## 受け入れ条件

- [x] native mockでlifecycleを探索する。
- [x] UTF-8 corpusを含める。
- [x] dispose idempotency propertyを追加する。
- [x] 実browser確認は別E2Eとして分離する。

## 共通テスト

- pinned source hash validation
- adapter build and unit tests
- deterministic exploration rerun
- exact expected-failure signatureまたはzero-failure assertion
- HTML/JSON/SVG/DOT artifact確認
- `git diff --check`

## 注記

upstreamの実装上の事実と、非同期・browser boundaryを再現するためのtest harness仮定をreportで分離する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped


## 実装結果

- managed `State::update` とsubscription lifecycleをnative generation modelへ置換した。
- load、mount、Data/Resized/TitleChanged callback、UTF-8 write、theme、dispose、stale callbackを有限探索した。
- 133 state・2,295 transitionを探索し、`terminal dimensions remain positive` を `Resize(cols=0, rows=24)` の1 actionへ縮約した。
- mount単発、dispose idempotency、stale callback無視、UTF-8 chunk保持、render整合性はpassした。
- browser/xterm.js実体は実行せず、別E2E境界として維持した。
