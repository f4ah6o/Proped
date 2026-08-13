# Production campaign corpus and onboarding quality gate

Status: closed
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

- [x] corpus schemaをvalidateできる。
- [x] `web benchmark --corpus`で複数targetを実行できる。
- [x] aggregate summaryにcorpus/gate contractが残る。
- [x] threshold未達時はbenchmark exit 1になる。
- [x] quality findingのみではonboarding gateを失敗にしない。
- [x] previous summaryとの差分でregressionを検出できる。
- [x] project-specific executable adapter LOC 0をgateできる。
- [x] CI regression testとREADME/README.jaのproduction usageがある。

## Non-goals

- 外部repoのcheckout/downloadをbenchmark command内部で暗黙実行しない。
- corpus targetごとのproject-specific executable adapterを追加しない。
- domain semantic findingをonboarding failureへ混同しない。

## Resolution

`proped web benchmark --corpus production`を追加し、versioned corpus schema、corpus identity、target repository/revision metadata、tags、project-specific executable adapter LOCをstable summaryへ統合した。初期production corpusはoffline self-contained 5 targetで、pure static 4件とlocal file dependencyを明示prepareしてbuildするSPA 1件を含む。

quality gateはauto-onboarding率 >= 80%、intervention project rate <= 20%、replay evidenceがあるprojectのdeterministic replay = 100%、adapter LOC = 0、`--previous`指定時のonboarding regression = 0を評価する。quality findingは引き続きonboarding failureとは独立している。

実走ではmacOSの既定constrained sandboxで5/5 auto-onboarded、human intervention 0、deterministic replay 5/5、24 states / 73 transitions / 15 actions、adapter LOC 0を確認した。corpus dogfoodにより、buildを持たないpure static projectでもstatic output directoryをwritable pathへ追加しrepository rootを書込可能にしようとする既存sandbox gapを検出し、build stageがある場合だけoutput directoryを書込許可するよう一般修正した。

CIでは`test_web_project_corpus.mjs`がoffline corpus実走、schema validation、static read-only sandbox contract、adapter LOC gate、previous-summary regression detectionを固定する。
