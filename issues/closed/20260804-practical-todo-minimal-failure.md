# 実用規模のRabbita TODOでfailureを発見し最小traceへ縮約する

Status: closed
Model: gpt-5.6-thinking
Created: 2026-08-04
Updated: 2026-08-04
Branch: main

## 概要

Rabbita公式`examples/todo`を固定revisionでvendorし、add/delete/toggle/tabを含む実用規模の状態探索を実行して、実装由来のproperty failureを発見し、最小counterexampleへ縮約する。

## 対象

- Upstream: `moonbit-community/rabbita`
- Path: `examples/todo`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Source size: 281 MoonBit lines
- License: Apache-2.0

## 発見したfailure

upstreamのupdateは`Add if title == ""`だけをno-opにするため、空白だけのtitleをtodoとして保存する。

Property:

```text
stored todo titles are not blank
```

Failure message:

```text
todo 0 has a blank title
```

縮約された最小trace:

```text
TitleChanged(" ")
Add
```

Stable action IDs:

```text
"title:1: "
add
```

## 実装

- upstream source、stylesheet、license、SHA-256を`src/vendor/rabbita_todo/`へ保存
- pureな`Model`、`Msg`、`update`、`actions`、`view`、`fingerprint`、`shrink`をadapter packageとして公開
- 生成itemを最大2件、title corpusを有限集合へ制限
- title変更、add、delete、toggle、All/Active/Done/Stats tabを探索
- propertyごとに最短counterexampleだけを`RunReport.failures`へ保持
- CLI summaryへ`expectedOutcome`、`expectationMet`、`firstFailure`を追加
- `rabbita-todo`をexpected-failure regression fixtureとして`demo run all`へ統合

## 結果

固定設定:

- cases: 192
- max depth: 14
- max states: 320
- seed: 29
- shrink budget: 4096

観測結果:

- states: 169
- transitions: 2,251
- failures: 1
- diagnostics: 0
- minimized trace length: 2

## 受け入れ条件

- [x] 公式TODO sourceとlicenseが固定revision・hash付きで保存されている
- [x] add/delete/toggle/tabを含む有限で決定的な探索がnative targetで動作する
- [x] 空白titleのfailureを検出する
- [x] failure traceが`TitleChanged(" ") -> Add`へ縮約される
- [x] 同じfailureが多数の生成caseから重複記録されない
- [x] CLI JSONに最小failureのproperty、message、state、trace、action IDが含まれる
- [x] HTML/JSON/SVG/DOT/summary artifactが生成される
- [x] CIでexpected failureの再現と最小traceを検証する

## 検証

- `moon fmt --check`
- `moon check --target native`
- `moon test --target native`
- `moon run src/cli -- demo run rabbita-todo --json`
- `moon run src/cli -- demo run all --json`
- generated JSON parse
- deterministic artifact hash comparison

## 注記

この変更ではupstream behavior自体を修正せず、vendorした固定revisionに対する検証fixtureとして保持する。外部repositoryへのissueやPRは作成しない。
