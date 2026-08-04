# Ensenzuの数値入力・reset・SVG整合性を探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
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

- [x] 全FieldKeyを有限corpusで探索する。
- [x] parse errorと成功の境界をshrinkできる。
- [x] SVG/result/errorの整合propertyを追加する。
- [x] reset pathを検証し、reset関連failureがないことを確認した。


## 結果

- `Frequency`へ`Infinity`を入力すると、`pending_input=false`、`error=None`の有効stateとして受理された。
- 最小trace: `Change(Frequency, "Infinity")`
- stable action ID: `change:Frequency:8:Infinity`
- 探索規模: 834 states / 1,900 transitions / 1 retained failure / 0 diagnostics
- 全19 `FieldKey`について、空、partial、zero、negative、finite、`NaN`、`Infinity`を含む有限corpusを生成した。
- invalid/pending inputのprevious SVG保持、reset/cancel、advanced toggle、download effect identityはpassした。
- upstream repositoryはread-onlyで扱い、issue・PR・comment・commitを作成していない。

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
