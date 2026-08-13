# Refresh frontier to seven viable unknown topologies

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-14
Priority: P0
Depends-On: `20260813-frontier-score-generic-capability-loop.md`

## 目的

Frontier scoreをPropedのgeneric capability KPIとして意味のあるものにするため、upstream/pin lifecycle自体が不健全なtargetを、同等以上に未知性が高く、declared lifecycleが実行可能なpinned public projectへ置換する。

開始時のcanonical runはraw auto-onboarding 3/7、viability qualified 3 / failed 4だった。最終fresh v6では7件すべてがviableかつauto-onboardedとなり、raw scoreがそのままgeneric capabilityを表す状態へ到達した。

## 採用した replacement

1. **SvelteKit monorepo**: `huntabyte/shadcn-svelte` / `docs` / `dabbd4c00fbca1feef29a2a155b2eecf6bb4ea7a`
   - exact clean checkout、frozen pnpm install、declared build/preview、Generic Browser、replayまで完走。
   - dependency engine mismatchを明示diagnosticから再交渉するgeneric Node runtime negotiationでqualification。
2. **custom server**: `remix-run/react-router-templates` / `node-custom-server` / `b68be71489a22315c7a734a86a18347745b393d2`
   - React Router framework-mode + Express custom server signalをgeneric inferenceへ昇格。
   - install/build/start/browser/replay完走、adapter LOC 0。
3. **SSR + embedded DB**: `hsnice16/agent-friendly-code` / `70ca3d5f379c3ad8f8e9b4cc57f131ef8de3abc6`
   - Next.js + Bun + committed SQLite (`better-sqlite3`)。
   - browser lifecycleは健全だったが、coverage-guided explorationのtrace replay量を外側watchdogが過小評価していた。
   - `maxTransitions * maxDepth`のbounded replay workをtimeout budgetへ反映し、探索上限を弱めず完走。
4. **Yarn Berry PnP monorepo**: `yarnpkg/berry` / `packages/docusaurus` / `57081c05a398f25c92df1dc78752f2053576cec0`
   - immutable install、workspace prebuild、Docusaurus build/browser/replayを完走。
   - package graph cycleとbuild graph cycleを分離し、build scriptを持つworkspaceへprebuild graphを縮約。
   - open-ended `engines.node >=18.12`で最新Nodeを優先せず、installed compatible runtimeの下限寄りを選ぶgeneric policyによりNode 20.20.0を選択。Node 25のupstream internal assertionをproject固有pinなしで回避。

維持target: Astroship、Lit Web Components、TodoMVC React/legacy Webpack。

## 追加で吸収したgeneric capability

- **Atomic shallow corpus materialization**
  - fresh external checkoutはhidden stagingへexact SHAをdepth=1 fetchし、checkout/verify完了後のみfinal pathへrenameする。
  - interrupted checkoutやdisk exhaustionでpartial final checkoutを残さない。
  - Yarn Berryのfull-history `.git` 約2.8GB取得も不要になった。
- **Bounded browser watchdog cost model**
  - coverage-guided explorationがfrontier state復元でtraceをreplayする実作業量をtimeoutへ反映。
  - exploration boundsそのものは変更しない。
- **Isolated subprocess lifecycle**
  - build / prepare / workspace-prebuildをisolated process groupで実行し、成功stageが残したhelper daemonもstage終了時にcleanupする。
  - managed command serverもdescendant/process-group cleanupを強化。
  - real `shadcn-svelte/docs` campaignで以前孤児化していた`workerd`が終了後0件になることを確認。

## Final evidence

fresh `/tmp/proped-frontier-v6`、exact pinned checkout 7件で一括benchmark:

- auto-onboarded: **7/7 (100%)**
- viability: **qualified 7 / failed 0 / unknown 0**
- generic capability: **7/7 (100%)**
- deterministic replay: **7/7 (100%)**
- human intervention: **0**
- project-specific adapter LOC: **0**
- regressions: **0**
- aggregate: **117 states / 219 transitions / 238 actions**
- absorbed from v5: `agent-friendly-code`, `yarn-berry-docusaurus`
- `frontierScore.promotionEligible = true`

Production self-contained baseline gateも5/5 auto-onboarded、5/5 deterministic replay、intervention 0、adapter LOC 0、baseline regression 0でpassした。
Production external gateもverified pinned OSS 11/11 auto-onboarded、11/11 deterministic replay、intervention 0、adapter LOC 0、checkout cleanup cleanでpassした。

## 受け入れ条件

- [x] 4 replacement candidateをpublic OSSから選定しexact revisionをpinする。
- [x] candidate qualificationをmachine-readableに実行・記録する。
- [x] frontier 7/7が`viability.status = qualified`になる。
- [x] frontier全7件をfresh checkoutで再benchmarkする。
- [x] generic capability failureをproject固有hackなしで吸収する。
- [x] deterministic replay 100%を維持する。
- [x] project-specific adapter LOC = 0を維持する。
- [x] production gateを弱めない。

## 成功状態

`frontierScore.viability.qualified = 7`、raw `autoOnboarded = 7/7`、`promotionEligible = true`へ到達した。現在のfrontier集合はproduction昇格候補として成立したため、本issueをcloseする。次のfrontierはこの7/7を基準に、さらに未知性の高いtopologyへ更新する。
