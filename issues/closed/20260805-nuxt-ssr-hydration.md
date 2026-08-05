# Nuxt SSR・hydration adapterを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

Nuxt SSR、async data、middleware、server route、hydration settleとcase resetを実装する。

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

- Nuxt 4.4.8 production buildとNitro Node serverを実起動するfixtureを追加した。
- `useAsyncData`、global route middleware、Nitro GET/POST routeをsemantic snapshotへ保存した。
- stable caseはhydration warning 0件、mismatch caseはVue hydration warningを2回fresh replayした。
- POST routeはdescriptor-only、外部HTTP(S)・WebSocket・service worker・permission・downloadはfail closedにした。
- fresh Browser Contextでstorage、form、async data、middleware、route resultをresetした。
- lockfile audit 0件、fixture・Atlas・CI・文書を追加した。
