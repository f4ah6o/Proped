# Framework-neutral Web UI driver protocol v1を実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P0
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

protocol schema、JSONL envelope、capability negotiation、version rejectionをproduction packageとして実装する。

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

- `protocol/ui-driver-v1.mjs`へversion、request validation、error code、canonical semantic hash、failure signatureを実装した。
- `protocol/jsonl-server.mjs`へhello negotiation、duplicate request rejection、timeout、dispose、shutdownを実装した。
- `protocol/synthetic-driver.mjs`と`scripts/web_driver_protocol_host.mjs`でbounded stale-search fixtureを提供した。
- `type:a -> type:ab -> deliver:1`を`stale-response` failureとしてfresh fixtureで再現し、machine-readable semantic signatureを固定した。
- real network、filesystem write、mail、payment、cloud mutation、native bridgeはunsupported effectとして明示した。
- upstream repositoryへのwriteは行っていない。
