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

`schema` はcommand grammar、利用可能なdemo ID、生成artifact名、終了コードの意味を返します。エージェントは人間向けhelpを解析せず、この出力からcommandを組み立てます。

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

実行可能なdemo ID、出所、説明、該当する場合はupstream revisionを返します。

### `demo describe <id>`

```bash
moon run src/cli -- demo describe rabbita-counter --json
```

1つのdemoについて、model、action ID、決定的な探索default、出所、artifact名を返します。

### `demo run <id|all>`

```bash
moon run src/cli -- demo run newsletter --json
moon run src/cli -- demo run all --output artifacts --json
```

1つまたは全demoを実行します。stdoutには簡潔なsummaryを返し、完全なreportを `<output>/<demo-id>/` に書き込みます。

## JSON envelope

成功時の形は次のとおりです。

```json
{
  "ok": true,
  "command": "demo run",
  "runs": [
    {
      "id": "newsletter",
      "ok": true,
      "output": "demo/out/newsletter",
      "schemaVersion": 2,
      "seed": 7,
      "states": 5,
      "transitions": 192,
      "failures": 0,
      "diagnostics": 0,
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

property failureが1件以上ある場合、そのdemo summaryは `"ok": false` になり、processは終了コード `3` を返します。完全なfailure traceは `atlas.json` と `atlas.html` に残ります。

## Artifacts

| File | 契約 |
| --- | --- |
| `summary.json` | demo単位のCLI summary |
| `atlas.json` | state、raw transition、failure、structured trace、dependency、diagnosticを含む完全な`RunReport` |
| `atlas.html` | 単独で開ける人間向けstate atlas |
| `atlas.svg` | 単独の決定的Flow Canvas graph |
| `atlas.dot` | Graphviz transition graph |

source、demo設定、seedが同じ場合、生成fileは決定的です。

## 終了コード

| Code | 意味 |
| --- | --- |
| `0` | command成功、property failureなし |
| `2` | command、option、demo IDの誤り |
| `3` | 探索は完了したがproperty failureあり |

予期しないfilesystem・runtime failureは成功envelopeへ変換せず、runtimeの非zero終了動作を維持します。
