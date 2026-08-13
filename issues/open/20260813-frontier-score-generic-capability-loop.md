# Frontier score and generic capability absorption loop

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P0
Depends-On: `20260813-novelty-weighted-frontier-corpus.md`

## 目的

Propedの進捗をfeature数ではなく、未知project topologyをproject固有adapterなしでgeneric capabilityへ吸収できた割合として継続測定する。

`external-frontier` corpusを実際に走らせ、その結果を主要KPIとして固定する。frontierはproduction regression gateではなく未知性の探索面なので、`minAutoOnboardingRate: 0`は維持しつつ、scoreとintervention reasonを独立して可視化する。

## Frontier score

最低限、各runで以下を機械可読に残す。

- auto-onboarded: `N / 7`
- auto-onboarding rate
- intervention project count
- intervention reason class別件数
- deterministic replay project count / observed project count / rate
- project-specific adapter LOC（常に0を要求）
- framework / project mode / server mode / package manager / state source distribution
- 前回runからのabsorbed / regressed target

## 開発ループ

1. `frontier` 7 targetを実走する。
2. intervention reasonをclassifyし、最も支配的または一般化価値の高いfailureを1件選ぶ。
3. project固有判定・project固有adapterを追加せず、generic inference / runtime / bootstrap / server lifecycle / workspace / sandbox capabilityとして吸収する。
4. 全frontierを再実行し、score deltaを記録する。
5. `7/7`、deterministic replay 100%、adapter LOC 0を満たしたfrontier集合はexternal production corpusへの昇格候補とする。
6. 昇格後は、さらに未知性の高いtopologyへfrontierを更新する。

## 初期frontier

- SvelteKit SSR + pnpm
- Astro static export
- Remix custom Express server
- Remix + Prisma SSR/DB
- Lit Web Components
- Yarn Berry PnP monorepo
- legacy React/Webpack

## 非目標

- framework名ごとの専用runnerを増やすこと。
- target ID / repository名を見た分岐を追加すること。
- frontierを通すためだけのfixture adapterを追加すること。
- frontier未対応をproduction regressionとして扱うこと。

## 受け入れ条件

- [x] frontier 7 targetを実materializeしてbenchmarkする。
- [x] 初回Frontier scoreを記録する。
- [x] intervention reasonをtarget別/class別に記録する。
- [x] deterministic replay率を記録する。
- [x] adapter LOC = 0を維持する。
- [x] 最初のfrontier failureを1件、generic capabilityとして吸収する。
- [x] 吸収後に全7 targetを再実行し、score deltaを記録する。
- [x] Frontier scoreを継続比較できるmachine-readable summary / CLI出力を整備する。
- [x] 7/7時のproduction昇格条件を自動判定できる。
- [ ] frontier targetのupstream viability（frozen install / declared build / declared setup / managed start）をqualificationし、壊れたpinをgeneric capability failureと混同しない。

## 実測ベースライン（2026-08-13）

外付けvolume上の初回runはnative package binaryの起動停滞を含み`1/7`だったため、benchmark環境ノイズとして分離した。内部`/tmp`へ同じ7 repositoryをfresh materializeして再計測した結果をcanonical baselineとする。

- auto-onboarded: **3/7**
- absorbed from noisy first run: `astroship`, `lit-web-components`
- deterministic replay: **3/3 = 100%**
- project-specific adapter LOC: **0**
- completed: Astro, Lit Web Components, legacy React/Webpack
- remaining: SvelteKit, Remix custom server, Remix+Prisma, Yarn Berry PnP monorepo
- latest intervention distribution: `prepare_failed: 1`, `server_readiness_failed: 2`, `workspace_prepare_failed: 1`

実走から、dependency prepareを無期限に待つ問題をbounded timeout + process-tree cleanupへ一般化した。またYarn PnP monorepoではproject subdirectoryではなくpackage-manager lockfileのあるworkspace install rootを基準にprepare/readinessを見る必要があることを確認し、generic install-root inferenceへ修正した。さらにancestorのexact `packageManager`継承と、local `workspace:*` dependencyのdependency-order prebuildをgeneric JavaScript workspace capabilityとして追加した。実frontierのYarn targetは`dependency_prepare_incomplete`から`workspace_prepare_failed`まで前進し、失敗workspace `@packages/shared-data`を明示できるようになった。その先でpinned Yarn 3.3.1自身が`.pnp.cjs`を読む段階のruntime errorになるため、target固有書換えやYarn upgradeで隠さず未吸収として残す。

残るtargetの調査ではcorpus viability問題も確認した。SvelteKitの元pinは重複mappingを含むbroken `pnpm-lock.yaml`、Remix custom-serverはupstream自身のproduction startがHTTP 500、Remix+PrismaはREADME記載の`npm run setup`がmigration/seed不整合で失敗する。PnP targetもworkspace dependency buildへ到達後、upstreamのnested Yarn scriptが失敗する。これらをframework固有hackで通すのではなく、健全なpin/targetへ置換するためのviability qualificationをfrontier KPIの前提条件として追加する。

intervention reasonは粗い`campaign_stage_failed`から、`project_build_failed` / `server_readiness_failed` / `browser_stage_failed` / `campaign_stage_timeout`へ分類した。fresh 7-target runではRemix 2件が`server_readiness_failed`、PnPが`workspace_prepare_failed`へ分離され、generic capability不足とupstream不健全をtarget/class単位で追跡できる。

## 成功状態

Propedの主要な進捗表現が「framework Xを追加した」ではなく、次のようになること。

- `frontier auto-onboarded: 3/7 -> 5/7`
- `intervention: server lifecycle 2 -> 0`
- `deterministic replay: 100%`
- `adapter LOC: 0`

この数字の改善を、以前は未知だったproject topologyがPropedのgeneric capabilityへ吸収された証拠として扱う。
