# Canopy editor・CodeMirror integrationを探索する

Status: closed
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

- [x] CodeMirror command descriptorを定義する。
- [x] mount/change/unmountの順序を探索する。
- [x] Ideal editor integrationの最小boundaryを文書化する。
- [x] pure adapterで不十分なDOM semanticsをbrowser replayへ分類する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped

## 実装結果

- `Mount`、`SetDocument`、`SetReadonly`、`Unmount`、`ForwardSelection`のcommand descriptorを定義した。
- browser callbackの生成と配送を分離し、generation・revision・document identityをtest harness側で記録するbrowser-replay adapterを実装した。
- 900 state・1,633 transitionを探索し、2 failure・0 diagnosticsを保持した。
- primary failure `older document callbacks do not replace newer accepted revisions`を5 actionへ縮約した。
  1. `MountCompleted(generation=1)`
  2. `BrowserDocumentChanged("draft")`
  3. `BrowserDocumentChanged("draft")`
  4. `DeliverCallback(id=2)`
  5. `DeliverCallback(id=1)`
- unmount後のqueued callback適用も4 actionの独立testとして固定した。
- Idealの`CmMounted`、`CmDocChanged`、`CmSelectionChanged`、`CmFocusChanged`境界と、DOM selection・focus・CodeMirror registryをbrowser replayとする理由を`UPSTREAM.md`へ記録した。
- upstream repositoryへのissue、PR、comment、commitは行っていない。
