# Selene editor frontendのasset・preview状態を探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbit-community/selene`

## 調査時revision

- `moonbit-community/selene`: `ca68f3a2898a80db9fc45ff96713d1531814371d`

## 主な対象path

- `selene-editor-frontend/frontend/app/update_main.mbt`
- `selene-editor-frontend/frontend/view_asset_panel.mbt`
- `selene-editor-frontend/frontend/view_shell.mbt`

## Adapter方針

editor frontendのmain updateとasset panel stateを抽出し、preview bridge・filesystem・engine eventをdescriptor化する。

## 最初に試すproperty仮説

- asset delete後の遅延preview eventが削除assetを復活させない。
- selectionは存在するasset/entityだけを指す。
- load failure後にloadingが残らない。
- preview connection lifecycleが逆行しない。
- duplicate engine eventでentityを二重追加しない。

## 生成するaction・event

- asset select/create/delete/rename
- preview connect/disconnect/event
- load success/failure
- panel open/close
- entity selection events

## 受け入れ条件

- [ ] asset panelを最初のbounded modelとして選ぶ。
- [ ] engine event fixtureをrecord/replay可能にする。
- [ ] selection referential integrity propertyを実装する。
- [ ] browser/WebGPU boundaryは対象外として明記する。

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
