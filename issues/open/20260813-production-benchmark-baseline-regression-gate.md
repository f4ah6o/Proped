# Production benchmark baseline regression gate

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-production-campaign-corpus-quality-gate.md`

## 目的

production corpusの単発quality gateを、committed baselineとの差分までCIで強制する継続的なproduction能力指標へ引き上げる。

## Scope

- machine-independentなproduction benchmark baselineをrepositoryへcommitする。
- `proped web benchmark --corpus production --baseline <file>`でbaseline comparisonを有効にする。
- target追加/削除、自動onboarding退行、replay determinism退行、human intervention増加をproject単位で検出する。
- quality findingの増減はonboarding regressionと混同せず別deltaとして報告する。
- CIでproduction corpusをhost-safe sandboxの既定設定で実走し、baseline regressionを0件に固定する。

## Baseline contract

- corpus id/hash
- target id / repository / revision
- autoOnboarded
- deterministicReplay
- humanInterventions
- failureClasses
- stable machine-readable semantic hash

## Exit semantics

- 0: corpus quality gateとbaseline regression gateの両方を満たす。
- 1: quality thresholdまたはbaseline regressionに違反する。
- 2: baseline/corpus/CLI自体が不正。

## 受け入れ条件

- [ ] committed production baselineがある。
- [ ] baseline schema validationがfail-closedである。
- [ ] auto-onboarding regressionをproject単位で検出する。
- [ ] deterministic replay regressionをproject単位で検出する。
- [ ] human intervention増加をproject単位で検出する。
- [ ] finding deltaはregression countと独立して報告する。
- [ ] target追加/削除を明示的に報告する。
- [ ] CIがproduction corpus + committed baselineを実走する。
- [ ] macOS/Linuxでmachine-independent baseline contractを保つ。
