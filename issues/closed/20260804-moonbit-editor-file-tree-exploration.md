# MoonBit Editorのfile tree非同期resolveを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbitlang/editor`

## 調査時revision

- `moonbitlang/editor`: `001c9db52bcdc543c2bec8689b70e97941cecc18`

## 主な対象path

- `internal/shell/widgets/file_tree/file_tree.mbt`
- `internal/shell/widgets/file_tree/tree_state.mbt`
- `internal/shell/workbench/tree_provider.mbt`
- `internal/shell/widgets/file_tree/file_tree.css`

## Adapter方針

upstreamの`FileTreeModel`、`FileTreeMsg`、`TreeNode`はprivateで、shell packageはJS-onlyである。String URI、2種類のfinite workspace fixture、deterministicな`NativeInvoke` resolve descriptorを使うnative adapterへupdate、toggle、resolve、auto-reveal semanticsを移植した。

harness上のresponse messageにはpending responseを選択するrequest IDを付けるが、response適用時はupstreamと同じくURI/result semanticsだけを使う。このためrequest IDをfreshness guardとして利用せず、upstream message boundaryで起きる順序競合を探索できる。

## 最初に試したproperty仮説

- Refresh前の古いDirectoryResolvedが新しいrootを上書きしない。
- SetActive中のauto-revealでpending targetが失われない。
- resolve failure後のretryでselectionとexpanded状態が矛盾しない。
- tree外URIをSetActiveしても永久pendingにならない。
- OpenFileしたURIとselectedが一致する。
- collapsed directoryの遅延resolveが意図せず再展開しない。

## 生成したaction・event

- Refresh
- SwitchFixture(1/2)
- ToggleDirectory(root child/missing)
- OpenFile(existing)
- SetActive(root/deep/missing/outside)
- DirectoryResolveSucceeded(current/stale/reordered)
- DirectoryResolveFailed(current/stale/reordered)

## 受け入れ条件

- [x] finite workspace fixtureを2種類用意した。
- [x] pending resolve responseの順序を探索した。
- [x] outside targetを含むauto-reveal termination propertyを追加した。
- [x] upstream private typeへの最小adapter boundaryを文書化した。

## 結果

### 1. 古い無関係なresolve failureが新しいauto-revealを中断する

`DirectoryResolved(uri, result)`はrequest/reveal generationを持たず、error branchはfailed URIが現在のreveal targetのancestorかを確認せず`pending_reveal`をclearする。そのため、古いfolder expansionのfailureが新しいactive fileのauto-revealを中断する。

- property: `asynchronous resolve responses preserve newer tree intent`
- 最小trace:
  1. `ToggleDirectory("readonly-remote://workspace/tests")`
  2. `SetActive("readonly-remote://workspace/src/lib/util.mbt")`
  3. `DirectoryResolveFailed(request=1, uri="readonly-remote://workspace/tests")`
- stable action IDs:
  - `toggle:33:readonly-remote://workspace/tests`
  - `set-active:44:readonly-remote://workspace/src/lib/util.mbt`
  - `resolve-failure:1:33:readonly-remote://workspace/tests`

### 2. 遅延successが手動collapseしたdirectoryを再展開する

SetActiveによるresolveを待つ間に対象directoryを手動collapseしても、success response後の`continue_reveal`がancestorを再度expandする。

- property: `late resolve does not re-expand a collapsed directory`
- 最小trace:
  1. `SetActive("readonly-remote://workspace/tests/spec.mbt")`
  2. `ToggleDirectory("readonly-remote://workspace/tests")`
  3. `DirectoryResolveSucceeded(request=1, uri="readonly-remote://workspace/tests", fixture=1)`

### 探索規模

- 1,600 states
- 2,646 transitions
- 2 retained failures
- 0 diagnostics
- seed: 73

### その他の確認

- outside URIのauto-revealはpendingにならず終了した。
- OpenFileのintent、selected URI、last_openedは一致した。
- pending resolve ID uniquenessはpassした。
- 逆順root responseが新しいfixture snapshotを古いrootへ戻し得ることもbounded regression testで確認した。primary propertyではより短いunrelated failure traceが保持された。
- 同一入力のartifact再生成でSHA-256一致を確認した。
- upstream repositoryはread-onlyで扱い、issue・PR・comment・commitを作成していない。

## Source provenance

- `file_tree.mbt`: `ebb0b018ae049c1f182c7c74d0361aaee0c439761d00a8ead5f20e94e1968547`
- `tree_state.mbt`: `aa05d1f2a944f40864d59882b0e08f09446d3a50d963fd508127dbffdc4aa00b`
- `tree_provider.mbt`: `20e44ea3d27442f6cfd4eca84fed5a5bde477cf53a215c4acb242d74fa55c84e`
- `file_tree.css`: `483fdbeb4770c4297fdb4e2e0ea58361e6586d67e9ddc0d0cf18b8cc40129788`
- License: Apache-2.0

## 共通テスト

- [x] pinned source hash validation
- [x] adapter build and unit tests
- [x] deterministic exploration rerun
- [x] exact expected-failure signature
- [x] HTML/JSON/SVG/DOT artifact確認
- [x] `git diff --check`

## 注記

upstreamの実装上の事実と、非同期boundaryを再現するためのtest harness仮定をreport、manifest、`UPSTREAM.md`で分離した。

## 変更履歴

`CHANGES.md` impact: yes
