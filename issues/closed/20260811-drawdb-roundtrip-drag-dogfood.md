# drawDB SQL/DBML round-trip と drag undo/redo drift を実ブラウザdogfoodする

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-11
Updated: 2026-08-11
Priority: P1
Depends-On: `issues/closed/20260811-real-drawdb-dogfood.md`

## 対象

- Repository: `drawdb-io/drawdb`
- Revision: `f15453be0b9a0a8ca99d040256c2d2edf7155510`
- Runtime: production Vite build + Playwright Chromium
- Upstream policy: remoteはread-only。issue / PR / commit / commentは作成しない。

## 目的

前段で確認したtable/relation/history/persistence contractをeditor固有の深い状態遷移へ拡張する。

1. DBML / SQLのimport -> edit -> export -> reimportでsemantic modelが保存されること。
2. canvas table drag -> undo -> redoを繰り返してもpositionがdriftしないこと。

文字列や生成IDの完全一致ではなく、table / field / PK / UNIQUE / NOT NULL / increment / FK endpoint / positionのsemantic projectionで比較する。

## 実装

`web/playwright-browser/test-real-drawdb.mjs` contract version 2へ拡張した。

- target source pathを`--source`で明示しrepository root内へpath-confineする。
- drawDB自身の`toDBML` / `fromDBML` / `jsonToMySQL` / `importSQL`をtargetの`jiti`経由で読み込み、source-level round-tripを実行する。
- DBMLは実UIでfile import -> table rename -> export download -> reimportを行う。
- SQLはsource-level import/edit/export/reimportに加え、実UIのvalid SQL importと実UI export -> source reimportを独立検証する。
- semantic projectionは生成ID、配置座標、SQL再生成constraint名を除外し、table/field属性とrelationship endpointを比較する。
- canvas tableをpointerでdragし、DOM座標とIndexedDB保存座標を照合する。
- drag後にundo/redoを3 cycle繰り返し、元座標・移動後座標へのexact restorationを確認する。
- 最終redo後にreloadし、移動後座標のpersistenceを確認する。
- external network deny / fresh browser context / contract全体2回実行を維持する。

## 実行結果

- scenarios: 11
- repetitions: 2
- deterministic replay: true
- stderr: empty
- real failure classes: 3
- runner: revision-check pass / production-build pass / browser contract quality_gate_failed

### healthy: DBML source round-trip

`DBML import -> posts=>articles / user_id=>author_id edit -> export -> reimport`

- table / field semantics: pass
- PK / NOT NULL / increment: pass
- relationship endpoint: pass
- edited names reflected in export: pass

### healthy: SQL source round-trip

`MySQL import -> posts=>articles / user_id=>author_id edit -> export -> reimport`

- table / field semantics: pass
- PK / NOT NULL / increment: pass
- relationship endpoint: pass
- edited names reflected in export: pass
- generated FK constraint nameは比較対象外。endpoint semanticsを契約とする。

### healthy: DBML real UI round-trip

`File -> Import from -> DBML -> rename posts=>articles -> Export as -> DBML -> reimport`

semantic projectionはround-trip前後で一致した。

### healthy: SQL real UI export

`File -> Export SQL -> MySQL -> downloaded SQL -> drawDB source importer`

exportされたSQLをdrawDB自身のparser/importerへ再投入したsemantic projectionは、export前diagramと一致した。

### healthy: drag undo/redo position drift

`users` tableを実pointer操作でdragした後、undo/redoを3 cycle実行した。

- drag後にDOM座標とIndexedDB座標が一致。
- undoは毎回元座標へexact restoration。
- redoは毎回同じ移動後座標へexact restoration。
- 3 cycle後もposition drift 0。
- reload後も移動後座標を保持。

## 新規実検出

### `sql_ui_import_rejects_valid_mysql`

Trace:

`ui-import:mysql:minimal-valid`

Input:

```sql
CREATE TABLE users (id INT);
```

Expected:

valid MySQL sourceとしてdiagramへimportされる。

Actual:

production browserの`File -> Import from SQL -> MySQL -> Upload file -> Import`でmodalが閉じず、drawDB自身が次のgeneric errorを表示する。

`Please check for syntax errors or let us know about the error.`

同じ最小SQLをdrawDB自身の`node-sql-parser -> importSQL(..., "mysql", "generic")`へsource-levelで渡すと成功するため、SQL grammarそのものではなくproduction browser/UI import経路での差分として記録する。

複雑なFK fixtureでも同じerrorを再現し、最小SQLへ縮約しても再現した。

## 既知failureの維持

前段で検出した次の2件も同じtraceで再現した。

- `add_table_redo_preserves_order`
- `delete_table_undo_preserves_order`

新しいround-trip/drag contractによるfalse positiveは追加されなかった。

## Harness compatibility notes

- Monaco editorはnetwork deny下で外部loader初期化が失敗する。file import/export経路は継続可能なため、`Monaco initialization: error: Event`と対になる`pageerror:Event`はknown blocked external effectとしてfailureから除外する。
- Semi Uploadは通常inputとreplace inputの2つを描画するため、actual file inputを明示する。
- SQL export semantic比較のため、IndexedDB projectionに`primary` / `unique` / `notNull` / `increment`を含める。
- SQL constraint名はimport時に再生成されるため、relationship identityではなくendpoint semanticsを比較する。

## 受け入れ条件

- [x] DBML source import -> edit -> export -> reimportを完走する。
- [x] SQL source import -> edit -> export -> reimportを完走する。
- [x] DBML real UI import -> edit -> export -> reimportを完走する。
- [x] SQL real UI importを評価し、valid SQLを拒否するproduction failureを最小traceで固定する。
- [x] SQL real UI export -> source reimportのsemantic equivalenceを確認する。
- [x] round-trip後のtable/field/relationship semantic projectionを検証する。
- [x] dragでtable座標が変化しautosaveされる。
- [x] undoで元座標、redoで移動後座標へ戻る。
- [x] 3 undo/redo cycle後もposition driftがない。
- [x] contract全体を2回実行してdeterministic replayを確認する。
- [x] Web project runnerのquality stageとしてmachine-readableに集約する。
- [x] 既存runner/Playwright回帰と`git diff --check`を確認する。

## Atlas failure codes

- `add_table_redo_preserves_order`
- `delete_table_undo_preserves_order`
- `sql_ui_import_rejects_valid_mysql`
