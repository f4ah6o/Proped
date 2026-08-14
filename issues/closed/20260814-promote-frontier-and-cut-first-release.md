# Promote frontier 7/7 to production and cut first release

Status: closed
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

- [x] promoted topology coverageをmachine-readableに列挙する。
- [x] promoted targetはexact revision / clean checkout / adapter LOC 0を維持する。
- [x] auto-onboarding 100%を要求する。
- [x] deterministic replay evidence 100%を要求する。
- [x] human intervention 0を要求する。
- [x] production external regression budgetを0のまま維持する。
- [x] strict sandbox capability requirementを弱めない。
- [x] checkout cleanup後にtracked/untracked stateがcleanであることを維持する。

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

- [x] `main` CI green。
- [x] self-contained production baseline green。
- [x] external production gate green。
- [x] promoted frontier topology regression gate green。
- [x] Linux strict sandbox / macOS constrained sandbox checks green。
- [x] managed runtime distribution flowがLinux / macOS / Windowsでgreen。
- [x] clean environmentで`proped setup` → `proped doctor --json` → `proped web campaign <repo>`を確認する。
- [x] deterministic replay 100%、human intervention 0、adapter LOC 0のevidenceをrelease notesへ記載する。
- [x] release archiveがNode / node_modules / Chromiumを同梱しないdistribution contractを維持する。
- [x] CHANGES / README / README.ja.mdにproduction promotionとFrontier scoreを記載する。
- [x] release artifact provenance / source SHAを確認する。

## 受け入れ条件

- [x] current frontier 7 topologyがproduction regression coverageへ昇格する。
- [x] 昇格後もproduction gateを弱めずgreenを維持する。
- [x] `frontierScore.promotionEligible = true`のevidenceを固定baselineとして保存する。
- [x] next frontier corpusを現在のproduction coverageと重複しない未知topologyで開始する。
- [x] 初回release gateをCIまたはmachine-readable commandで判定可能にする。
- [x] GitHub Releaseを作成できる状態までrelease workflowを通す。

## 成功状態

Propedの開発ループが `unknown topology -> viability qualification -> generic capability absorption -> 7/7 -> production promotion -> next frontier` として継続可能になり、最初の公開releaseがそのcontractを満たした状態から作成される。

## Resolution

- Promoted the proven frontier 7/7 into `promoted-production` with exact revisions, seven machine-readable topology IDs, adapter LOC 0, strict 100% auto-onboarding / replay thresholds, intervention 0, and regression budget 0.
- Fixed `frontierScore.promotionEligible = true` as committed promotion evidence and a stable seven-target production baseline; post-run checkout cleanup remains clean.
- Added `external-next-frontier` with eight non-overlapping topology axes and project-specific executable adapter LOC 0.
- Added the machine-readable release acceptance command; `node scripts/release_gate.mjs` passes 44/44 checks.
- Verified the self-contained production baseline at 5/5 and the pinned external production corpus at 11/11: auto-onboarding 100%, deterministic replay 100%, human intervention 0, adapter LOC 0.
- Added CI execution for external production and promoted-production under OS-enforced sandboxing, preserving the existing Linux strict and macOS constrained sandbox requirements.
- Absorbed the live external regressions generically: Vite config scratch, Cloudflare Vite `.wrangler`, MoonBit workspace `_build` / `.mooncakes`, bounded MoonBit JS bootstrap, nested Git-root sandbox scope, and credential-path masking without project-name adapters.
- Verified the macOS constrained live policy: source and Git writes denied, credential path reads denied, external network denied, loopback allowed.
- Verified clean-environment `proped setup -> proped doctor --json -> proped web campaign` auto-onboards with zero intervention.
- Verified native release archives exclude Node, `node_modules`, and Chromium payloads; release workflow retains source-SHA provenance and GitHub Release artifact creation.
- Updated CHANGES / README / README.ja.md with the production promotion and Frontier score.
- Local CI-equivalent validation is green. GitHub-hosted Actions are not run until these uncommitted changes are pushed.
