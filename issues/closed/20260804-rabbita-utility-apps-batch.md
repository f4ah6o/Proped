# その他の公開Rabbita利用事例をbatch探索する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P2
Depends-On: `20260804-mechanical-external-app-harness.md`

## 対象

- `chnlkw/moonxi_board`
- `xz-xuezhe/moonblox`
- `CAIMEOX/symweb`
- `CAIMEOX/calculus-singularity`
- `bobzhang/issues`
- `bobzhang/games`
- `beso1225/fullstack_trial_moonbit`
- `tekihei2317/moonbit-rpc-poc`
- `moonbitlang/OSC2026`

## 調査時revision

- `chnlkw/moonxi_board`: `32e9cde5daab28ce76f43d2678c57e2b2f265253`
- `xz-xuezhe/moonblox`: `d9d5e74f3a61ac7b75a257d6abdca0d05769af90`
- `CAIMEOX/symweb`: `a37f96d283b4bdbb2d1654ca88a9c26033db6c46`
- `CAIMEOX/calculus-singularity`: `9bf304763233a310971d609bf6db39dfeb697fca`
- `bobzhang/issues`: `a348501b2ca848d6564557b58446269c90ba4e3a`
- `bobzhang/games`: `b17fb377b143537c534213e516bba126b8198e4e`
- `beso1225/fullstack_trial_moonbit`: `5ed67d454600210861eb4ba8178aa91e1e34406f`
- `tekihei2317/moonbit-rpc-poc`: `22069dc53724d7afdd6951652d7b6bbe114e6e11`
- `moonbitlang/OSC2026`: `ef740c25e924d873b5be760923f02262e98d9c24`

## 主な対象path

- `repositoryごとのRabbita import package`
- `Model/Msg/update/create_state候補`

## Adapter方針

external inspect commandで自動classificationし、pure modelが見つかったrepositoryから順にadapter化する。小規模appは共通batch manifestで管理する。

## 最初に試すproperty仮説

- generic panic-free/determinism property。
- form/RPC/dashboardのstale response。
- symbolic/math inputのinvalid value safety。
- board/game stateのID・selection整合性。
- site rendererのdeterministic output。

## 生成するaction・event

- 自動検出されたMsg variants
- bounded scalar payload
- success/failure/stale effect response
- navigation/form actions

## 受け入れ条件

- [x] 全repositoryをinspect reportへ載せる。
- [x] 各repositoryをsupported/partial/unsupportedへ分類する。
- [x] supported targetは最低generic propertyを実行する。
- [x] license不明targetはsourceをvendorせずmetadataだけ固定する。

## 共通テスト

- pinned source hash validation
- adapter build and unit tests
- deterministic exploration rerun
- exact expected-failure signatureまたはzero-failure assertion
- HTML/JSON/SVG/DOT artifact確認
- `git diff --check`

## 注記

本batchは取りこぼし防止用。大きなfailure候補が見つかったrepositoryは独立issueへ昇格する。

## 変更履歴

`CHANGES.md` impact: yes when adapter is shipped

## 実装結果

- Tier 3の9 repositoryに`moonbit-community/proton` framework internalsを加えた10対象を`external/utility-apps.json`へ固定した。
- 全対象でrevision、license、対象path、source SHA-256、strategy、supported/partial/unsupported、分類理由を記録した。
- supportedは`CAIMEOX/symweb`、`bobzhang/issues`、`beso1225/fullstack_trial_moonbit`、`moonbit-community/proton`の4対象とし、共通`rabbita-utility-batch`でgeneric/domain propertyを実行した。
- 1,400 state・2,777 transitionを探索し、2 failure・0 diagnosticsだった。primary failure `Fullstack invalid titles are not submitted`を`FullstackSubmit`の1 actionへ縮約した。
- Symweb stale debounceとProton stale subscription eventはpassし、Issues reverse `GraphSaved`とFullstack late replyを追加failureとして保持した。
- license不明の`bobzhang/games`、`tekihei2317/moonbit-rpc-poc`、`moonbitlang/OSC2026`はsourceをvendorせずmetadataとhashだけを固定した。
- `scripts/utility_batch.py validate|inspect|sync`でreport、fixture、read-only checkoutの再取得・revision/hash照合を機械化した。
- upstream repositoryへのissue、PR、comment、commitは行っていない。
