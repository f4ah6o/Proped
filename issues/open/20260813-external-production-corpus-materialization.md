# External production corpus materialization

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-production-benchmark-baseline-regression-gate.md`

## 目的

self-contained fixtureだけでなくrevision固定の実OSS checkoutへunknown-project campaignを適用し、network取得とoffline production benchmarkを明確に分離する。benchmarkの再現性を外部network状態から独立させたまま、未知projectへの実適用率を継続測定できるようにする。

## Scope

- external production corpusをversioned JSONで定義する。
- corpus entryはrepository URL / full revision / checkout key / project subdir / adapter LOC / tagsを保持する。
- `proped web corpus materialize <corpus> --checkout-root <dir>`を追加する。
- materializeはclone/fetch/checkoutを明示操作としてのみ実行し、指定full revisionへdetached checkoutする。
- `proped web corpus verify <corpus> --checkout-root <dir>`でremote identity、HEAD revision、project pathをread-only検証する。
- `proped web benchmark --corpus <file> --checkout-root <dir>`でmaterialized external corpusをoffline実行できる。
- benchmark自身はclone/fetchを暗黙実行しない。
- upstream repositoryへcommit/push/issue/PR等のwriteを一切行わない。

## Initial external corpus

既存dogfoodでlocal checkout済みの実OSSを最初の候補とする。

- `tastejs/todomvc` React/Vue subprojects
- `drawdb-io/drawdb`
- `moonbitlang/website`
- `dowdiness/canopy` Web app

実際にproduction corpusへ採用するtargetは、現checkoutでrevisionとproject pathを機械確認できたものだけに限定する。

## Safety

- materialize先は明示checkout root配下のみ。
- checkout keyのpath traversalを禁止する。
- repository URLと既存originが一致しない場合はfail closed。
- dirty checkoutはrevision変更前にfail closed。
- full 40-hex revision以外をexternal materializationでは受け付けない。
- target project codeはmaterialize時に実行しない。
- dependency install/build/browser executionは後段campaignの既存sandbox/policyに従う。

## 受け入れ条件

- [ ] external corpus schemaをvalidateできる。
- [ ] local Git remote fixtureでclone/fetch/detached checkoutを再現できる。
- [ ] dirty checkout / origin mismatch / revision mismatchをfail closedできる。
- [ ] verifyはread-onlyでmaterialized stateをmachine-readableに返す。
- [ ] benchmarkが`--checkout-root`からexternal project pathを解決できる。
- [ ] benchmark command自体はmaterializeを暗黙実行しない。
- [ ] 既存local OSS checkoutの少なくとも3 targetでrevision/project path verifyが通る。
- [ ] project-specific executable adapter LOCは0のまま。
- [ ] CI regression testを追加する。
- [ ] README / README.ja.md / CHANGESをchecked-in capabilityに合わせて更新する。
