# Proton Todoの非同期snapshot順序を探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `justjavac/proton-demo`
- `moonbit-community/proton`

## 調査時revision

- `justjavac/proton-demo`: `5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d`
- `moonbit-community/proton`: `7e819f385af0c7cc7b78397281b1ab5c3306bc5f`

## 主な対象path

- `frontend/main/main.mbt`
- `proton/facade_updater.mbt`
- `cli/new/templates/todo/`

## Adapter方針

pureな`Model/Msg/update`を再利用し、`@proton_rabbita.invoke`とsubscriptionをeffect descriptorへ置換する。responseとして任意versionの`SnapshotReceived`を順序入替可能にする。

## 最初に試すproperty仮説

- `snapshot.version`は受理後に減少しない。
- 古いsnapshot responseは新しいstateを上書きしない。
- 同一Createを連打しても空titleや重複commandを無制限に生成しない。
- CommandFailed後にloadingが残らない。
- subscription responseとcommand responseの競合でerrorまたはsnapshotが不整合にならない。

## 生成するaction・event

- Load
- DraftChanged(empty/space/normal/unicode)
- Create
- SetCompleted(existing/missing)
- Delete(existing/missing)
- SnapshotReceived(version 0..3)
- CommandFailed
- subscription snapshot injection

## 受け入れ条件

- [x] 最小adapterでnative探索できる。
- [x] response順序をboundedな有限action列とpermutation helperで探索する。
- [x] version rollbackを再現し、最小traceを保存する。
- [x] upstreamの無相関受理を事実として分離し、manifest-declared monotonic propertyとして記録する。

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

## 結果

- Property: `snapshot version never decreases`
- Minimal trace: `SnapshotReceived(version=1) -> SnapshotReceived(version=0)`
- Stable action IDs: `snapshot:1 -> snapshot:0`
- Exploration: 320 states、618 transitions、1 retained failure、0 diagnostics
- Upstream source SHA-256: `69787a7a175b323ba0c6e01ea2acfc8692379ed938217bcf00c7d3a8c1f79c8b`
- 外部repositoryはread-onlyで扱い、upstream側へのwrite操作は行っていない。
