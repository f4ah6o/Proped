# Generic / domain semantic oracle boundary

Status: open
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

- [ ] domain hintなしのGeneric Browser成功がdomain successとして報告されない。
- [ ] reportからgeneric verified / domain verified / domain unverifiedを区別できる。
- [ ] approved projection/propertyを追加すると同じrunner上でdomain coverageが強化される。
- [ ] unsupported approved semantic hintはverified扱いにならない。
- [ ] LLM自由判定なしで結果が決まる。
- [ ] deterministic regression testを追加する。
- [ ] `git diff --check` と対象テストが通る。

## 非目標

- 任意domain semanticsの自動推論。
- 画面文言だけを根拠にした業務正当性判定。
- confidence scoreだけによる自動approval。

## 変更履歴

`CHANGES.md` impact: yes when shipped
