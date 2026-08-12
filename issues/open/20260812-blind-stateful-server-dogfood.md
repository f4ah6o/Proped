# Blind stateful server dogfood

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-12
Updated: 2026-08-12
Priority: P1
Depends-On: `20260812-domain-projection-property-contract.md`

## 目的

credentials不要の実server-stateアプリを未知repoからblind onboardingし、CRUD・session/auth境界・永続化・replayまでGeneric Browser中心で検証できる実績を追加する。

## Target条件

- OSS
- ローカル起動可能
- credentials不要
- database / durable stateあり
- CRUDあり
- authまたはsession概念あり
- browser UIあり
- seed/fixture準備が小さい
- Proped専用adapterを原則書かない

## Campaign

`discover -> prepare -> launch -> server detection -> browser onboarding -> CRUD discovery -> mutation -> reload/restart -> persistence verification -> replay -> cleanup`

最低限、Create / Read / Update / Delete / reload後永続性 / server再起動後永続性 / invalid操作 / session境界 / replay determinismを扱う。

## Semantic boundary

Generic側はentity count、identity、state projection変化、reload/restart後の保持までを検証する。値の業務的正しさはdomain oracleへ委譲する。

## 受け入れ条件

- [ ] 未知repoからruntime/server/browser surfaceを発見できる。
- [ ] project-specific executable adapter 0 LOCまたは極小manifestだけでcampaignできる。
- [ ] CRUDの少なくとも1往復を自動発見・実行できる。
- [ ] reloadとserver restart後のstateを検証できる。
- [ ] session/auth boundaryをcredentialsなしで観測できる。
- [ ] replayがdeterministic。
- [ ] domain未検証部分をsilent passしない。
