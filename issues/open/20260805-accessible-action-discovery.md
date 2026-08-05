# accessible action discoveryを実装する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

role、accessible name、label、ancestor scopeから有限actionを生成し曖昧actionをdiagnosticへ送る。

## 共通制約

- Proped coreをsource of truthとして維持する。
- protocol v1とsemantic report schemaを共有する。
- external repositoryはread-only inputとし、upstreamへ書き込まない。
- network、filesystem、mail、payment、cloud mutationはdefault denyまたはdescriptor化する。
- failureはfresh fixtureで同一property・failure classとしてreplay可能にする。

## 受け入れ条件

- [ ] 実装境界とunsupported effectを文書化する。
- [ ] deterministic testとfailure/replay signatureを追加する。
- [ ] CIで実行可能なbounded fixtureを追加する。
- [ ] report/atlasまたはmachine-readable diagnosticへ結果を保存する。
- [ ] `git diff --check`を通す。

## 変更履歴

`CHANGES.md` impact: yes when shipped
