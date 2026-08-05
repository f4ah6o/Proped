# Selene editor frontendのasset・preview状態を探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
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

- [x] asset panelを最初のbounded modelとして選ぶ。
- [x] engine event fixtureをrecord/replay可能にする。
- [x] selection referential integrity propertyを実装する。
- [x] browser/WebGPU boundaryは対象外として明記する。

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


## 実施結果

- `selene-editor-assets`を12番目のexternal targetとして追加した。
- revision `ca68f3a2898a80db9fc45ff96713d1531814371d`の8 source fixtureを保存し、combined SHA-256 `00a4443e3c035b2b089771584d7efe0ecbf42ff469eb2153f82880091804fbd2`を固定した。
- 920 state・2,098 transitionを探索し、2 failure・0 diagnosticsだった。
- primary failure `initialization installs each subscription once`を `Initialize -> Initialize`へ縮約した。
- second failure `older asset responses do not replace newer asset lists`を `AssetFileChanged -> AssetsLoaded(request=2, fixture=empty) -> AssetsLoaded(request=1, fixture=older)`へ縮約した。
- selected resource/entityの参照整合性と、削除済み・未知entityに対するpreview selection正規化はpassした。
- browser DOM、WebGPU、実filesystem、service SSE、preview engine実行は対象外とし、descriptor/event replay境界として明記した。
- upstream repositoryへのissue、PR、comment、commitは行っていない。
