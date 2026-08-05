# MoonclawのRabbita job UIを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
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

- [x] job lifecycle propertyを実装する。
- [x] terminal/live status区分をadapterとmanifest propertyへ固定する。
- [x] pinned Jobs surfaceにcancel/retry messageがないことを確認し、ACP/Cowork scopeを別境界として明記する。
- [x] large repository全体ではなくjob UI packageだけをpinする。

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


## 実装結果

- `moonclaw-job`を10番目のexternal targetとして追加した。
- `ui/rabbita-job/main/update.mbt`と`model_types.mbt`をApache-2.0 sourceとして保存し、revisionとSHA-256を固定した。
- HTTP snapshot requestとstream closureをdescriptor化し、同一runのresponseを逆順注入できるnative adapterを実装した。
- 720 state・2,269 transitionを探索し、1 failure・0 diagnosticsを保持した。
- 最小trace:
  1. `StreamClosed("run-1")`
  2. `StreamClosed("run-1")`
  3. `SnapshotLoaded(request=2, run="run-1", status=Succeeded)`
  4. `SnapshotLoaded(request=1, run="run-1", status=Running)`
- selected run不一致response、timeline重複、pending request ID、rendering propertyはpassした。
- browser・daemon・Cowork・ACPは実行せず、Jobs surfaceだけを対象にした。
