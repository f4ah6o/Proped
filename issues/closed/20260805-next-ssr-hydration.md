# Next.js SSR・hydration adapterを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

App RouterとPages Router fixture、SSR/hydration diff、Server Action境界、case resetを実装する。

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

- Next.js 16.3.0のproduction buildでApp RouterとPages Routerを実行した。
- stable/mismatchの4 caseをSSR HTMLとhydrated DOMで比較し、両routerのhydration warningを各2回fresh replayした。
- App Routerの実Server Actionはdescriptor-onlyで実行し、Pages Routerはunsupported effectとしてfail closedにした。
- resetごとにBrowser Context、storage、action stateを再生成し、外部fetchをroute abortした。
- fixtureとHTML/JSON/SVG/DOT Atlas、CI回帰、third-party noticeを追加した。
