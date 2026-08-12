# Production campaign corpus and onboarding quality gate

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-multi-project-campaign-benchmark.md`

## 目的

`web benchmark`を単発実験からproductionの継続指標へ昇格し、未知projectへのauto-onboarding能力を固定corpus・固定revision・stable thresholdで測定できるようにする。

## Scope

- versioned production corpus schemaを追加する。
- `proped web benchmark --corpus <name|file>` を追加する。
- corpus entryはproject path / repository / revision / expected adapter LOC / tagsをmachine-readableに保持する。
- benchmark summaryへcorpus identityとgate結果を追加する。
- 最低auto-onboarding率、最大human intervention、最低deterministic replay率、最大project-specific executable adapter LOCをquality gateとして評価する。
- quality findingはonboarding gateとは独立して保持する。
- previous summaryを指定した場合、improved / regressed / unchangedをstable diffとして出す。
- CIでoffline・self-containedなproduction corpus fixtureを継続評価する。

## 初期quality gate

- auto-onboarding rate >= 0.80
- human interventions <= 20% of corpus projects
- deterministic replay rate = 1.00 among completed projects with replay evidence
- project-specific executable adapter LOC = 0
- unexpected onboarding regression = 0 when previous summary is supplied

## 受け入れ条件

- [ ] corpus schemaをvalidateできる。
- [ ] `web benchmark --corpus`で複数targetを実行できる。
- [ ] aggregate summaryにcorpus/gate contractが残る。
- [ ] threshold未達時はbenchmark exit 1になる。
- [ ] quality findingのみではonboarding gateを失敗にしない。
- [ ] previous summaryとの差分でregressionを検出できる。
- [ ] project-specific executable adapter LOC 0をgateできる。
- [ ] CI regression testとREADME/README.jaのproduction usageがある。

## Non-goals

- 外部repoのcheckout/downloadをbenchmark command内部で暗黙実行しない。
- corpus targetごとのproject-specific executable adapterを追加しない。
- domain semantic findingをonboarding failureへ混同しない。
