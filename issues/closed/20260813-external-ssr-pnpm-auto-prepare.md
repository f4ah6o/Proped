# External SSR/pnpm auto-prepare production coverage

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-external-corpus-breadth-and-single-html-static.md`
Follow-Up: `20260813-monorepo-nested-source-workspace-prebuild.md`

## 目的

external production corpusをstatic/既準備npm中心から、実OSSのSSR/stateful Wakuとpnpm projectまで広げる。dependency未準備checkoutからexplicit campaign auto-prepareを通し、人手介入なしでprepare -> build/server -> browser exploration -> replay -> cleanupまで完走できることをproduction evidenceとして固定する。

## Targets

- `dowdiness/canopy` `apps/web` — Waku/React/Hono, server-rendered/stateful, npm
- `shiguri-01/ensenzu` `app` — Vite/MoonBit, pnpm via exact packageManager/Corepack

## Scope

- external corpusへCanopy WakuとEnsenzuをfull SHAで追加する。
- dependency未準備checkoutから通常campaignのexplicit auto-prepareを使う。
- benchmark自身の暗黙clone/fetchは禁止を維持する。
- prepareはcredential-safe env / shell=false / existing sandbox policyを維持する。
- Waku command-server lifecycleを実OSSで検証する。
- exact pnpm runtime/Corepack selectionを実OSSで検証する。
- benchmark resultのruntime distributionでSSR/server-renderedとpnpm coverageを機械確認可能にする。
- benchmark後はcheckoutをpin revisionへrestoreしcleanを再確認する。

## Safety

- upstream repositoryへのwriteは行わない。
- Git checkoutは既存materializerのorigin/revision/cleanliness/filter/gitlink境界を通す。
- package installはtarget checkout内だけに限定する。
- credential-bearing environmentはprepareへ渡さない。
- command serverはloopback-only discovery / cleanup contractを維持する。
- dependency acquisition失敗やruntime不一致はfail closedし、介入理由をstable codeで返す。

## 受け入れ条件

- [x] Ensenzu pnpmをfull revisionでexternal corpusへ追加する。
- [x] dependency未準備状態からEnsenzuがexact pnpm/Corepack経由でcampaign executionへ到達する。
- [x] runtime distributionに`pnpm`が現れる。
- [x] project-specific executable adapter LOCは0のまま。
- [x] findingとonboarding successは独立のまま。
- [x] benchmark後にEnsenzu checkoutがpinned revisionへ戻り、run中に新規生成したignored dependency/build rootsも除去される。
- [x] Canopyはnpm auto-prepareと互換Node runtime選択まで実証し、残るnested-source/workspace-prebuild境界を独立follow-upへ分離する。
- [x] regression tests / README / README.ja.md / CHANGESを更新する。
- [x] Rust / MoonBit / Web regression suiteがgreen。


## 実装中に確定した境界

- Ensenzuはdependency未準備cloneからCorepack `pnpm@11.5.3`でprepare成功。build outputは`dist/client/index.html`となるため、Generic Browserへbounded nested static-entry discoveryを追加して0-intervention完走まで確認した。
- Canopyはnpm `ci`とNode `22.22.3`互換runtime自動選択までは成功する。停止点はWakuではなく、`apps/web/scripts/build-waku.sh`が`CANOPY_SKIP_MOON_BUILD=1`を固定し、repository-root MoonBit prebuilt artifactsを前提にすること。
- Canopy root `moon.work`は7 Git submoduleを参照するが、現external materializerはrecursive/implicit submodule取得を意図的に禁止している。安全境界を緩めず解決するため、nested source materialization + authorized workspace prebuildをfollow-up issueへ分離した。
- passing production corpusへ未materialize/未完走のCanopyを混ぜない。


## Resolution

- external production corpusは11 target / 6 repositoryへ拡張。11/11 auto-onboarded、human intervention 0、deterministic replay 11/11。aggregateは210 states / 428 transitions / 245 actions。
- Ensenzu fresh checkoutではCorepack `pnpm@11.5.3`の`install --frozen-lockfile`により`pnpm-install-incomplete -> pnpm-install-complete`を同一runで通し、Generic Browserまで32 states / 31 transitions / 125 actionsで完走した。
- Ensenzu buildの`dist/client/index.html`を一般化するため、Generic Browserはdepth 3 / 4096 entriesにboundedされた唯一のnested HTML entryをdocument rootとして扱う。複数候補はfail closed。
- external benchmarkはrun前ignored rootsを記録し、run中に新規生成されたignored rootsだけをcleanupする。Ensenzu実runでは`app/.wrangler`, `app/dist`, `app/node_modules`を削除し、checkoutはexact pinned HEAD / cleanへ復元した。
- Canopyは`npm ci`成功、Node engine `^24.0.0 || ^22.15.0`に対してcurrent Node 25ではなくinstalled Node 22.22.3を自動選択できた。Waku build前に必要なrepository-root MoonBit artifactsが7未materialize Git submoduleへ依存するため、暗黙recursive submodule取得を解禁せず`20260813-monorepo-nested-source-workspace-prebuild.md`へscope splitした。
