# Web mutation testingと検出benchmarkを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P2
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

synthetic fault群の検出率、最小trace、探索速度、false positiveを定量化する。

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

- generic Web property 8種類に対応するsynthetic mutantと正常controlを追加した。
- 8/8 mutantを検出し、mutation score 100%、正常control 8件のfalse positive 0件を固定した。
- deletion shrinkで30 actionを14 actionへ縮約し、各failureをfresh runtimeで2回再現した。
- 1,000 iteration・60,000 transitionの探索速度を計測し、wall clock値をsemantic hashから除外した。
- machine-readable fixtureとHTML/JSON/SVG/DOT Atlas、CI、文書を追加した。
