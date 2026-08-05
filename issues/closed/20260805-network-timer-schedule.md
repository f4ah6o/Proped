# network・timer schedule探索を実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

response ordering、abort、retry、fake timer、callback countの有限scheduleとshrinkerを実装する。

## 共通制約

- Proped coreをsource of truthとして維持する。
- protocol v1とsemantic report schemaを共有する。
- external repositoryはread-only inputとし、upstreamへ書き込まない。
- network、filesystem、mail、payment、cloud mutationはdefault denyまたはdescriptor化する。
- failureはfresh fixtureで同一property・failure classとしてreplay可能にする。

## 受け入れ条件

- [x] 実装境界とunsupported effectを文書化する。
- [x] deterministic testとfailure/replay signatureを追加する。
- [x] CIで実行可能なbounded fixtureを追加する。
- [x] report/atlasまたはmachine-readable diagnosticへ結果を保存する。
- [x] `git diff --check`を通す。

## 変更履歴

`CHANGES.md` impact: yes when shipped

## 完了結果

- 仮想network・fake timerのみを使い、real networkとwall clock timerをfail closedにした。
- depth 6内の580 transition・377 stateを走査し、depth境界到達とtransition上限未到達を区別して記録した。
- stale response、abort後commit、retry budget超過、callback重複をそれぞれ最小traceへ縮約した。
- fixtureとHTML/JSON/SVG/DOT Atlas生成、CI回帰を追加した。
