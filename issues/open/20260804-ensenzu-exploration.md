# Ensenzuの数値入力・reset・SVG整合性を探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `shiguri-01/ensenzu`

## 調査時revision

- `shiguri-01/ensenzu`: `f1fbec776a393e7023c8fa8324ea26c0774752e5`

## 主な対象path

- `app/src/app.mbt`

## Adapter方針

公開されている`AppParams`、`AppFields`、`Model`、`Msg`、update semanticsをnative adapterへ直接再利用する。Downloadだけeffect descriptorへ置換する。

## 最初に試すproperty仮説

- errorがあるstateで古いSVGを有効な最新結果として扱わない。
- `pending_input`と`error`と計算結果が矛盾しない。
- Reset/CancelResetは確認状態と入力値を正しく保つ。
- width/heightと電気定数がNaN、Infinity、非正値へ確定しない。
- InputSource切替後に非表示fieldのstale値を誤使用しない。
- advanced toggleは計算結果を変えない。

## 生成するaction・event

- Change for every FieldKey
- empty/space/partial number/0/-1/NaN-like/large/normal String
- ChangeInputSource
- RequestReset
- Reset
- CancelReset
- ToggleAdvanced
- Download

## 受け入れ条件

- [ ] 全FieldKeyを有限corpusで探索する。
- [ ] parse errorと成功の境界をshrinkできる。
- [ ] SVG/result/errorの整合propertyを追加する。
- [ ] reset関連failureがあれば3 action以下を目標に縮約する。

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
