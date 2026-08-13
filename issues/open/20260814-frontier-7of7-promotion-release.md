# Frontier 7/7 generic capability absorption and first release

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-14
Updated: 2026-08-14
Priority: P0
Depends-On: `20260813-refresh-frontier-viable-topologies.md`

## 目的

qualified frontierをPropedのgeneric capabilityへ順次吸収し、7/7 auto-onboarding・deterministic replay 100%・project-specific adapter LOC 0を満たした時点でproduction corpusへ昇格し、初回release gateまで固定する。

## 現在地

- production baseline gateはstrict sandbox下でgreen。
- frontierはtarget viabilityとProped generic capabilityを分離して計測できる。
- React Router + Express custom serverはgeneric inferenceへ吸収済み。
- Yarn Berry PnP monorepoはgeneric build graph修正によりcampaign完走済み。
- SSR + embedded SQLite targetはbrowser lifecycleまで到達し、Generic Browser timeoutが残る。
- SvelteKit replacementではpackage-manager由来のNode requirementを使うruntime negotiationが次の吸収対象。
- adapter LOCは0を維持する。

## 実装方針

1. 既存のviability issueを完了し、frontier 7件すべてを`viability.status = qualified`にする。
2. qualified targetのinterventionをstage/reason単位で並べ、再利用性の高いgeneric capability gapから吸収する。
3. project/repository/framework名による分岐、fixture固有selector、個別adapterは追加しない。
4. capability追加後はfrontier全体を再benchmarkし、regressionを検出する。
5. `frontierScore.genericCapability`を主要KPIとして継続記録する。
6. 7/7到達後、成功topologyをproduction regression corpusへ昇格する。
7. 昇格後のgreen stateを初回release candidateとする。

## 優先吸収対象

### P0: SSR + embedded DB browser lifecycle

Generic Browser timeoutをgeneric signalで分解し、readiness / navigation / hydration / long-lived request / server-rendered stateのどこで停滞するかを観測する。target固有timeout延長では解決しない。

### P0: SvelteKit runtime negotiation

package-managerが返すNode engine requirementをboundedに取得し、static inspectionと矛盾しない範囲でmanaged Node runtimeを再選択する。prepare再試行は最大1回とし、根拠・旧version・新versionをmachine-readable reportへ残す。

### P1: promotion gate

以下を同時に満たす場合だけproduction昇格可能とする。

- viability qualified = 7/7
- auto-onboarded = 7/7
- deterministic replay = 100%
- project-specific executable adapter LOC = 0
- production external regression = 0
- required sandbox capabilityを満たす

## Production昇格

7/7到達後は成功したtopologyをproduction regression coverageへ移す。最低限、SvelteKit、Astro、React Router custom server、SSR+DB、Lit Web Components、Yarn Berry PnP monorepo、legacy Webpackのshapeを継続観測する。frontierにはさらに未知性の高いtargetを補充する。

## 初回release gate

- [ ] `main` CI green。
- [ ] production onboarding baseline gate green。
- [ ] external production regression 0。
- [ ] promoted frontier topologyをproduction gateが継続観測する。
- [ ] Linux strict sandbox / macOS constrained sandbox green。
- [ ] managed runtime flowがLinux / macOS / Windowsでgreen。
- [ ] deterministic replay 100%とadapter LOC 0をrelease noteへ記載できる。
- [ ] clean environmentで`proped setup` → `proped doctor --json` → `proped web campaign <repo>`を確認する。
- [ ] CHANGES / README / README.ja.mdを更新する。

## 受け入れ条件

- [ ] frontier 7/7が`viability.status = qualified`。
- [ ] frontier 7/7がauto-onboarded。
- [ ] deterministic replay 100%。
- [ ] adapter LOC = 0。
- [ ] intervention required target = 0。
- [ ] generic capability吸収にproject-specific branchがない。
- [ ] production external gateを弱めない。
- [ ] 成功topologyをproduction regression corpusへ昇格する。
- [ ] 昇格後にmain CIがgreen。
- [ ] 初回release gateをCIまたはmachine-readable outputで判定可能にする。

## 成功状態

`frontierScore.promotionEligible = true`となり、7件すべてがproduction regression coverageへ昇格する。以降はfrontierを新しい未知topologyで更新し、「未知だったshapeをadapter 0でgeneric capabilityへ吸収した数」を継続KPIとする。
