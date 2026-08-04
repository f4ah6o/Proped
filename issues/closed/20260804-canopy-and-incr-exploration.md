# Canopy・incrのeditor componentとincremental UIを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `dowdiness/canopy`
- `dowdiness/incr`

## 調査時revision

- `dowdiness/canopy`: `cb41945b04801084e8abe1d8edc27eb0cdce4a1c`
- `dowdiness/incr`: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`

## 完了範囲

- Canopyの`rabbita-resizable`、`rabbita-menu`、`rabbita-tabs`を1つのfinite adapterへ統合した。
- pointer、keyboard、menu navigation、activation、tab selectionをtyped action化した。
- generic bounds、stale pointer、focus range、activation range、tab range、render consistency propertyを実行した。
- CodeMirror・Ideal editor integrationは`20260805-canopy-editor-integration-exploration.md`へ分離した。
- incr typed spreadsheetとbackdating semanticsは`20260805-incr-typed-spreadsheet-exploration.md`へ分離した。

## 検出結果

property: `positive resize nudges do not decrease width`

最小trace:

```text
ResizeNudge(dw=2147483647, dh=0)
```

stable action ID:

```text
resize-nudge:2147483647:0
```

初期width 120、constraint 50..300に対して、public `NudgeBy`が`self.w + dw`を先に計算するためInt32 overflowし、正方向nudgeがwidth 50へ反転した。通常のkeyboard handlerがこの値を生成するとは主張せず、public message/direct dispatch boundaryのfailureとして扱う。

## 探索規模

- 720 states
- 2,618 transitions
- 1 retained failure
- 0 diagnostics

## passしたproperty

- resizable size remains inside constraints
- stale pointer movement after resize end is ignored
- menu focus remains in range
- tab selection remains in range
- rendered component state matches model

pinned menu/tabs APIにはdisabled entryのmodelがないため、disabled selection propertyは非適用と記録した。

## incr調査メモ

`Derived::derived_no_backdate`、`map_no_backdate`、`map2_no_backdate`、`map3_no_backdate`等の`(_, _) => false`は、常に変更revisionを進める意図的なno-backdate APIであり、不正な`Eq`ではない。state fingerprint equalityとincremental backdating equalityを分離して次issueで検証する。

## 共通テスト

- [x] pinned source hash validation
- [x] adapter build and unit tests
- [x] deterministic exploration rerun
- [x] exact expected-failure signature
- [x] HTML/JSON/SVG/DOT artifact確認
- [x] `git diff --check`

## 注記

upstream repositoryはread-onlyで扱い、issue・PR・comment・commitを作成していない。

## 変更履歴

`CHANGES.md` impact: yes
