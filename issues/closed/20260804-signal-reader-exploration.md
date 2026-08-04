# Signal Readerのstale responseとoptimistic updateを探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
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

- [x] 主要requestへcorrelation IDを付けたtest adapterを作る。
- [x] feed切替、search、savedの3系統を探索した。
- [x] observed failureをdomain別propertyとして保存した。
- [x] 720 state上限で1,265 transitionを探索した。

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

### Feed response

- Property: `feed responses match the current subscription`
- Minimal trace:
  1. `SelectSubscription(2)`
  2. `SelectSubscription(1)`
  3. `ItemsLoaded(request=1, subscription=2)`
- Action IDs: `select-subscription:2`, `select-subscription:1`, `items-loaded:1:2`

### Saved-state response

- Property: `latest saved intent wins`
- Minimal trace:
  1. `ToggleItemSaved(1, true)`
  2. `ToggleItemSaved(1, false)`
  3. `ItemSavedSet(request=1, item=1, saved=true, success=true)`

### Live search response

- Property: `search responses match the current query`
- Minimal trace:
  1. `OpenSearchModal`
  2. `UpdateSearchQuery("alpha")`
  3. `UpdateSearchQuery("beta")`
  4. `SearchLoaded(request=1, query="alpha")`

### Exploration

- 720 states
- 1,265 transitions
- 3 retained failures
- 0 diagnostics
- deterministic rerun and artifact hash verification対象

## 公開・ライセンス境界

- 今回のfindingはsecurityではなく通常のcorrectness bugとして`public-bug`に分類した。
- upstreamへissue、PR、comment、commitを作成していない。
- pinned revisionの`moon.mod.json`はMITを宣言するが、standalone LICENSE fileがないため、
  upstream sourceはこのrepositoryへコピーしていない。
- clean-room finite adapterとsource hashだけを保存した。
- `external handoff signal-reader`でローカルissue/PR下書きを生成できる。
