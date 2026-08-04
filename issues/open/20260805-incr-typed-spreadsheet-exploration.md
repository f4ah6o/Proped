# incr typed spreadsheetのincremental recomputationを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`
Split-From: `20260804-canopy-and-incr-exploration.md`

## 対象

- `dowdiness/incr`

## 調査時revision

- `dowdiness/incr`: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`

## 主な対象path

- `examples/typed_spreadsheet_rabbita_demo/model.mbt`
- `examples/typed_spreadsheet_rabbita_demo/grid_snapshot_cache.mbt`
- `examples/typed_spreadsheet/`
- `incr/cells/derived_facade.mbt`
- `incr/cells/input.mbt`

## Adapter方針

published `dowdiness/incr@0.15.0`を固定し、2,500 cell UI全体ではなく、入力、formula dependency、delete、parse failure、snapshot cacheを含む有限sheetへ縮小する。recompute countとchanged/unchanged traceをmodelへ露出し、同一action列のdependency updateとartifactが決定的であることを検証する。

## 特殊なequality/backdating semantics

- `Derived::derived_no_backdate`、`map_no_backdate`、`map2_no_backdate`、`map3_no_backdate`は比較関数として`(_, _) => false`を意図的に使用する。
- これは不正な`Eq`実装ではなく、出力型に`Eq`を要求せず、再計算時に`changed_at`を常に進める明示的なAPI semanticsである。
- `Input::map`等にも同様のno-backdate boundaryがあるため、探索ではstate equalityとincremental backdating equalityを混同しない。
- reportには使用API、backdating mode、recompute countを必ず記録する。

## 最初に試すproperty仮説

- 同一edit sequenceは同一cell value、dependency trace、recompute countを返す。
- upstream inputが同値へ戻る場合、Eq-backed derivedのdownstream recomputeは必要以上に増えない。
- no-backdate APIは同値出力でもdownstream invalidationを省略しない。
- parse failure後にworksheetとcommitted valueが変化しない。
- delete後にdependent formulaとsparse snapshot cacheが一致する。
- ResetSheet後に旧runtimeのstateが新runtimeへ混入しない。
- stale inline blurがcommitを二重適用しない。

## 生成するaction

- SelectCell(A1/B1/C1/missing)
- UpdateDraft(empty/integer/formula/invalid)
- ApplySelected
- DeleteSelected
- CancelSelected
- ResetSheet
- BeginInlineEdit / ApplyInlineEdit
- dependency-preserving and dependency-changing edits
- Eq-backed / no-backdate derived reads

## 受け入れ条件

- [ ] pinned packageまたはreview済みclean-room adapterでbuildできる。
- [ ] formula dependencyを含む有限sheetを探索する。
- [ ] recompute countとchanged/unchanged traceをartifactへ保存する。
- [ ] Eq-backedとno-backdateの違いをpropertyで固定する。
- [ ] failureまたはzero-failure結果をexact signatureでCIへ固定する。

## 共通テスト

- pinned revision/package version validation
- deterministic exploration rerun
- exact expected-failure signatureまたはzero-failure assertion
- HTML/JSON/SVG/DOT artifact確認
- `git diff --check`

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped
