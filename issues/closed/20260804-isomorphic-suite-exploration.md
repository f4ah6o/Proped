# Isomorphic application suiteを横断探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbit-community/isomorphic`
- revision: `590ac1c4de71050419cc6643942e0d1f181301aa`

## 実装対象

同一harnessで次の3 frontendを実行した。

- `kanban/frontend/app`
- `todoapp/frontend/app`
- `noteapp/frontend/app`

各`moon.mod.json`はApache-2.0を宣言するが、pinned repositoryにstandalone LICENSEがないため、upstream sourceはコピーせずclean-room adapterとhash provenanceだけを保存した。

## Adapter方針

- 3 appのstateを1つのsuite modelへ保持する。
- `SwitchApp`はmatrix selectorでありupstream UI messageではない。
- active appのactionだけを生成する。
- HTTP commandをapp/domain単位のstable `PendingRequest`へ置換する。
- response messageはcausal generationのためrequest IDを持つが、updateはpinned branchと同様にgenerationを検査せず適用する。
- common CRUD propertyとapp-specific propertyを分離した。

## 検出結果

### 1. Kanban cardが存在しないcolumnを参照できる

property:

```text
kanban cards reference existing columns
```

最小trace:

```text
KanbanSelectCardToMove(1)
KanbanMoveCardTo(column=99, index=0)
```

stable action IDs:

```text
kanban-select-move:1
kanban-move:99:0
```

`MoveCardTo`はtarget columnの存在を確認せず、optimistic updateで`column_id=99`を設定する。

### 2. 古いKanban board responseが新しいdeleteを巻き戻す

```text
KanbanInit
KanbanDeleteCard(1)
KanbanBoardLoaded(request=101, fixture=0)
```

### 3. 古いTodo list responseが新しいmutation結果を巻き戻す

```text
SwitchApp(todo)
TodoDelete(1)
TodoInit
TodoDeleted(request=2301, todo=1, success=true)
TodoListLoaded(request=201, fixture=0)
```

### 4. Note loadがselected noteを消してもselectionが残る

```text
SwitchApp(note)
NoteInit
NoteSelect(1)
NoteListLoaded(request=301, fixture=1)
```

## 探索規模

- 1,400 states
- 2,288 transitions
- 4 retained failures
- 0 diagnostics

## Passした共通property

- common CRUD entity identifiers remain unique
- pending request IDs remain unique
- rendered active app matches suite model

## 残りapplication checklist

初期issueの3 app要件を完了した。残りは同じmanifest/harness形式で順次追加する。

- [ ] `pollapp/frontend/`
- [ ] `blogapp/frontend/`
- [ ] `finapp/frontend/`
- [ ] `gallery/frontend/`
- [ ] `contacts/frontend/`
- [ ] `taskflow/frontend/`
- [ ] `spreadsheet/frontend/`
- [ ] `nodegraph/frontend/`
- [ ] `compose/frontend/`

## 受け入れ条件

- [x] 最低3 appを同じharnessで実行する。
- [x] 3 app共通manifestを作る。
- [x] app固有propertyと共通CRUD propertyを分離する。
- [x] 残りappをchecklistで記録する。
- [x] exact failure signatureをCIへ固定する。
- [x] HTML/JSON/SVG/DOT/summary artifactを生成する。
- [x] deterministic rerunを確認する。

## 注記

外部repositoryはread-onlyで扱い、issue・PR・comment・commitを作成していない。

## 変更履歴

`CHANGES.md` impact: yes
