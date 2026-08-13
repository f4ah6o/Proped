# External corpus breadth and single-HTML static onboarding

Status: open
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

- [ ] external corpus target count = 10。
- [ ] distinct repository count >= 5。
- [ ] adapter LOC = 0。
- [ ] required tag coverageにstatic / stateful / framework-backedを含める。
- [ ] single unique HTML static fixtureがintervention 0でcampaign完走する。
- [ ] multiple HTML ambiguityはfail closedする。
- [ ] 追加7 targetがblind campaignでauto-onboardedになる。
- [ ] external corpus全体のquality gateがpassする。
- [ ] materialization後/benchmark後のcheckout cleanup contractを維持する。
- [ ] existing production corpus/baseline testsを壊さない。
