# Blind stateful server dogfood

Status: closed
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

- [x] 未知repoからruntime/server/browser surfaceを発見できる。
- [x] project-specific executable adapter 0 LOCまたは極小manifestだけでcampaignできる。
- [x] CRUDの少なくとも1往復を自動発見・実行できる。
- [x] reloadとserver restart後のstateを検証できる。
- [x] session/auth boundaryをcredentialsなしで観測できる。
- [x] replayがdeterministic。
- [x] domain未検証部分をsilent passしない。

## Resolution

Generic Browserに`stateful-server` property packを追加し、Create / Read / Update / Delete、invalid操作、reload、managed server restart、session境界、replay projectionを同一campaignで検証するようにした。server-stateの成立判定にはread-only server hook projectionを要求し、DOM遷移やbrowser storageだけでは`generic-covered`へ昇格しない。

managed command serverは同一loopback portでrestartできるようになった。bounded mutationは既定denyのままで、manifestの`server.mutationPolicy = "bounded-managed"`または対応CLI opt-in時だけ許可する。host credential environmentは従来どおりdenyする。Generic Browserはself-hosted UI向けに現在のorigin/URLをinput corpusへ加え、非英語のmutation labelもbounded/destructiveへ分類する。

実OSS dogfoodは2対象で実施した。`moonbitlang/OSC2026`ではPython stdlib HTTP server、SQLite、auth/session surfaceをblind inspectionし、managed local launch後にGeneric Browserだけでself-host backend接続、管理画面のread surface、GitHub session境界、create/save/archive mutation surfaceまで到達した。product側のproject-specific adapterは0 LOC。server projection oracleなしの実対象結果は意図的に`generic-unverified`のまま保持する。

`moonbit-community/isomorphic/taskflow`ではbrowser UI / SQLite / registration-login session / Task CRUD / invalid transitionを備える対象として選定したが、現行MoonBit toolchainとのdependency driftをscratch dependency cacheだけで補正した後も、最初のHTTP requestでupstream `mocket` nativeのBytesView互換panicを再現した。target sourceは変更しておらず、これは`target-runtime-incompatible`として証跡化した。

完全な受入は`node scripts/test_web_stateful_server_pack.mjs`で固定した。read-only server projection付きdisposable stateful serverに対しCRUD 4 family、invalid操作のsafe rejection、reload/restart persistence、session境界を検証し、3回replayでfailure-classとcoverage projectionのdeterminismを確認する。実OSSと再現可能なgeneric acceptanceの証跡は`protocol/fixtures/blind-stateful-server-dogfood.json`に固定した。
