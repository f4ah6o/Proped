# Component ModeからBrowser Modeへのreplayを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

stable action ID変換、fresh fixture replay、failure signature、runtime metadata照合を実装する。

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

- React・Vue Component Modeの3 failureずつをPlaywright Chromiumへ変換し、各2回fresh replayした。
- protocol、normalizer、action identity、fixture contractのruntime metadataを照合した。
- exact matchを優先し、scope欠落はsemantic identityが一意の場合だけ許可した。
- metadata不一致、missing action、ambiguous actionは実行せずmachine-readable diagnosticへ保存した。
- source signature、target signature、Chromium version、snapshot hash、変換evidenceをfixtureとAtlasへ保存した。
