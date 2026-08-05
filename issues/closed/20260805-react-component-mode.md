# React Component Mode adapterを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P0
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

React form fixture、settle、input corpus、fault detection、10,000 transition benchmarkを実装する。

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


## 実装結果

- React 19.2.8をJSDOM 29.1.1へmountし、native DOM eventをReact `act`内で実行するComponent Mode driverを追加した。
- role、accessible name、label、form scopeから23 actionを生成し、empty、space、ASCII、invalid、emojiを含むinput corpusを固定した。
- 10,000 transitionを探索し、5,955 distinct stateを記録した。手元の実行時間は21,621msで、60秒のCI基準内だった。
- stale responseを3 action、duplicate submitを2 action、invalid numeric inputによるprevious-result破壊を1 actionへ縮約した。
- fresh reset replayでstale-response snapshot hashの一致を確認した。
- HTML、JSON、SVG、DOT、summary artifactを`web/react-component/out/`へ生成する。
- network、submit responseはin-memory descriptorとしてinjectし、実network、filesystem write、mail、payment、cloud mutation、native bridgeは実行しない。
