# OpenSeekのdesktop frontend・session・terminalを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbitlang/openseek`

## 調査時revision

- `moonbitlang/openseek`: `b21e078a4f3cdd11129b4d33348dcc09abf22026`

## 主な対象path

- `desktop/frontend/boot.mbt`
- `desktop/frontend/update.mbt`
- `desktop/frontend/transcript/runtime_update.mbt`
- `desktop/frontend/terminal/update.mbt`
- `desktop/frontend/fileeditor/update.mbt`
- `cmd/viz_app/app.mbt`

## Adapter方針

desktop bridge、terminal、agent eventをeffect descriptorへ置換する。root updateをいきなり全探索せず、transcript、terminal、file editorのsubmodelから開始する。

## 最初に試すproperty仮説

- session switch後の古いagent eventを別sessionへ適用しない。
- terminal close後のoutput eventでterminalを復活させない。
- file save responseがより新しいeditを上書きしない。
- Initの重複dispatchでresourceを二重作成しない。
- self-update state machineが逆行しない。
- transcript orderとmessage IDが矛盾しない。

## 生成するaction・event

- Init
- session create/select/close
- agent event success/error
- terminal open/output/close
- file edit/save response
- bridge disconnect/reconnect
- self-update stage events

## 受け入れ条件

- [x] self-update、terminal、file editorの3 submodelをadapter化した。
- [x] update channel、terminal open request、file owner/path request correlationをmanifestで宣言した。
- [x] provider切替後のupdate reply、duplicate EmulatorReady、file read逆順を探索した。
- [x] bounded integrationが2,600 state上限へ到達したため、root全体統合は明示的に対象外とした。


## 実施結果

- target: `openseek-desktop-lifecycle`
- explored: 2,600 states / 5,615 transitions
- failures: 3
- diagnostics: 0
- primary failure: `ProviderChanged(staging) -> UpdateCheckFinished(request=1, channel=production, result=found, explicit=false)`
- terminal failure: `ToggleTerminal -> EmulatorReady(key=1, cols=80, rows=24) -> EmulatorReady(key=1, cols=80, rows=24)`
- file failure: `FileSelected("src/main.mbt") -> FileSelected("src/main.mbt") -> FileLoaded(request=3, fixture=newer) -> FileLoaded(request=2, fixture=older)`
- combined source SHA-256: `f649bdad2293cacc60f752eb422d4c744e54fad58027d4e903dc6b0316bc214b`

upstream package全体は、resolved `moonbitlang/editor`の旧`Repr` constructor APIにより現在のcompilerでbuildできなかった。これはsource-level findingとは分離して記録し、固定sourceとclean-room adapterの検証は完了した。upstreamへの書き込みは行っていない。

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
