# incr typed spreadsheetのincremental recomputationを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`
Split-From: `20260804-canopy-and-incr-exploration.md`

## 対象

- `dowdiness/incr`
- revision: `afc715b261d99f35245f1a14a2390ae8ad86d7d0`
- published runtime: `dowdiness/incr@0.15.0`

## Adapter方針

pinned `Worksheet`、formula AST、text parser、operation runnerと実際のincr runtimeを使用した。探索branch間でmutable graphを共有しないよう、plainなcommitted textから各transitionでruntimeを再構築し、A1/B1/C1のsnapshotとtraceだけをpure modelへ戻す。

## 検出結果

property:

```text
positive formula addition does not wrap backward
```

最小trace:

```text
UpdateDraft(A1, "2147483647")
ApplySelected
```

stable action IDs:

```text
draft:A1:10:2147483647
apply-selected
```

seed formula `B1=A1+1`に対してA1へ2147483647を適用すると、B1は通常の成功値`Int(-2147483648)`になる。formula evaluatorのMoonBit `Int`加算がoverflow検出なしでwrapするためである。

## 探索規模

- 900 states
- 1,347 transitions
- 1 retained failure
- 0 diagnostics

## Eq/backdating結果

入力4から6へ変更し、どちらもparityが`even`のままになるgraphを実incr runtimeでprobeした。

- Eq-backed derived: middle recompute 2、downstream recompute 1
- `derived_no_backdate`: middle recompute 2、downstream recompute 2

no-backdate constructor内のalways-false comparisonは、同値出力でもchange identityを進める意図的なAPI semanticsであり、不正な`Eq`ではないことをpropertyで固定した。

## passしたproperty

- parse failure preserves committed worksheet
- deleted input invalidates dependent formula
- Eq and no-backdate probes preserve declared semantics
- worksheet trace records changed formula dependents
- stale inline apply is idempotent
- rendered spreadsheet state matches model

## 共通テスト

- [x] pinned revision/package version validation
- [x] deterministic exploration rerun
- [x] exact expected-failure signature
- [x] HTML/JSON/SVG/DOT artifact確認
- [x] source SHA-256 validation
- [x] `git diff --check`

## 注記

upstream repositoryはread-onlyで扱い、issue・PR・comment・commitを作成していない。

## 変更履歴

`CHANGES.md` impact: yes
