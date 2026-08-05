# CLI契約

Proped Rabbita CLIは、対話利用、CI、LLMによる自動操作を同じcommandで扱います。既定は人間向け出力で、`--json` を付けると安定したJSON envelopeを返します。

## 実行形式

```bash
moon run src/cli -- <command> [arguments] [--json] [--output <dir>]
```

`moon build --target native` 後に生成されるnative executableも、`moon run src/cli --` を除いた同じ引数を受け取ります。

## コマンド探索

```bash
moon run src/cli -- schema --json
```

`schema` はcommand grammar、利用可能なdemo ID、summary field、生成artifact名、終了コードの意味を返します。エージェントは人間向けhelpを解析せず、この出力からcommandを組み立てます。

## Commands

### `version`

```bash
moon run src/cli -- version --json
```

CLI versionを返します。

### `demo list`

```bash
moon run src/cli -- demo list --json
```

実行可能なdemo ID、出所、宣言済みの期待結果、説明、該当する場合はupstream revisionを返します。

### `demo describe <id>`

```bash
moon run src/cli -- demo describe rabbita-todo --json
```

1つのdemoについて、model、action class、property、決定的な探索default、出所、期待結果、artifact名を返します。

### `demo run <id|all>`

```bash
moon run src/cli -- demo run rabbita-todo --json
moon run src/cli -- demo run all --output artifacts --json
```

1つまたは全demoを実行します。stdoutには簡潔なsummaryを返し、完全なreportを `<output>/<demo-id>/` に書き込みます。

demoは `expectedOutcome` として `pass` または `failure` を宣言します。expected-failure demoは、正確な`expectedFailure` propertyと最小traceも宣言します。観測したcounterexampleがそのsignatureと一致した場合だけcommandは成功します。これにより、無関係なfailureを成功扱いせず、failure discoveryとshrinkが機能し続けることを回帰fixtureで検証できます。

## 外部アプリケーションcommand

### `external list`

```bash
moon run src/cli -- external list --json
```

review済みexternal targetのrepository、固定revision、adapter strategy、license、期待結果を返します。

### `external inspect <id>`

```bash
moon run src/cli -- external inspect proton-demo-todo --json
moon run src/cli -- external inspect ensenzu-app --json
moon run src/cli -- external inspect signal-reader --json
moon run src/cli -- external inspect moonbit-editor-file-tree --json
moon run src/cli -- external inspect canopy-components --json
moon run src/cli -- external inspect incr-typed-spreadsheet --json
moon run src/cli -- external inspect circular-state --json
moon run src/cli -- external inspect isomorphic-suite --json
moon run src/cli -- external inspect rabbita-xterm-lifecycle --json
moon run src/cli -- external inspect moonclaw-job --json
moon run src/cli -- external inspect mooncakes-official-ui --json
```

manifestのentry point、source SHA-256、effect policy、有効property、upstreamへの明示的な`read-only` policyを返します。

### `external inspect-source <file>`

```bash
moon run src/cli -- external inspect-source src/vendor/proton_todo/upstream/main.mbt.txt --json
moon run src/cli -- external inspect-source src/vendor/ensenzu_app/upstream/app.mbt.txt --json
moon run src/cli -- external inspect-source src/vendor/moonbit_editor_file_tree/upstream/file_tree.mbt.txt --json
```

local MoonBit source fileからRabbita import、state constructor、`Model`、`Msg`、`update`、`view`、command、subscription境界を機械検出します。scannerは `pure`、`effect-model`、`subscription-model`、`browser-replay`、`unsupported` に分類しますが、review済みmanifestを最終的な根拠とします。

### External preparation helper

```bash
python3 scripts/external_harness.py validate
python3 scripts/external_harness.py scaffold --source app.mbt --message Msg
python3 scripts/external_harness.py prepare \
  --manifest external/manifests/proton-demo-todo.json \
  --source src/vendor/proton_todo/upstream/main.mbt.txt \
  --message Msg
python3 scripts/external_harness.py update \
  --manifest external/manifests/proton-demo-todo.json \
  --revision <40-character-sha> \
  --source <review済みsource-file>
python3 scripts/external_harness.py sandbox -- <inspection-command>
```

helperはduplicate keyを拒否してmanifest fileをparseし、tracked schemaのvalidation、決定的なsource hash計算、payloadなしMsgと`Bool`、`Int`、`String`、`Option`、payloadなしsmall enumの有限action scaffold生成を行います。`update`は`--write`または明示的な`--output`がない限りpreviewのみです。upstream repositoryの取得・書き込みは行いません。untrusted checkoutをinspection commandで扱う場合はfail-closedなnetwork-denied sandboxを使用します（Linuxは`bubblewrap`、macOSは`sandbox-exec`）。CIは全manifestを検証し、sandbox policyを確認し、external targetを独立matrix jobで実行します。

### `external run <id|all>`

```bash
moon run src/cli -- external run proton-demo-todo --json
moon run src/cli -- external run ensenzu-app --json
moon run src/cli -- external run signal-reader --json
moon run src/cli -- external run moonbit-editor-file-tree --json
moon run src/cli -- external run canopy-components --json
moon run src/cli -- external run incr-typed-spreadsheet --json
moon run src/cli -- external run circular-state --json
moon run src/cli -- external run isomorphic-suite --json
moon run src/cli -- external run rabbita-xterm-lifecycle --json
moon run src/cli -- external run moonclaw-job --json
moon run src/cli -- external run mooncakes-official-ui --json
moon run src/cli -- external run all --output artifacts --json
```

決定的なexternal adapterを `<output>/external/<id>/` で実行します。native、network、timer、subscription effectは実行せずdescriptorとして記録し、success、failure、stale、duplicate、順序逆転responseを注入できるようにします。

| External target | Property | Exact minimized trace |
| --- | --- | --- |
| `proton-demo-todo` | `snapshot version never decreases` | `SnapshotReceived(version=1) -> SnapshotReceived(version=0)` |
| `ensenzu-app` | `active numeric fields reject non-finite input` | `Change(Frequency, "Infinity")` |
| `signal-reader` | `feed responses match the current subscription` | `SelectSubscription(2) -> SelectSubscription(1) -> ItemsLoaded(request=1, subscription=2)` |
| `moonbit-editor-file-tree` | `asynchronous resolve responses preserve newer tree intent` | `ToggleDirectory("readonly-remote://workspace/tests") -> SetActive("readonly-remote://workspace/src/lib/util.mbt") -> DirectoryResolveFailed(request=1, uri="readonly-remote://workspace/tests")` |
| `canopy-components` | `positive resize nudges do not decrease width` | `ResizeNudge(dw=2147483647, dh=0)` |
| `incr-typed-spreadsheet` | `positive formula addition does not wrap backward` | `UpdateDraft(A1, "2147483647") -> ApplySelected` |
| `circular-state` | `task modals retain an existing selected task` | `SelectTask("TSK-1") -> WorkspaceMutated(kind=TaskQuickMutation, revision=1, tasks=1)` |
| `isomorphic-suite` | `kanban cards reference existing columns` | `KanbanSelectCardToMove(1) -> KanbanMoveCardTo(column=99, index=0)` |
| `rabbita-xterm-lifecycle` | `terminal dimensions remain positive` | `Resize(cols=0, rows=24)` |
| `moonclaw-job` | `older snapshot responses do not revive terminal runs` | `StreamClosed("run-1") -> StreamClosed("run-1") -> SnapshotLoaded(request=2, run="run-1", status=Succeeded) -> SnapshotLoaded(request=1, run="run-1", status=Running)` |
| `mooncakes-official-ui` | `older build responses do not replace newer Build Queue results` | `ReloadBuilds -> BuildsDecodeFailed(request=2, corpus=missing-collections) -> BuildsLoaded(request=1, fixture=older)` |

Signal Readerはstale saved-state callbackと古いlive-search responseの最小failureも保持します。MoonBit Editorはauto-reveal開始後に手動collapseしたdirectoryがlate successで再展開される最小traceも保持します。Canopyのmenu focus・tabs selection propertyはpassし、pinned APIにdisabled entry modelがないためdisabled selection propertyは非適用です。 incr targetはformulaのrecomputed・changed・unchanged traceを保存し、Eqとno-backdateのdownstream count差も確認します。Circularはworkspace同期後のtask modalとselectionの参照整合性を検証します。 Isomorphic suiteはKanbanのmissing-column参照、Kanban・Todoのstale list response、Noteのdangling selectionを保持します。 Rabbita xtermはload・mount・listener・UTF-8 write・disposeをnative lifecycleとして検証し、非正値dimensionだけをexpected failureとして保持します。Moonclawはselected run照合、timeline重複排除、pending request ID、renderingを検証し、同一runのsnapshot response逆順適用だけをexpected failureとして保持します。pinned Jobs surfaceには直接のcancel/retry actionはありません。 Mooncakesはqueue/recent status整合、website index範囲、malformed decoder、effect identity、決定的renderingを検証し、response correlation failureを2件保持します。tutorial traceは `ShowSurface(tutorial) -> EditTitle("alpha") -> SubmitTitle -> EditTitle("beta") -> TutorialReply(request=2, title="alpha", success=false)` です。

### `external handoff <id|all>`

```bash
moon run src/cli -- external handoff signal-reader --output artifacts --json
moon run src/cli -- external handoff moonbit-editor-file-tree --output artifacts --json
moon run src/cli -- external handoff canopy-components --output artifacts --json
moon run src/cli -- external handoff incr-typed-spreadsheet --output artifacts --json
moon run src/cli -- external handoff circular-state --output artifacts --json
moon run src/cli -- external handoff isomorphic-suite --output artifacts --json
moon run src/cli -- external handoff rabbita-xterm-lifecycle --output artifacts --json
moon run src/cli -- external handoff moonclaw-job --output artifacts --json
moon run src/cli -- external handoff mooncakes-official-ui --output artifacts --json
```

`<output>/handoff/<id>/`へ`issue.md`、`reproduction.md`、`fix-plan.md`、`pr-body.md`、`machine.json`をローカル生成します。metadataの`upstreamWritePerformed`は常に`false`で、GitHubやupstream APIを呼びません。

manifestは`findingVisibility`を必須とします。`public-bug`は通常出力できます。`private-security`はpublic handoffを拒否し、`.private/disclosures/<id>/`へ強制隔離し、stdoutにはredacted summaryだけを返します。tracked manifestでは`private-security`を禁止します。詳細は [DISCLOSURE.ja.md](DISCLOSURE.ja.md) を参照してください。

外部repositoryはread-only inputです。相手側にissue、PR、comment、commitを作成しません。

## Expected-failure fixtures

| Demo | Property | Exact minimized trace |
| --- | --- | --- |
| `rabbita-todo` | `stored todo titles are not blank` | `TitleChanged(" ") -> Add` |
| `rabbita-sokoban` | `invalid timeline input preserves cursor` | `Move(Up) -> JumpTo("not-a-number")` |
| `rabbita-subscriptions` | `paused ticker ignores queued tick` | `ToggleTicker -> Tick` |
| `rabbita-websocket` | `closing client rejects repeated disconnect` | `ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested` |

`demo run all` は上記4件とpassを期待する2件を同時に実行します。

## JSON envelope

実用規模のexpected-failure runは次の形です。

```json
{
  "ok": true,
  "command": "demo run",
  "runs": [
    {
      "id": "rabbita-todo",
      "ok": true,
      "expectedOutcome": "failure",
      "expectationMet": true,
      "expectedFailure": {
        "property": "stored todo titles are not blank",
        "trace": [
          "TitleChanged(\" \")",
          "Add"
        ]
      },
      "output": "demo/out/rabbita-todo",
      "schemaVersion": 2,
      "seed": 29,
      "states": 169,
      "transitions": 2251,
      "failures": 1,
      "diagnostics": 0,
      "firstFailure": {
        "property": "stored todo titles are not blank",
        "message": "todo 0 has a blank title",
        "stateId": "rabbita-todo|...",
        "traceLength": 2,
        "trace": [
          "TitleChanged(\" \")",
          "Add"
        ],
        "actionIds": [
          "title:1: ",
          "add"
        ]
      },
      "artifacts": [
        "atlas.html",
        "atlas.svg",
        "atlas.json",
        "atlas.dot",
        "summary.json"
      ]
    }
  ]
}
```

passを期待するdemoでは `expectedOutcome` が `pass`、`failures` が `0`、`firstFailure` が `null` になります。

引数エラーは次の形で、終了コード `2` を返します。

```json
{
  "ok": false,
  "error": {
    "code": "usage_error",
    "message": "unknown demo id: missing"
  }
}
```

## Failure保持

探索では同じproperty violationを多数の生成caseから再発見することがあります。`RunReport.failures` は重複や長いfailureを追加し続けず、propertyごとに最短のcounterexampleだけを保持します。`firstFailure` は保持された最初のproperty failureを簡潔なsummaryへ複製します。

完全なstructured traceは `atlas.json` に残り、最小化された各transitionの `from`、`actionId`、人間向けlabel、`to` を取得できます。

## Artifacts

| File | 契約 |
| --- | --- |
| `summary.json` | `firstFailure` を含むdemo単位のCLI summary |
| `atlas.json` | state、raw transition、最小failure、structured trace、dependency、diagnosticを含む完全な`RunReport` |
| `atlas.html` | 最小failure traceを含む単独で開ける人間向けstate Atlas |
| `atlas.svg` | 単独の決定的Flow Canvas graph |
| `atlas.dot` | Graphviz transition graph |

source、demo設定、seedが同じ場合、生成fileは決定的です。

## 終了コード

| Code | 意味 |
| --- | --- |
| `0` | 選択した全demoが宣言済みの期待結果と一致 |
| `2` | command、option、demo IDの誤り |
| `3` | 1件以上のdemoが宣言済みの期待結果と不一致 |

予期しないfilesystem・runtime failureは成功envelopeへ変換せず、runtimeの非zero終了動作を維持します。
