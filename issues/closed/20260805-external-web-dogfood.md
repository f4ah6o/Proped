# 外部React・Vue・Next・Nuxt dogfood campaignを実施する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-06
Priority: P2
Depends-On: `20260805-cross-framework-ui-exploration-proposal.md`

## 目的

permissive license targetを各frameworkで選定しrevision、hash、境界、failureまたはzero-failureを保存する。

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

- React、Vue、Next.js、Nuxtについて、MIT licenseの公開target boundaryを各1件固定した。
- repository、40桁revision、release、upstream path、reviewed reduced snapshot、SHA-256、adapter boundary、unsupported effectをmanifestへ保存した。
- React/Vue counterを各5 state・4 transition、Next/Nuxt static SSRを各1 stateで有限探索した。
- 全4 targetでcovered propertyがpassし、zero-failure 4件、failure 0件、upstream write 0件をgolden fixtureへ固定した。
- fresh replayを2回実行し、target・revision・stable trace・final fingerprintからreplay signatureを生成した。
- unsupported effectは黙って無視せず、`unsupported_effect` / `descriptor-only` diagnosticとしてAtlasへ保存した。
- CI、JSON/HTML/SVG/DOT Atlas、source hash validation、manifest schema、実装境界文書を追加した。
