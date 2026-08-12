# Domain projection / property hint contract

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-12
Updated: 2026-08-12
Priority: P0
Depends-On: `20260812-semantic-oracle-boundary.md`

## 目的

Generic Browserでは判定できないdomain semanticsを、最小限のprojection/property hintとして安全に注入できる契約を固定する。

## 方針

- 既存semantic review / approval workflowへ統合する。
- hintは候補発見とapproved runtimeを分離する。
- projectionは観測可能な状態をdomain-relevantな有限表現へ縮約する。
- propertyはprojectionや遷移に対するdeterministic predicateとして扱う。
- 実行不能・曖昧・未承認hintはdomain verified coverageへ入れない。
- project-specific adapter codeを必須にしない。

## 想定例

- Undo前後のentity集合・順序projection
- SQL import前後のcanonical row projection
- canvas上のnode/edge identity projection
- domain invariantとしてのreferential integrity / roundtrip equivalence

## 受け入れ条件

- [x] projection/property hintのversioned machine-readable contractがある。
- [x] approval前の候補は自動実行されない。
- [x] approvedかつ実行可能なhintだけがruntime coverageへ昇格する。
- [x] unsupported hintはfail-openせずdiagnosticとして残る。
- [x] replayで同一domain verdictを再現できる。
- [x] generic-only campaignはhintなしで引き続き動作する。

## 実装結果

- `protocol/web-domain-hint-contract.mjs` に contract v1 を追加した。
- property contract は deterministic input + predicate を machine-readable に固定する。現時点の executable contract は `generic-property-pack:reload-persistence` + `no-failures`。
- projection contract は `browser-state` selector を固定する。`route-identity` と payloadを保持しない `persistence-summary` を executable とした。
- semantic candidate -> review -> human approval -> approved hints の経路で contract と semantic hash を保持する。
- approved property/projection は contract がなければ runtime coverage に入らず `approved_semantic_contract_missing` を返す。
- syntactically valid でも executor/projector がない contract は `approved_semantic_contract_unsupported` として保持し、`domain_unverified` のままにする。
- semantic oracle boundary は property id のハードコードではなく approved runtime contract を評価して `domain_verified` / `domain_failed` を決める。
- generic-only campaign は hintなしで従来どおり動作する。

## 検証

- `node scripts/test_web_domain_hint_contract.mjs`
- `node scripts/test_web_semantic_property_candidates.mjs`
- `node scripts/test_web_semantic_projection_candidates.mjs`
- `node scripts/test_web_semantic_review_report.mjs`
- `node scripts/test_web_semantic_approval.mjs`
- `node scripts/test_web_approved_semantics_runtime.mjs`
- `node scripts/test_web_semantic_oracle_boundary.mjs`
- `node scripts/test_web_semantic_apply.mjs`
- `node scripts/test_web_generic_property_packs.mjs`
- `node scripts/test_web_exploration_stage_quality.mjs`
- `git diff --check`
