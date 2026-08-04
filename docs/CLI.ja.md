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
