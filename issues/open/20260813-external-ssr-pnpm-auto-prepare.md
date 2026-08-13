# External SSR/pnpm auto-prepare production coverage

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1
Depends-On: `20260813-external-corpus-breadth-and-single-html-static.md`

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

- [ ] Canopy Wakuをfull revisionでexternal corpusへ追加する。
- [ ] Ensenzu pnpmをfull revisionでexternal corpusへ追加する。
- [ ] dependency未準備状態からCanopyがauto-prepare経由でcampaign executionへ到達する。
- [ ] dependency未準備状態からEnsenzuがexact pnpm/Corepack経由でcampaign executionへ到達する。
- [ ] runtime distributionに`waku` / `server-rendered` / `pnpm`が現れる。
- [ ] project-specific executable adapter LOCは0のまま。
- [ ] findingとonboarding successは独立のまま。
- [ ] benchmark後に両checkoutがpinned revisionへ戻りcleanになる。
- [ ] regression tests / README / README.ja.md / CHANGESを更新する。
- [ ] Rust / MoonBit / Web regression suiteがgreen。
