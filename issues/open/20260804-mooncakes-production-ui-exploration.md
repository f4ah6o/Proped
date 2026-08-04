# Mooncakes.ioとMoonBit公式Rabbita UIを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `moonbitlang/mooncakes.io`
- `moonbitlang/website`
- `moonbitlang/moonbit-docs`

## 調査時revision

- `moonbitlang/mooncakes.io`: `f7877338598f6a13387b889dd912b15029a0ce5f`
- `moonbitlang/website`: `a6222f7292ce50f2a08847ef0852b1a8d456a393`
- `moonbitlang/moonbit-docs`: `24f6b9a0b9ac997119ecd3069825edf65d3473fe`

## 主な対象path

- `src/page/build_queue/state.mbt`
- `src/page/home/state.mbt`
- `src/page/docs/state.mbt`
- `src/page/skills/state.mbt`
- `src/main/main.mbt`
- `src/pages/rabbita-home/`
- `next/sources/fullstack-one-project/frontend/`

## Adapter方針

build queueの小さいpure stateから開始し、HTTP responseをdescriptorとしてinjectする。その後home/docs/skills pageへ拡張する。公式websiteとtutorialは実装pattern・migration regression fixtureとして扱う。

## 最初に試すproperty仮説

- build queueのqueue/recent statusが同一responseで矛盾しない。
- 古いHTTP responseが新しいnavigationまたはfilter stateを上書きしない。
- Failed/Loading/Success遷移でstale contentを誤表示しない。
- theme toggleがdomain modelを変えない。
- route change後のpage-local responseを別pageへ適用しない。

## 生成するaction・event

- GotBuilds success/error malformed
- ToggleTheme
- route and filter messages
- HTTP responses reordered/duplicated
- decode boundary fixtures

## 受け入れ条件

- [ ] build_queue stateを最初のproduction fixtureとして追加する。
- [ ] 少なくとも1つのofficial service pageをCIで継続探索する。
- [ ] API response decoderのmalformed corpusを含める。
- [ ] official tutorialはharness onboarding fixtureとして使う。

## 共通テスト

- pinned source hash validation
- adapter build and unit tests
- deterministic exploration rerun
- exact expected-failure signatureまたはzero-failure assertion
- HTML/JSON/SVG/DOT artifact確認
- `git diff --check`

## 注記

upstreamの実装上の事実と、非同期・browser boundaryを再現するためのtest harness仮定をreportで分離する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped
