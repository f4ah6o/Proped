# Multi-project campaign benchmark

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-unknown-project-campaign-runner.md`

## 目的

未知project campaignを複数repoへ同じ条件で適用し、Proped自身のproduction能力をauto-onboarding率・human intervention・reproducible finding・探索量として比較可能にする。

## Scope

- `proped web benchmark <project...>` を追加する。
- 各targetは既存`runUnknownWebProjectCampaign`をそのまま利用し、project-specific adapterを増やさない。
- 1 targetの失敗でbatch全体を中断しない。
- onboarding completionとquality findingを別軸にする。
- stable aggregate summaryをJSON artifactとして保存する。

## Machine-readable metrics

- projectCount
- autoOnboardedCount / autoOnboardingRate
- interventionProjectCount / humanInterventions
- projectsWithFindings
- uniqueFailureClassCount / failureClasses
- deterministicReplayProjectCount
- states / transitions / actions
- per-project status / intervention reason codes / finding classes

## Exit semantics

- 0: 全targetがcampaign executionまで自動到達した。quality findingがあっても0。
- 1: 1件以上のtargetがhuman intervention required。
- 2: CLI usage / benchmark自身の実行不能。

## 受け入れ条件

- [x] 2件以上を1 commandで順次campaignできる。
- [x] 1件がintervention-requiredでも残りを継続する。
- [x] auto-onboarding率とhuman interventionを安定集約する。
- [x] findingはonboarding失敗と独立して集約する。
- [x] aggregate artifactがdeterministic field構造を持つ。
- [x] CI regression testがある。

## Resolution

`proped web benchmark <project...>`を追加し、既存のunknown-project campaignをtargetごとに独立実行して、1件がintervention-requiredでも残りを継続するbatch runnerを実装した。aggregate contractはauto-onboarding、human intervention、quality finding、replay determinism、探索量を別軸で保持し、quality findingだけではbenchmark exitを失敗にしない。既定artifactは`.proped/benchmark/summary.json`。

benchmark dogfoodで、committed Next/Nuxt fixtureがframework判別後に`start`/`preview` package script不足だけで`server_review_required`へ落ちる既存gapを発見した。server-rendered Nextはlocal `next start`、Nuxtはlocal `nuxi preview`をpackage-manager経由かつnpmでは`--offline`付きで安全に推定するよう改善した。修正前は2/2がlifecycle reviewで停止したが、修正後はNuxtが0介入でcampaign完走し、Nextもlifecycleを越えてfixture固有の`prepare_required`まで進む。

regression fixtureでは2 target中1 targetがcompleted、1 targetが`server_review_required`でもbatchが継続し、`projectCount=2`、`autoOnboardedCount=1`、`autoOnboardingRate=0.5`、`humanInterventions=1`を固定した。finding付きcompleted targetがonboarding成功のまま集約されることもpure aggregate testで固定している。
