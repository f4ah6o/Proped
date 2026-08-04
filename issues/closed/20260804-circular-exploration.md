# Circularのlocal-first project stateを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `CAIMEOX/circular`

## 調査時revision

- `CAIMEOX/circular`: `bf8549a9c13505f3dc5632347acfffbba864c406`

## 主な対象path

- `web/state/model.mbt`
- `web/state/messages.mbt`
- `web/updater/update.mbt`
- `web/updater/task.mbt`
- `web/updater/workspace_sync.mbt`
- `web/updater/workspace_update.mbt`
- `web/updater/overlay.mbt`

## Adapter方針

pinned revisionの`moon.mod`はApache-2.0を宣言するがstandalone LICENSEがないため、upstream sourceはcopyしない。task selection、task modal、task menu、route、workspace mutation、command descriptorをclean-room finite adapterへ落とした。実native/network処理は実行せず、task state mutationを`NativeInvoke` descriptorとして記録する。

## 検出結果

property:

```text
task modals retain an existing selected task
```

最小trace:

```text
SelectTask("TSK-1")
WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)
```

stable action IDs:

```text
select-task:5:TSK-1
workspace-mutated:TaskQuickMutation:1:1
```

`sync_workspace`は返却workspaceに存在しない`selection.task_id`を`None`へ落とすが、current modalは維持する。続く`TaskQuickMutation` cleanupはtask menuだけをclearするため、`TaskModal`が開いたままselected taskだけが消える。

pinned sourceへ一時wbtestを追加してprivate `open_task_editor`と`sync_workspace`を直接実行し、`modal=TaskModal`、`selection.task_id=None`を確認した。probe fileはupstream checkoutから削除し、相手repositoryへ変更を送っていない。

## 探索規模

- 580 states
- 2,456 transitions
- 1 retained failure
- 0 diagnostics

## passしたproperty

- task menu references an existing task
- NoOp preserves state
- route changes close task surfaces
- pending effect IDs remain unique
- rendered modal and selection match model

## 受け入れ条件

- [x] handler categoryごとのcoverageをreportした。
- [x] task modalとtask menuのreferential integrity propertyを追加した。
- [x] `NoOp`のstate preservationを確認した。
- [x] licenseを事前確認し、standalone LICENSE不在のためsource copyを避けた。

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
