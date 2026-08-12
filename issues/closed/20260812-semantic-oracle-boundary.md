# Generic / domain semantic oracle boundary

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-12
Updated: 2026-08-12
Priority: P0

## 目的

Generic Browserが機械的に保証できるsemantic検証と、domain knowledgeを必要とするoracleを明示的に分離する。

Generic側の成功をdomain correctnessの成功へ昇格させず、domain oracleがないcampaignでは `domain_unverified` を機械可読に残す。

## Genericで自動判定してよい範囲

- crash / hang
- navigation
- persistence
- accessible action成立
- semantic state change
- replay determinism
- framework-neutral invariant/property violation

## Domain oracleへ委譲する範囲

- Undo後の業務的な正しさ
- import/exportやSQL結果の意味的同値性
- canvas / graph上のentity relationshipの業務妥当性
- domain固有の計算・集計結果の正当性

## 方針

- LLMの自由回答をoracleとして要求しない。
- 既存のsemantic review / approval / projection / property runtimeをsource of truthとして再利用する。
- reportにgeneric verificationとdomain verificationを別フィールドで保持する。
- domain hintsが存在しない場合はsilent passにせず `domain_unverified` を明示する。
- domain hintsが存在しても、approvedかつ実行可能なoracleだけをverified coverageへ数える。
- 同一入力・同一hint集合では結果とsemantic hashをdeterministicにする。

## 受け入れ条件

- [x] domain hintなしのGeneric Browser成功がdomain successとして報告されない。
- [x] reportからgeneric verified / domain verified / domain unverifiedを区別できる。
- [x] approved projection/propertyを追加すると同じrunner上でdomain coverageが強化される。
- [x] unsupported approved semantic hintはverified扱いにならない。
- [x] LLM自由判定なしで結果が決まる。
- [x] deterministic regression testを追加する。
- [x] `git diff --check` と対象テストが通る。

## 非目標

- 任意domain semanticsの自動推論。
- 画面文言だけを根拠にした業務正当性判定。
- confidence scoreだけによる自動approval。

## 変更履歴

`CHANGES.md` impact: yes when shipped

## 実装結果

- Generic Browser stageへ `semanticVerification.generic` / `semanticVerification.domain` を追加した。
- generic checks/replayの成功は `generic_verified` として保持し、domain correctnessとは分離した。
- human-approvedかつ実行可能なpropertyだけが `domain_verified` / `domain_failed` を生成する。
- approved projectionは観測coverageへ加えるが、単体ではdomain correctnessを証明しない。
- unsupported approved hintは `domain_unverified` のままdiagnosticへ残し、verified coverageへ数えない。
- semantic boundaryのsemantic hashをrunner全体のsemantic hashへ組み込んだ。
- deterministic unit testとGeneric Browser stage回帰を追加した。

### 検証

- `node scripts/test_web_semantic_oracle_boundary.mjs`
- `node scripts/test_web_approved_semantics_runtime.mjs`
- `node scripts/test_web_generic_property_packs.mjs`
- `node scripts/test_web_semantic_apply.mjs`
- `node scripts/test_web_project_manifest_v2.mjs`
- `node scripts/test_web_exploration_stage_quality.mjs`
