# 公開Rabbita利用事例を網羅的に検証する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 概要

Rabbita公式exampleだけでなく、公開されている実アプリ、公式サービス、editor、desktop frontend、UI component、full-stack demoをProped Rabbitaへ順次取り込み、実用的なfailureを探索して最小counterexampleを保存する。

2026-08-04時点のGitHub code searchで、Rabbitaを直接importする公開repositoryを20件以上確認した。本issueは個別issueを束ねるcampaign issueとし、探索対象を取りこぼさず、同じ方法で比較可能な結果を残す。

## 対象一覧

### Tier 1: pureなModel/Msg/updateへ切り出しやすい

- [x] `justjavac/proton-demo`
- [ ] `moonbit-community/proton` framework internals
- [x] `shiguri-01/ensenzu`
- [x] `CAIMEOX/signal_reader`
- [x] `moonbitlang/editor` file tree
- [x] `CAIMEOX/circular`
- [ ] `moonbit-community/isomorphic` application suite

### Tier 2: command/subscription/browser boundaryをmockすれば探索可能

- [x] `dowdiness/canopy`
- [x] `dowdiness/incr`
- [ ] `moonbitlang/mooncakes.io`
- [ ] `moonbitlang/openseek`
- [ ] `moonbit-community/selene`
- [ ] `vectie/moonclaw`
- [ ] `moonbit-community/rabbita_xterm`

### Tier 3: 小規模・教育・可視化・周辺利用

- [ ] `chnlkw/moonxi_board`
- [ ] `xz-xuezhe/moonblox`
- [ ] `CAIMEOX/symweb`
- [ ] `CAIMEOX/calculus-singularity`
- [ ] `bobzhang/issues`
- [ ] `bobzhang/games`
- [ ] `beso1225/fullstack_trial_moonbit`
- [ ] `tekihei2317/moonbit-rpc-poc`
- [ ] `moonbitlang/website`
- [ ] `moonbitlang/moonbit-docs` full-stack tutorial
- [ ] `moonbitlang/OSC2026`

## 個別issue

- `20260804-mechanical-external-app-harness.md`
- `20260804-proton-todo-exploration.md`
- `20260804-ensenzu-exploration.md`
- `20260804-signal-reader-exploration.md`
- `20260804-moonbit-editor-file-tree-exploration.md`
- `20260804-canopy-and-incr-exploration.md`
- `20260805-incr-typed-spreadsheet-exploration.md`
- `20260805-canopy-editor-integration-exploration.md`
- `20260804-mooncakes-production-ui-exploration.md`
- `20260804-openseek-exploration.md`
- `20260804-selene-editor-exploration.md`
- `20260804-circular-exploration.md`
- `20260804-moonclaw-exploration.md`
- `20260804-isomorphic-suite-exploration.md`
- `20260804-rabbita-xterm-exploration.md`
- `20260804-rabbita-utility-apps-batch.md`
- `20260805-private-security-disclosure-handoff.md`

## 共通実施手順

1. upstream repository、revision、license、対象package、entry pointをmanifestへ固定する。
2. `Model`、`Msg`、`update`、`view`、`subscriptions`、`Cmd` boundaryを抽出する。
3. pure adapter、effect interpreter、browser replayのいずれかを選ぶ。
4. generic propertyを先に実行する。
5. domain固有propertyを追加する。
6. failureをpropertyごとに最短traceへ縮約する。
7. upstream source hash、adapter差分、探索設定、artifactを保存する。
8. upstreamの事実と、test harnessでモデル化した仮定を明確に区別する。

## 共通generic property

- updateとrenderがpanicしない。
- 同一state/actionは同一next stateとeffect descriptorを返す。
- renderは同一stateに対して決定的である。
- action後のstate fingerprintが安定している。
- loading/error/modal/selectionなどの排他的状態が矛盾しない。
- sequence/version/request generationが宣言した規則に反しない。
- close、cancel、delete、submitなどの非冪等操作を無制限に再実行しない。
- stale responseを新しいrequestの結果として適用しない。
- bounded collectionが上限を超えない。
- UI上disabledなactionを直接dispatchしても安全側に倒れる。

## 受け入れ条件

- [x] 対象一覧の各repositoryが個別issueまたはbatch issueへ対応している。
- [x] 各対象にpinned revision、license、対象path、adapter方式が記録される。
- [ ] 各対象で少なくともgeneric propertyが機械実行される。
- [ ] failureが見つかった場合、property名、最小trace、stable action ID、探索規模を保存する。
- [ ] failureが見つからなかった場合も、試したproperty、境界、探索上限を記録する。
- [x] `demo run all`とは別にexternal campaignを選択実行できる。
- [ ] upstream更新時に再取得・再検証できる。

## 2026-08-05 進捗

- Proton Todo、Ensenzu、Signal Reader、MoonBit Editor file tree、Canopy components、incr typed spreadsheet、Circular stateの7 targetを`external run all`へ登録した。
- MoonBit Editorでは1,600 state・2,646 transitionを探索し、unrelated resolve failureによるauto-reveal中断と、late successによるmanual collapseの再展開を最小3 actionへ縮約した。
- Canopyではresizable、menu、tabsをpure adapterへ統合し、720 state・2,618 transitionからInt32 overflowによる正方向nudge反転を`ResizeNudge(dw=2147483647, dh=0)`へ縮約した。
- incr typed spreadsheetでは900 state・1,347 transitionを探索し、`A1=2147483647`と`B1=A1+1`のoverflowを2 actionへ縮約した。Eq-backedとno-backdateのdownstream recompute差も実runtimeで固定した。
- Circularでは580 state・2,456 transitionを探索し、workspace同期でselected taskが消えた後も`TaskModal`が残るreferential-integrity failureを2 actionへ縮約した。
- named private modelと`Type::update` / `Type::view`を`inspect-source`で認識できるようdetectorを拡張した。
- 全external repositoryはread-only inputとして扱い、相手側へ書き込みを行っていない。

## テスト計画

- campaign manifestのschema validation
- pinned source hash validation
- adapter build matrix
- deterministic rerunによるartifact SHA-256一致
- expected-failure signatureのexact match
- no-failure targetのzero failure確認
- `git diff --check`

## リスク

- repositoryごとにRabbita API versionが異なる。
- browser DOM、native bridge、network、timerをpure modelへ落とす際に仮定が入る。
- public repositoryでもlicense不明なものはsource vendorを避け、metadataとadapterだけに限定する必要がある。
- state space explosionを抑える有限domain設計が必要になる。

## 変更履歴

`CHANGES.md` impact: no
