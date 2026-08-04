# Canopy・incrのeditor componentとincremental UIを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `dowdiness/canopy`
- `dowdiness/incr`

## 調査時revision

- `dowdiness/canopy`: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- `dowdiness/incr`: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`

## 主な対象path

- `examples/resizable/main/client.mbt`
- `examples/codemirror/main/client.mbt`
- `modules/rabbita-resizable/`
- `modules/rabbita-menu/`
- `modules/rabbita-tabs/`
- `modules/rabbita-context-menu/`
- `apps/ideal/main/update.mbt`
- `examples/typed_spreadsheet_rabbita_demo/`

## Adapter方針

component単位のpure modelから開始し、pointer/keyboard/CodeMirror commandをsynthetic eventへ置換する。editor本体はcomponent failureが安定してから段階的に取り込む。

## 最初に試すproperty仮説

- resize後もmin/max constraintを破らない。
- drag終了後のstale pointer moveでsizeが変化しない。
- menu close後にactive submenuまたはfocus indexが残らない。
- disabled tab/menu itemへselectionが移らない。
- CodeMirror mount前後のchange eventでmodelとeditor内容が循環更新しない。
- typed spreadsheetのdependency updateが決定的である。

## 生成するaction・event

- pointer down/move/up/cancel
- arrow key resize
- menu open/close/next/previous/select
- tab select/remove
- editor mount/change/unmount
- spreadsheet cell edit/recompute

## 受け入れ条件

- [ ] resizable、menu、tabsの3 componentを先にadapter化する。
- [ ] componentごとにgeneric accessibility/state propertyを実行する。
- [ ] editor本体を別phaseとして記録する。
- [ ] always-false Eqなど探索へ影響する特殊実装をreportする。

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
