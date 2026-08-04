# MoonBit Editorのfile tree非同期resolveを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbitlang/editor`

## 調査時revision

- `moonbitlang/editor`: `001c9db52bcdc543c2bec8689b70e97941cecc18`

## 主な対象path

- `internal/shell/widgets/file_tree/file_tree.mbt`
- `internal/shell/workbench/app.mbt`
- `internal/shell/examples/embedded_viewer/main.mbt`

## Adapter方針

`FileTreeModel::update`、`with_directory_resolved`、`continue_reveal`を抽出し、WorkspaceTreeProviderをfinite tree fixtureへ置換する。resolve commandをpending effectとして順序入替する。

## 最初に試すproperty仮説

- Refresh前の古いDirectoryResolvedが新しいrootを上書きしない。
- SetActive中のauto-revealでpending targetが失われない。
- resolve failure後のretryでselectionとexpanded状態が矛盾しない。
- tree外URIをSetActiveしても永久pendingにならない。
- OpenFileしたURIとselectedが一致する。
- collapsed directoryの遅延resolveが意図せず再展開しない。

## 生成するaction・event

- Refresh
- ToggleDirectory(root/child/missing)
- OpenFile(existing/missing)
- SetActive(root/deep/missing)
- DirectoryResolved(success/error/stale/duplicate)
- provider tree variants

## 受け入れ条件

- [ ] finite workspace fixtureを2種類以上用意する。
- [ ] resolve response permutationを探索する。
- [ ] auto-revealのtermination propertyを追加する。
- [ ] upstream private typeへの最小adapter boundaryを文書化する。

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
