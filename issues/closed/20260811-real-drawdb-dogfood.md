# drawdb-io/drawdb を実プロジェクトdogfoodする

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-11
Updated: 2026-08-11
Priority: P1
Depends-On: `20260811-real-todomvc-dogfood.md`

## 対象

- Repository: `drawdb-io/drawdb`
- Revision: `f15453be0b9a0a8ca99d040256c2d2edf7155510`
- License: AGPL-3.0
- Runtime: React 18 + Vite + Dexie/IndexedDB
- Upstream policy: read-only。issue / PR / commit / commentは作成しない。

## 選定理由

- TodoMVCより大きい実用Webアプリで、table/field/relation/selection/drag/undo/redo/import/export/autosaveを持つ。
- local browser内で主要機能が完結し、credentialなしでproduction buildを実行できる。
- undo/redo actionが多数のentity種別にまたがり、state-model testingとの相性が良い。
- Dexie/IndexedDB persistenceを含めてreload consistencyを確認できる。

## 目的

Proped RabbitaのWeb project runnerとreal-browser contractを、複雑なeditor系第三者アプリへ適用する。fixture mutationではなく実コードのstate consistency、undo/redo reversibility、selection cleanup、autosave persistenceの不具合を検出できるか評価する。

## 実装したcontract

- deterministicな2-table/1-relationship diagramをDexie/IndexedDBへ投入する。
- table add -> undo -> redo のsemantic orderを検証する。
- selected table delete -> repeated Delete -> undo -> redo を検証し、selection cleanupとrelationship復元を確認する。
- relationship delete -> undo -> redo でendpointを維持することを確認する。
- table rename -> undo -> redo -> autosave -> reload を確認する。
- table add -> autosave -> reload でtable orderとrelationshipが保持されることを確認する。
- external networkをdenyし、fresh browser contextでscenarioを分離する。
- random IDを`<generated>`へ正規化し、DOMとIndexedDBのsemantic stateだけを比較する。
- contract全体を2回実行してdeterministic replayを検証する。

## 実検出

### `add_table_redo_preserves_order`

Trace:

`add-table -> undo:add-table -> redo:add-table`

Expected:

`users, posts, <generated>`

Actual:

`users, <generated>, posts`

source inspectionでは、新規tableのhistoryに`index: tables.length - 1`を保存しているため、初期2 tableからのappendがindex 1としてredoされる挙動と一致する。

### `delete_table_undo_preserves_order`

Trace:

`select-table:users -> delete-table:users -> delete-key-after-selected-delete -> undo:delete-table:users`

Expected:

`users, posts`

Actual:

`posts, users`

source inspectionでは、復元時に`data.index || tables.length`を使用しているため、正しいindex 0がfalsy扱いされ末尾へappendされる挙動と一致する。

## healthy behavior

- relationship delete -> undo -> redo はpassし、両endpointを維持した。
- table delete時のselection cleanupはpassした。削除直後の追加Deleteでも状態不変・browser errorなし。
- table delete -> undo で付随relationshipが復元された。
- table rename -> undo -> redo はpassした。
- rename後autosave -> reloadはpassした。
- table add後autosave -> reloadはpassし、既存relationshipも保持した。
- external CDN requestはdenyしたままeditor contractを実行できた。
- page/console errorの実failureは0件。

## 実行結果

- dependency install: `npm ci --ignore-scripts`、541 packages。
- production build: pass、2,656 modules、約9.25秒。main JS chunkは約16.7 MB。
- browser: Playwright Chromium `151.0.7922.34`。
- scenarios: 5。
- repetitions: 2。
- deterministic replay: true。
- real failure classes: 2。
- runner: revision-check pass / production-build pass / browser contract quality_gate_failed。
- Atlas failure codes:
  - `add_table_redo_preserves_order`
  - `delete_table_undo_preserves_order`

## Harness compatibility notes

- Dexieの論理version 67はnative IndexedDBではversion 670として扱われるため、fixture DBも670で作成する。
- SPA static serverはextension付きmissing assetを404へ倒し、HTML fallbackをJSとして解釈するfalse positiveを防ぐ。
- sidebar table wrapper selectorはfield inputの`scroll_table_*_input_*`を除外する。

## 受け入れ条件

- [x] revisionを固定してproduction buildを再現する。
- [x] deterministicなinitial diagram fixtureを投入できる。
- [x] undo/redoとselectionを実ブラウザで検証する。
- [x] persistence/reloadを実ブラウザで検証する。
- [x] 実不具合を2回同じtraceで再現する。
- [x] runner manifestからbuild + browser quality contractを実行する。
- [x] failure codeをAtlasへmachine-readableに集約する。
- [x] 既存runner/Playwright回帰と`git diff --check`を確認する。

## 補足

SQL/DBML import-export round-tripとdrag position driftは、今回のcore editor contractでは未実装。今回の実験ではまずundo/redo、selection、relationship、autosave/reloadに対象を限定した。
