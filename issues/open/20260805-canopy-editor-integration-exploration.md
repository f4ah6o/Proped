# Canopy editor・CodeMirror integrationを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P2
Depends-On: `20260804-mechanical-external-app-harness.md`
Split-From: `20260804-canopy-and-incr-exploration.md`

## 対象

- `dowdiness/canopy`

## 調査時revision

- `dowdiness/canopy`: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`

## 主な対象path

- `modules/rabbita_codemirror/`
- `examples/codemirror/main/client.mbt`
- `apps/ideal/main/update_codemirror.mbt`
- `apps/ideal/main/ui/`
- `modules/rabbita-context-menu/`

## Adapter方針

`canopy-components`でpureなresizable/menu/tabs boundaryを先に固定した。次phaseではCodeMirror mount/change/unmount、selection、document revision、context-menu focusをsynthetic editor commandへ置換する。DOM selectionやfocusをpure stateと偽装せず、必要ならbrowser-replay adapterを使用する。

## 最初に試すproperty仮説

- mount前後のchange eventでmodel/editor内容が循環更新しない。
- unmount後のstale editor callbackを適用しない。
- document revisionが古いchangeでrollbackしない。
- context menu close後にsubmenu/focus stateが再表示されない。
- editor selectionとactive tab/documentが矛盾しない。

## 受け入れ条件

- [ ] CodeMirror command descriptorを定義する。
- [ ] mount/change/unmountの順序を探索する。
- [ ] Ideal editor integrationの最小boundaryを文書化する。
- [ ] pure adapterで不十分なDOM semanticsをbrowser replayへ分類する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped
