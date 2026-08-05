# DOM semantic snapshotとnormalizationを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P0
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

URL、semantic DOM、form、focus、storage、pending effectを正規化しfingerprintとcollision evidenceを生成する。

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

- `protocol/dom-semantic-snapshot.mjs`へnormalizer v1を実装した。
- URL、semantic DOM、form、focus、local/session storage、pending effect、application stateをfingerprintへ含めた。
- React/Vue/Nuxt由来のunstable attribute、timestamp、random token、request IDを正規化した。
- 同一fingerprintに異なるsemantic stateが対応した場合、field別の`state_identity_collision` evidenceを生成する。
- layout、screenshot、cross-origin frame、closed shadow rootは対象外として文書化した。
- bounded fixture結果を`protocol/fixtures/dom-semantic-snapshot-result.json`へ保存した。
