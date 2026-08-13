# External corpus breadth and single-HTML static onboarding

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-external-production-corpus-materialization.md`

## 目的

external production corpusを3 targetから10 targetへ拡張し、未知Web projectへの適用率を単一repository/fixtureに依存しない形で測る。同時に、rootに`index.html`がなくても唯一のHTML entryを持つstatic projectをhuman reviewなしで安全にonboardできるようにする。

## Scope

- external corpusを10 targetへ拡張する。
- 少なくとも5 repositoryを含める。
- project-specific executable adapter LOCは0を維持する。
- stateful targetを少なくとも1件含める。
- static targetとframework-backed targetの両方を含める。
- corpus quality gateにrepository breadth / required tag coverageを追加する。
- project rootに`index.html`がなく、root直下にHTML fileがちょうど1件だけある場合はsingle-HTML static projectとして安全に推定する。
- static serverは推定entryを`/`でserveし、asset path traversal防止は維持する。
- HTML fileが複数ありentryを一意に決められない場合は従来どおりreview-requiredへ倒す。
- README / README.ja.md / CHANGES / CIを更新する。

## Initial target set

既存3 targetに加え、現在cleanなpinned checkoutでblind campaign済みのtargetを優先する。

- `moonbit-community/isomorphic`: todoapp/public
- `moonbit-community/isomorphic`: spreadsheet/public
- `moonbit-community/isomorphic`: nodegraph/public
- `moonbit-community/isomorphic`: gallery/public
- `moonbit-community/isomorphic`: compose/public
- `moonbit-community/rabbita_xterm`: examples/web
- `justjavac/proton-demo`: demos/calculator (single-HTML inference後)

## 受け入れ条件

- [x] external corpus target count = 10。
- [x] distinct repository count >= 5。
- [x] adapter LOC = 0。
- [x] required tag coverageにstatic / stateful / framework-backedを含める。
- [x] single unique HTML static fixtureがintervention 0でcampaign完走する。
- [x] multiple HTML ambiguityはfail closedする。
- [x] 追加7 targetがblind campaignでauto-onboardedになる。
- [x] external corpus全体のquality gateがpassする。
- [x] materialization後/benchmark後のcheckout cleanup contractを維持する。
- [x] existing production corpus/baseline testsを壊さない。

## Resolution

- external corpusを5 repository / 10 targetへ拡張し、`minTargetCount=10`、`minRepositoryCount=5`、required tags `framework-backed` / `stateful` / `static`をgateした。
- 実external benchmarkは10/10 auto-onboarded、human intervention 0、deterministic replay 10/10、adapter LOC 0でpass。合計178 states / 397 transitions / 120 actions。
- drawDB 16件、Isomorphic Spreadsheet 10件の計26 canonical failure classesをreproducible findingとして検出し、onboarding成功とは分離した。
- benchmark summaryへframework / project mode / server mode / package manager / state sourceのruntime distributionを追加した。
- root直下にHTMLが1件だけ存在するprojectをsingle-HTML staticとして推定し、Proton calculatorで32 states / 34 transitions / 12 actions、intervention 0を確認。HTMLが複数でentryを決められない場合は`server_review_required`を維持する。
- external checkout verifyは親repoのsubmodule worktree stateをcleanlinessから除外する一方、targetがgitlink配下へ入ることとcheckout外へrealpath escapeすることを拒否する。
- benchmark後は5 checkoutすべてexact pinned HEAD / dirty=falseへ復元した。
