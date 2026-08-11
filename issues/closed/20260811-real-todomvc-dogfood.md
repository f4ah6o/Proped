# tastejs/todomvc を実プロジェクトdogfoodする

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-11
Updated: 2026-08-11
Priority: P1
Depends-On: `20260811-web-project-runner-ci.md`

## 対象

- Repository: `tastejs/todomvc`
- Revision: `ff43b02e59dfa604386bb382034b2cd07c2bcd8a`
- License: MIT
- Targets: `examples/react` (React 19), `examples/vue` (Vue 3.5)
- Upstream policy: read-only。issue / PR / commit / commentは作成しない。

## 選定理由

- React / Vue の現行implementationを同じTodoMVC specificationで比較できる。
- add / edit / toggle / filter / route / clear-completed / reload persistenceがあり、単純counterより状態空間が大きい。
- production buildをローカル静的配信でき、外部APIやcredentialを必要としない。
- framework差ではなくbehavioral contractの検出力を評価できる。

## 目的

Proped RabbitaのWeb project runnerを第三者の実アプリへ適用し、fixture用mutationではなく実コード上の仕様違反・回帰を検出できるか評価する。

## 実装

- production buildしたReact/Vue TodoMVCをPlaywright Chromiumでloopback配信する。
- framework-neutralなTodoMVC contractを同じ7 scenarioで両実装へ適用する。
- semantic stateのみ観測し、random IDやbuild hashは判定から除外する。
- 外部通信をdenyし、fresh browser contextでscenarioを分離する。
- failureはproperty code、操作列、expected/actual semantic state、semantic hashをmachine-readable JSONへ保存する。
- 同一contractを2回実行しdeterministic replayを検証する。
- Web project runnerのquality stageへ一般的な`failures[].property/code/failureClass`のfailure code集約を追加する。

## Properties

- blank add is ignored / title is trimmed
- single-character todo is accepted
- active/completed routing matches completion state
- active count matches model
- toggle-all represents all todos independent of current filter
- clear-completed removes only completed todos
- edit trims values; empty edit deletes
- Escape cancels editing without committing draft
- todos persist across reload via localStorage
- active route remains selected across reload
- no unhandled browser errors

## 受け入れ条件

- [x] React/Vue production buildが成功する。
- [x] 同一contractを両frameworkで実ブラウザ実行する。
- [x] 実不具合があればmachine-readable failureとして再現する。
- [x] healthy behaviorはfalse positiveにしない。
- [x] runner manifestからbuild + browser testを再実行できる。
- [x] `git diff --check`と既存runner unit testがpassする。

## 完了結果

### React

- production build: pass（対象が想定する`npm install` + `npm run build`）。
- 7 scenarioを2回ずつ実行しdeterministic replayを確認。
- 3 failureを検出。
  - `toggle_all_reflects_all_todos`
    - trace: `add:alpha -> add:beta -> toggle:alpha -> route:completed`
    - 全体には未完了`beta`が残るが、Completed filter上でtoggle-allがcheckedになる。
    - failure semantic hash: `d00a6af5fce690d3ec62694bfc92ca2719c43cdfa08912dee849f49e46c677c4`
  - `escape_cancels_edit`
    - trace: `add:alpha -> edit:start -> edit:draft-changed -> edit:escape`
    - titleは未commitのままだがediting状態とfocusが残る。
    - failure semantic hash: `99883a033106a0bf0d2b93275b8e7fe52121299780e62007cede08eb750815ca`
  - `reload_persists_todos`
    - trace: `add:alpha -> add:beta -> toggle:alpha -> route:completed -> reload`
    - reload後todoが0件になり、localStorage keyも存在しない。
    - failure semantic hash: `88fa906442925192834b1da9d1592522238d978d5f5bb0875eb97e084e209da6`
- contract semantic hash: `4f295e5297d45027a663f72db406a904337ac3e8989b56681c2bf95f60b36d20`
- 補足: strictな`pnpm install`では`webpack.prod.js`が直接requireする`terser-webpack-plugin`がmanifest未宣言のためbuild不能だった。対象推奨のnpm installではhoistされた依存によりbuild成功するため、主failureとは分離してcompatibility diagnosticとして扱う。

### Vue

- production build: pass。既存CSS/base.js由来のwarningのみ。
- 7 scenarioを2回ずつ実行しdeterministic replayを確認。
- 1 failureを検出。
  - `reload_persists_todos`
    - Reactと同じ再現traceでreload後todoが0件、localStorage keyも存在しない。
    - failure semantic hash: `88fa906442925192834b1da9d1592522238d978d5f5bb0875eb97e084e209da6`
- blank add、single-character、trim、filter/count、filtered update、toggle-all、clear-completed、edit trim/delete、Escape cancel、route selectionはpass。
- contract semantic hash: `6b4990bf49a67ad80e1e1eca8d008b7331374f9fe411e550cb6493614bcd278c`

### Web project runner

- 5-stage graph: revision check / React build / React contract / Vue build / Vue contract。
- build 2件とrevision checkはpass。
- React/Vue contractは期待どおり`quality_gate_failed`としてfail closed。
- Atlasへ以下のfailure codeを集約できるようrunnerを汎用化した。
  - React: `toggle_all_reflects_all_todos`, `escape_cancels_edit`, `reload_persists_todos`
  - Vue: `reload_persists_todos`
- JSON/HTML/SVG/DOT/summaryの5 artifact生成を確認。
- 外部repositoryへのwriteは0。

## 変更履歴

`CHANGES.md` impact: yes
