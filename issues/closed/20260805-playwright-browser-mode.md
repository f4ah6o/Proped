# Playwright Browser Mode driverを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

Chromium baseline、ephemeral profile、network deny、route/focus/storage/console snapshotとtrace replayを実装する。

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

- Playwright 1.62.0管理のChromiumを実起動し、resetごとにfresh Browser Contextを作成するdriverを追加した。
- memory fixture以外のHTTP(S)をroute abortし、service worker・permission・download・WebSocket境界をfail closedにした。
- route、focus、local/session storage、console/page error、semantic DOM、pending effectをsnapshotへ保存した。
- 128 transition・17 semantic stateのbounded fixtureで、stale response、duplicate submit、invalid numeric inputをfresh replayした。
- HTML/JSON/SVG/DOT Atlasとmachine-readable fixture、CI回帰を追加した。
