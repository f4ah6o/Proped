# Explicit nested source materialization and workspace prebuild

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-external-ssr-pnpm-auto-prepare.md`

## 目的

monorepo内のWeb subprojectが、pinされたGit submodule群とrepository-root build artifactsを前提にする場合でも、暗黙のrecursive submodule取得やproject-specific executable adapterを導入せず、安全にsource materialization -> workspace prebuild -> project campaignへ接続する。

最初のreal targetは`dowdiness/canopy` `apps/web`。現状はnpm auto-prepareと互換Node 22.22.3選択までは成功するが、repository rootのMoonBit prebuilt artifactsがなくWaku buildがfail closedする。root `moon.work`は7個のGit submoduleを参照しており、現在のexternal materializerは意図的にsubmodule取得を無効化している。

## Scope

- corpusでnested Git sourcesを明示的に列挙・pinできるcontractを追加する。
- parent revisionのgitlink SHA / `.gitmodules` path+URLと宣言を照合する。
- nested sourceはfull SHA、credential-free HTTPS/file/absolute-local sourceのみ許可する。
- hooks / credential helper / fsmonitor / checkout filter / recursive submodule acquisitionをnested sourceでも無効化する。
- nested sourceを再帰取得しない。
- authorized checkout rootをworkspace scopeとしてcampaignへ渡せるようにする。
- `moon.work`のような既知workspace descriptorから、structured argvのworkspace prebuildを安全に推定する。
- MoonBit workspaceの場合はshell scriptを推定実行せず、`moon build --target js --release`のようなknown-tool argvだけを候補にする。
- workspace prebuild outputのwrite boundaryとpost-run cleanupをmachine-readableにする。
- Canopy Wakuを0 project-specific executable adapter LOCでbuild/server/browser/replayまでdogfoodする。

## Canopy pinned nested source evidence

Parent: `dowdiness/canopy@cb41945b04801084e8abe1d8edc27eb0cdce4a1c`

| path | repository | gitlink revision |
| --- | --- | --- |
| `deps/alga` | `https://github.com/dowdiness/alga.git` | `203c89023b56f5b0b079198f22e528c8b136e3b3` |
| `deps/event-graph-walker` | `https://github.com/dowdiness/event-graph-walker.git` | `15446cae536e8d4fcfe0b044f5800351a097e1db` |
| `deps/graphviz` | `https://github.com/dowdiness/graphviz.git` | `546c0e689cd7fa4883e212e6a9b7495f9be46946` |
| `deps/loom` | `https://github.com/dowdiness/loom.git` | `9f630d67a781b1ff7da741c745de50702daa3984` |
| `deps/order-tree` | `https://github.com/dowdiness/order-tree.git` | `99edee1a3b13d06e5dfd44c6ad822845d0614a6c` |
| `deps/rabbita` | `https://github.com/moonbit-community/rabbita.git` | `67e8169efa1bb2e8bd17018b62b41211cbc4c357` |
| `deps/svg-dsl` | `https://github.com/dowdiness/svg-dsl.git` | `5e643ae674fc6e6d76f991be3eccdd62f7e62f77` |

`apps/web`のnpm auto-prepareは成功済みで、Node engine `^24.0.0 || ^22.15.0`に対してcurrent Node 25を使わずinstalled Node `22.22.3`を選択できている。buildの停止点は`apps/web/scripts/build-waku.sh`が`CANOPY_SKIP_MOON_BUILD=1`でWaku buildを起動し、上記nested sourceを含むroot `moon.work`のprebuilt JS artifactsを要求する箇所。したがってnested source materializationとworkspace prebuildが成立すれば、その後のWaku command-server campaignを直接再開できる。

## Safety

- recursive/implicit submodule acquisitionは禁止。
- `.gitmodules`だけを根拠に全submoduleを自動取得しない。corpus/authorized workspace contractで明示されたnested sourceだけを対象にする。
- arbitrary repository shell scriptを自動実行しない。
- source URL / revision / checkout containment不一致はfail closed。
- upstream writeは行わない。

## 受け入れ条件

- [x] local Git fixtureでexplicit nested source materializationを再現できる。
- [x] gitlink SHA / path / origin mismatchをfail closedできる。
- [x] nested checkoutのhook/filter/recursive acquisitionを禁止できる。
- [x] authorized workspace root外へのcommand cwdを拒否し、nested checkout pathのcontainment/symlink境界をfail closedできる。
- [x] known-tool workspace prebuildをstructured argvで表現できる。
- [x] Canopyの7 pinned nested source path / URL / gitlink SHAをchecked-in dogfood corpusへ固定する。
- [ ] Canopyの7 nested sourcesを実checkoutへ明示materializeする。
- [ ] Canopy root MoonBit prebuildからWaku build/serverへ接続できる。
- [ ] Canopyが0 adapter LOC / 0 human interventionでcampaign executionへ到達する。
- [x] local integrationでbenchmark後にparent+nested checkoutをpin状態へrestoreできる。
- [x] regression tests / docs / CHANGESを更新する。


## Implementation progress

- `source.nestedSources[]`をcorpus schemaへ追加。各entryはrelative path / Git URL / full SHAで正規化し、共有checkoutでnested identityが食い違う場合は拒否する。
- materializerは親revisionのgitlink mode+SHAと`.gitmodules` path/URLを照合してからnested sourceを独立cloneする。nested checkout自身もhook/filter/global Git config/recursive submodule取得を無効化する。
- state capture/restoreはparentとnestedを別々に扱い、run中に生成したuntracked/new ignored stateだけを戻す。
- `moon.work`をauthorized workspace rootで検出した場合に限り、`moon build --target js --release`をstructured argv / `shell=false` / credential-safe envでprebuildする。`--no-prepare`では`workspace_prepare_required`。
- Canopy dogfood corpusは親`cb41945b...`と7 gitlinkを固定済み。現hostではnested checkoutが未materializeのためverifyは意図どおり`nested-source-invalid`でfail closedしている。
