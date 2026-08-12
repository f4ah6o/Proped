# Unknown-project campaign runner and production benchmark

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1

## 目的

未知のWebプロジェクトをほぼ準備なしでPropedへ投入し、既存のblind onboarding機能を1コマンドで最後まで実行できるようにする。機能数ではなく「未知repoに対する自動適用率」「人間介入数」「再現可能failure class」をproduction価値の主要指標として観測可能にする。

## Product command

```text
proped web campaign <project>
```

campaignは次の既存能力を再利用して束ねる。

```text
inspect -> manifest inference -> runtime resolution -> package-manager resolution
-> dependency readiness/prepare -> compile -> managed browser exploration
-> replay/failure classification -> campaign summary
```

## Safety boundary

- project-specific adapterを自動生成しない。
- critical inference ambiguityはfail-closedし、人間介入理由として機械可読に返す。
- host credential environmentは既存のcredential-filtered executionを維持する。
- dependency installはcampaign自体を明示的なmutating operationとして扱い、`--no-prepare`で禁止可能にする。
- target sourceを書き換えない。生成物は`.proped/`配下に限定する。
- existing sandbox / network policyを弱めない。

## v1 scope

- [x] `proped web campaign <project>` を追加する。
- [x] inspectionからmanifest v2をメモリ上で生成し、target sourceへmanifestを要求しない。
- [x] Node/runtime/package-manager/dependency readinessを自動解決する。
- [x] dependency未準備時は既定で既存safe prepareを実行する。
- [x] `--no-prepare` / `--offline` / `--no-artifacts` / `--sandbox-mode`を扱う。
- [x] campaign summaryにautoOnboarded / humanInterventions / interventionReasons / stages / failureClasses / deterministicReplayを含める。
- [x] critical ambiguityやruntime不足をsilent passしない。
- [x] CLI dispatcher、help、テスト、CIに追加する。

## Production benchmark contract

単一projectのcampaign結果は将来のmulti-repo benchmarkで集約できる安定フィールドを持つ。

```json
{
  "schemaVersion": 1,
  "autoOnboarded": true,
  "humanInterventions": 0,
  "interventionReasons": [],
  "failureClasses": [],
  "deterministicReplay": true
}
```

multi-repo集約はこのissueのv1完了後に、同一schemaを壊さず別issueで追加する。

## 受け入れ条件

- [x] manifest fileを手書きせずfixture projectをcampaignできる。
- [x] prepared projectはhumanInterventions=0で完走する。
- [x] dependency未準備projectはsafe prepareを自動実行できる。
- [x] ambiguity / unsupported runtime / prepare failure / exploration failureが区別される。
- [x] outputがdeterministicな集約用contractを持つ。
- [x]既存`web init/prepare/run`の挙動と安全境界を後退させない。

## Resolution

`proped web campaign <project>`を追加し、未知Web projectを手書きmanifestなしでinspectからGeneric Browser replayまで束ねた。既定で既存のcredential-filtered prepareを必要時に実行し、`--no-prepare` / `--offline` / `--no-artifacts` / sandbox overrideを提供する。campaign summaryは`autoOnboarded`、human intervention、canonical failure class、replay determinism、state/transition/action数を安定contractとして返す。quality failureはonboarding failureと分離し、探索自体が完走した場合はfindingとして保持する。

実fixtureでは事前`node_modules`なし・手書きmanifestなしからautomatic `npm ci`、build、Generic Browser探索、3回replayまで完走し、`autoOnboarded=true`、`humanInterventions=0`、`deterministicReplay=true`を確認した。この縦切りで依存0件npm projectのreadiness false negativeも発見し、canonical package-manager installについては`node_modules` markerが存在しなくてもdependency-freeとしてready判定するよう修正した。CI、英日README、CHANGESにも反映した。
