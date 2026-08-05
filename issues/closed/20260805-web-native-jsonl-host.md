# MoonBit core向けnative JSONL hostを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P0
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

既存exploration coreをsource of truthとしてNode driver sessionへ接続し、timeout・dispose・error mappingを実装する。

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

- MoonBit coreで25 state・119 transitionを探索し、stale responseを3 actionへ縮約した。
- Node JSONL hostはtimeout、process cleanup、dispose、unsupported effect、fresh replayを担当する。
- `protocol/fixtures/native-stale-search-result.json`へmachine-readable結果を固定した。
