# OpenSeekのdesktop frontend・session・terminalを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
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

- [ ] submodelを3件以上選びadapter化する。
- [ ] session/request correlationをmanifestで宣言する。
- [ ] stale event permutationを探索する。
- [ ] root integrationはstate explosion計測後に実施する。

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
