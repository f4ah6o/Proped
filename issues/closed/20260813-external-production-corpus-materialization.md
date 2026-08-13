# External production corpus materialization

Status: closed
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

- [x] external corpus schemaをvalidateできる。
- [x] local Git remote fixtureでclone/fetch/detached checkoutを再現できる。
- [x] dirty checkout / origin mismatch / revision mismatchをfail closedできる。
- [x] verifyはread-onlyでmaterialized stateをmachine-readableに返す。
- [x] benchmarkが`--checkout-root`からexternal project pathを解決できる。
- [x] benchmark command自体はmaterializeを暗黙実行しない。
- [x] 既存local OSS checkoutの少なくとも3 targetでrevision/project path verifyが通る。
- [x] project-specific executable adapter LOCは0のまま。
- [x] CI regression testを追加する。
- [x] README / README.ja.md / CHANGESをchecked-in capabilityに合わせて更新する。


## Resolution

`external-production` corpusと明示的なGit materialization/verification境界を実装した。`proped web corpus materialize external --checkout-root <dir>`はfull SHAへdetached checkoutし、`proped web corpus verify external --checkout-root <dir>`はorigin、exact HEAD、cleanliness、target pathをread-only検証する。`proped web benchmark --corpus external --checkout-root <dir>`は事前verify済みcheckoutだけを利用し、clone/fetchを暗黙実行しない。

Git acquisitionはcheckout root配下へ限定し、HTTPS/file/absolute-local sourceのみ許可、embedded credentialとSSH-style sourceを拒否する。caller Git config injection、credential helper、hooks、fsmonitor、recursive submodule acquisitionを無効化し、checkout filterをfail closedで拒否する。既存checkoutのdirty/origin mismatch/revision mismatchも拒否する。benchmark後はpre-run cleanを前提にpinned revisionへtracked fileをrestoreし、run中のnon-ignored untracked outputを削除して再verifyする。

実OSS dogfoodで既存local checkoutの`tastejs/todomvc` React/Vueと`drawdb-io/drawdb`をfull revisionでverifyし、2 checkout / 3 target / executable adapter LOC 0を固定した。blind external benchmarkは最終的に3/3 auto-onboarded、human intervention 0、deterministic replay 3/3、55 states / 137 transitions / 37 actionsとなった。drawDBはonboarding成功を維持したまま16 canonical failure classをstable findingとして返した。

このdogfoodで一般gapも3件修正した。package-manager markerがなくてもcanonical installかつ宣言dependency全件が存在する場合のreadiness false negativeを解消し、coverage-guided exploration内のdriver action exceptionをstage crashではなくdiagnosticへ閉じ込め、exploration/replay/volatility boundsからGeneric Browser stage timeoutをdeterministically算出するようにした。

CIではnetworkを使う外部cloneを実行せず、local Git remote fixtureでmaterialize/verify、hook/config/filter hardening、dirty/origin fail-closed、暗黙materialize禁止、benchmark後cleanupを再現する。
