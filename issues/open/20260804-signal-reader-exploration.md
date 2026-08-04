# Signal Readerのstale responseとoptimistic updateを探索する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `CAIMEOX/signal_reader`

## 調査時revision

- `CAIMEOX/signal_reader`: `e2867cd5ca46fc54a8b72ee45ea3d9a7b4db9b6a`

## 主な対象path

- `frontend/app.mbt`
- `frontend/update.mbt`
- `frontend/frontend_wbtest.mbt`

## Adapter方針

673行のupdateをapp domainごとに分割し、HTTP/DB commandをrequest descriptorへ置換する。request generation IDをtest harness側で付与し、response順序を任意化する。

## 最初に試すproperty仮説

- Feed A選択後にFeed Bへ移動した場合、Aの遅延responseがBのitemsを上書きしない。
- search query変更後に古いsearch responseを適用しない。
- savedのoptimistic updateと失敗responseでitems/search_resultsが食い違わない。
- modal close後に遅延responseがmodal stateを再開しない。
- selected subscription削除後にdangling IDを保持しない。
- loadingがpending requestなしで残らない。

## 生成するaction・event

- SelectSubscription
- ToggleUnreadOnly
- Open/CloseSearchModal
- search field changes
- ToggleItemSaved
- editor open/edit/save/delete
- request success/failure/timeout
- responses delivered in reverse/duplicate order

## 受け入れ条件

- [ ] 主要requestへcorrelation IDを付けたtest adapterを作る。
- [ ] 少なくともfeed切替、search、savedの3系統を探索する。
- [ ] observed failureをdomain別propertyとして保存する。
- [ ] 状態数上限を設定しつつ1,000 transition以上を目標にする。

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
