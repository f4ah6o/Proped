# accessible action discoveryを実装する

Status: closed
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

- [x] 実装境界とunsupported effectを文書化した。
- [x] deterministic action-set hashとambiguity diagnosticを追加した。
- [x] form/dialogのbounded fixtureを追加した。
- [x] machine-readable fixture resultを保存した。
- [x] `git diff --check`を通した。

## 変更履歴

`CHANGES.md` impact: yes when shipped


## 実装結果

- role、accessible name、ancestor scope、stable test identity、inputからstable action IDを生成する。
- hidden/disabled要素を除外する。
- textbox corpus、checkbox、combobox、form、dialog actionを有限生成する。
- 同一identityが複数要素へ対応する場合は実行せず`ambiguous_action`へ送る。
- bounded fixtureでは10 action、1 diagnostic、semantic hash `636d201c8f649c7ef644a65c0931cfe043210e0a4aaba08203fdd1d4259c37fd`を固定した。
