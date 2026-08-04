# MoonclawのRabbita job UIを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P1
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `vectie/moonclaw`

## 調査時revision

- `vectie/moonclaw`: `5fdc845f2a926cdd17260fb9720135a2c50eff38`

## 主な対象path

- `ui/rabbita-job/main/main.mbt`
- `ui/rabbita-job/main/update.mbt`

## Adapter方針

job UIのModel/Msg/updateを抽出し、daemon/API eventをeffect descriptorへ置換する。job IDをsmall finite corpusへ限定する。

## 最初に試すproperty仮説

- job completion後に古いprogress eventでrunningへ戻らない。
- cancelを重複送信しない。
- selected jobは存在するjobだけを指す。
- list reload中の古いresponseで新しいjobを消さない。
- error後にpending operationが残らない。

## 生成するaction・event

- job list success/failure
- select job
- start/cancel/retry
- progress/completed/failed events
- reload and stale response

## 受け入れ条件

- [ ] job lifecycle propertyを実装する。
- [ ] terminal stateの遷移表をmanifestへ持つ。
- [ ] cancel/retryの最小failureを探索する。
- [ ] large repository全体ではなくjob UI packageだけをpinする。

## 共通テスト

- pinned source hash validation
- adapter build and unit tests
- deterministic exploration rerun
- exact expected-failure signatureまたはzero-failure assertion
- HTML/JSON/SVG/DOT artifact確認
- `git diff --check`

## 注記

upstreamの実装上の事実と、非同期・browser boundaryを再現するためのtest harness仮定をreportで分離する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped
