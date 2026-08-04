# Circularのlocal-first project stateを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `CAIMEOX/circular`

## 調査時revision

- `CAIMEOX/circular`: `bf8549a9c13505f3dc5632347acfffbba864c406`

## 主な対象path

- `web/app.mbt`
- `web/updater/update.mbt`
- `web/state/`
- `web/task/`
- `web/modal/`
- `web/focus/`

## Adapter方針

dispatcher chainをsub-handler単位に分け、storage/navigation/markdown sync commandをdescriptor化する。local-first mergeやfocus/modalのpure stateを優先する。

## 最初に試すproperty仮説

- handler chainで未知Msgが意図せずstateを変えない。
- task delete後にfocus/modalがdangling taskを参照しない。
- markdown syncの遅延responseが新しいeditを上書きしない。
- modal close後にform draftとfocus stateが矛盾しない。
- route transition後にworkspace-local stateが漏れない。

## 生成するaction・event

- system/workspace/view/modal/focus/form messages
- task create/edit/delete
- modal open/close/confirm
- focus movement
- sync success/failure/stale

## 受け入れ条件

- [ ] handler categoryごとのcoverageをreportする。
- [ ] referential integrity propertyを追加する。
- [ ] unknown/no-op Msgのstate preservationを確認する。
- [ ] license不明のためsource vendor可否を実装前に確認する。

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
