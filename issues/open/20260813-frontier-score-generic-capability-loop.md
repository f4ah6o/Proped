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

- [ ] frontier 7 targetを実materializeしてbenchmarkする。
- [ ] 初回Frontier scoreを記録する。
- [ ] intervention reasonをtarget別/class別に記録する。
- [ ] deterministic replay率を記録する。
- [ ] adapter LOC = 0を維持する。
- [ ] 最初のfrontier failureを1件、generic capabilityとして吸収する。
- [ ] 吸収後に全7 targetを再実行し、score deltaを記録する。
- [ ] Frontier scoreを継続比較できるmachine-readable summary / CLI出力を整備する。
- [ ] 7/7時のproduction昇格条件を自動判定できる。

## 成功状態

Propedの主要な進捗表現が「framework Xを追加した」ではなく、次のようになること。

- `frontier auto-onboarded: 3/7 -> 5/7`
- `intervention: server lifecycle 2 -> 0`
- `deterministic replay: 100%`
- `adapter LOC: 0`

この数字の改善を、以前は未知だったproject topologyがPropedのgeneric capabilityへ吸収された証拠として扱う。
