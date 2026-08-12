# Domain projection / property hint contract

Status: open
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

- [ ] projection/property hintのversioned machine-readable contractがある。
- [ ] approval前の候補は自動実行されない。
- [ ] approvedかつ実行可能なhintだけがruntime coverageへ昇格する。
- [ ] unsupported hintはfail-openせずdiagnosticとして残る。
- [ ] replayで同一domain verdictを再現できる。
- [ ] generic-only campaignはhintなしで引き続き動作する。
