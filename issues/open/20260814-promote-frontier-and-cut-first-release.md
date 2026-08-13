# Promote frontier 7/7 to production and cut first release

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-14
Updated: 2026-08-14
Priority: P0
Depends-On: `20260813-refresh-frontier-viable-topologies.md`

## 目的

7/7まで到達したfrontier capabilityを一過性のdogfoodで終わらせずproduction regression contractへ昇格し、そのgreen stateをProped初回releaseの受け入れ基準として固定する。同時にfrontierはさらに未知性の高いtopologyへ更新し、generic capability absorption loopを継続する。

## 現在地

fresh frontier v6の実測は以下。

- viability qualified: **7/7**
- auto-onboarded: **7/7 (100%)**
- generic capability: **7/7 (100%)**
- deterministic replay: **7/7 (100%)**
- human intervention: **0**
- project-specific adapter LOC: **0**
- regressions: **0**
- aggregate: **117 states / 219 transitions / 238 actions**
- `frontierScore.promotionEligible = true`

production self-contained baselineは5/5、production external gateはverified pinned OSS 11/11でauto-onboarding / deterministic replayとも100%、intervention 0、adapter LOC 0、regression 0を維持している。

## Production昇格

現在のfrontierで証明した次のshapeをproduction regression contractへ移す。

- SvelteKit monorepo + runtime renegotiation
- Astro static export
- React Router framework-mode + Express custom server
- SSR + embedded SQLite + Bun
- Lit Web Components
- Yarn Berry PnP monorepo + workspace prebuild
- legacy Webpack

昇格は単にtargetをコピーするのではなく、各shapeで吸収したgeneric capabilityが後退した場合にCIがfailするcontractとして表現する。project/repository名による特例やadapterは追加しない。

## Promotion gate

- [ ] promoted topology coverageをmachine-readableに列挙する。
- [ ] promoted targetはexact revision / clean checkout / adapter LOC 0を維持する。
- [ ] auto-onboarding 100%を要求する。
- [ ] deterministic replay evidence 100%を要求する。
- [ ] human intervention 0を要求する。
- [ ] production external regression budgetを0のまま維持する。
- [ ] strict sandbox capability requirementを弱めない。
- [ ] checkout cleanup後にtracked/untracked stateがcleanであることを維持する。

## Next frontier

productionへ昇格した7 shapeと重複しない未知性を優先する。framework名の追加ではなく、project topology / runtime / lifecycleの未知性で選定する。

候補軸:

- multi-runtime repository（Node + non-Node build tool）
- auth redirect / callbackを含むがcredentialなしでlocal lifecycleを再現できるproject
- service worker / offline-first / IndexedDB-heavy application
- WebSocket / SSE long-lived lifecycle
- generated-code prerequisiteを持つworkspace
- nonstandard build output discovery
- workspace package manager境界が複数あるmonorepo
- custom preview/server wrapperを持つstatic generator

新frontierもproject-specific executable adapter LOC = 0をstructural gateとし、viabilityとgeneric capabilityを分離して測る。

## 初回release gate

- [ ] `main` CI green。
- [ ] self-contained production baseline green。
- [ ] external production gate green。
- [ ] promoted frontier topology regression gate green。
- [ ] Linux strict sandbox / macOS constrained sandbox checks green。
- [ ] managed runtime distribution flowがLinux / macOS / Windowsでgreen。
- [ ] clean environmentで`proped setup` → `proped doctor --json` → `proped web campaign <repo>`を確認する。
- [ ] deterministic replay 100%、human intervention 0、adapter LOC 0のevidenceをrelease notesへ記載する。
- [ ] release archiveがNode / node_modules / Chromiumを同梱しないdistribution contractを維持する。
- [ ] CHANGES / README / README.ja.mdにproduction promotionとFrontier scoreを記載する。
- [ ] release artifact provenance / source SHAを確認する。

## 受け入れ条件

- [ ] current frontier 7 topologyがproduction regression coverageへ昇格する。
- [ ] 昇格後もproduction gateを弱めずgreenを維持する。
- [ ] `frontierScore.promotionEligible = true`のevidenceを固定baselineとして保存する。
- [ ] next frontier corpusを現在のproduction coverageと重複しない未知topologyで開始する。
- [ ] 初回release gateをCIまたはmachine-readable commandで判定可能にする。
- [ ] GitHub Releaseを作成できる状態までrelease workflowを通す。

## 成功状態

Propedの開発ループが `unknown topology -> viability qualification -> generic capability absorption -> 7/7 -> production promotion -> next frontier` として継続可能になり、最初の公開releaseがそのcontractを満たした状態から作成される。
