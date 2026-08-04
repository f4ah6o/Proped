# Isomorphic application suiteを横断探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbit-community/isomorphic`

## 調査時revision

- `moonbit-community/isomorphic`: `590ac1c4de71050419cc6643942e0d1f181301aa`

## 主な対象path

- `kanban/frontend/`
- `todoapp/frontend/`
- `noteapp/frontend/`
- `pollapp/frontend/`
- `blogapp/frontend/`
- `finapp/frontend/`
- `gallery/frontend/`
- `contacts/frontend/`
- `taskflow/frontend/`
- `spreadsheet/frontend/`
- `nodegraph/frontend/`
- `compose/frontend/`

## Adapter方針

suite共通のRabbita wrapperとapp-specific modelを分離し、共通effect interpreterで複数appをmatrix実行する。まずKanban、Todo、Noteの3件から始める。

## 最初に試すproperty仮説

- Kanban card/column IDの参照整合性。
- delete/rename/moveの重複操作安全性。
- Todo/Noteのstale load response。
- Poll vote countが負にならない。
- Finance amountと集計が一致する。
- Spreadsheet/Nodegraphのdependency cycle処理がterminationする。
- compose nested stateの親子同期が決定的である。

## 生成するaction・event

- appごとのCRUD messages
- load/save success/failure/stale
- move/reorder
- filter/select/modal
- small graph/spreadsheet edits

## 受け入れ条件

- [ ] 最低3 appを同じharnessで実行する。
- [ ] 共通manifest templateを作る。
- [ ] app固有propertyと共通CRUD propertyを分離する。
- [ ] 残りappをchecklistで順次追加する。

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
