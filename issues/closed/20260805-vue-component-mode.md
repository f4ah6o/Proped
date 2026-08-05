# Vue Component Mode adapterを実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P1
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

Reactと同じprotocol/report/propertyを再利用しVue nextTick、Suspense、Teleport、Pinia境界を実装する。

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

- Vue 3.5、Pinia 4、JSDOM上で実componentをmountするadapterを追加した。
- `nextTick` settle、Suspense、Teleport、Pinia store境界をbounded fixtureで検証した。
- 10,000 transition benchmarkからstale response、duplicate submit、invalid numeric inputを再現・縮約した。
- HTML、JSON、SVG、DOT、summaryのmachine-readable成果物を生成する。
