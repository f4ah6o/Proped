# 外部Rabbitaアプリを機械的に探索するtest harnessを実装する

Status: open
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-05
Priority: P0

## 概要

公開Rabbita applicationを都度手作業でvendor・adapter化するのではなく、manifest-drivenなexternal application harnessを実装する。source取得、revision固定、構造検出、adapter scaffold生成、effect boundaryの置換、有限action生成、generic property実行、failure shrinking、artifact生成を共通化する。

完全自動化ではなく、機械化できる部分とdomain知識が必要な部分を明確に分離する。

## 目標CLI

```text
proped-rabbita external discover --github-query <query>
proped-rabbita external inspect <manifest>
proped-rabbita external prepare <manifest>
proped-rabbita external run <id>
proped-rabbita external run-all
proped-rabbita external update <id>
```

MoonBit CLIへ直接組み込む場合は既存形式に合わせる。

```text
moon run src/cli -- external inspect <id> --json
moon run src/cli -- external run <id|all> --json
```

## Manifest案

```json
{
  "id": "proton-demo-todo",
  "repository": "justjavac/proton-demo",
  "revision": "5de5f2a3ec9ff0dba8d0aade6778b448a3c07a0d",
  "license": "MIT",
  "packages": ["frontend/main"],
  "entryPoints": {
    "model": "Model",
    "message": "Msg",
    "update": "update",
    "view": "view"
  },
  "strategy": "pure-update-with-effect-model",
  "effectPolicy": "record-and-inject",
  "actionDomain": "manifests/proton-demo.actions.json",
  "properties": [
    "panic-free",
    "deterministic-update",
    "monotonic-snapshot-version"
  ]
}
```

## 機械化レイヤ

### 1. Discovery

- GitHub code search結果またはlocal checkoutから`moon.pkg`のRabbita importを検出する。
- `create_state`、`create_state_with_init`、`cell_with_dispatch`、`@rabbita.new`を検索する。
- `struct Model`、`enum Msg`、`fn update`、`fn view`候補を抽出する。
- repository、revision、license、file size、MoonBit versionをreportする。

### 2. Adapter classification

- `pure`: `update(Model, Msg)`がpureに近い。
- `effect-model`: updateが`Cmd`を返すため、effectをdescriptorとして記録する。
- `subscription-model`: timer、keyboard、WebSocket等をsynthetic event sourceへ置換する。
- `browser-replay`: DOM依存が強く、headless browserでevent traceを再生する。
- `unsupported`: dynamic JS boundaryなどにより安全な探索がまだできない。

### 3. Effect interpreter

実networkやfilesystemを呼ばず、次をdescriptor化する。

```text
HttpRequest(id, method, url, body)
TimerScheduled(id, delay)
SubscriptionInstalled(id, kind)
NativeInvoke(id, method, payload)
WebSocketCommand(id, operation)
DomCommand(id, operation)
```

生成したeffectに対して、成功、失敗、timeout、重複、順序逆転、stale responseをinjectできるようにする。

### 4. Generic action generation

- payloadなしenum variantを自動action化する。
- Bool、small Int、bounded String、Option、small enumの代表値を生成する。
- IDは現在stateに存在するID、存在しないID、境界IDを生成する。
- Stringは空、空白、最短正常、長文、Unicode、invalid parse候補を生成する。
- response actionはpending effect descriptorから生成する。
- domainが無限の場合はmanifestで有限corpusを指定する。

### 5. Generic property generation

自動で安全に判定できるものだけをbuilt-inとする。

- panic-free update/render
- deterministic update/render
- stable action ID/fingerprint
- finite state/action count
- pending effect ID uniqueness
- resolved effectの二重適用防止
- disabled/invalid direct dispatch safety
- collection bound
- declared monotonic field
- declared mutually-exclusive field
- stale response rejection
- cancel/close/deleteのidempotency policy

property名だけからfield semanticsを推測せず、monotonic、exclusive、correlation等はmanifest annotationを要求する。

### 6. Shrinking

- action列の削除
- Stringの空白・空文字・短縮
- Intの0、1、-1、境界値
- response順序の簡約
- payload collectionの縮小
- effect graphの不要node削除

### 7. Reproducibility

- source revisionとhashを固定する。
- manifest、adapter、seed、toolchain versionをreportへ含める。
- 同一入力のartifact SHA-256一致を検証する。
- upstream sourceを実行する場合はsandboxとnetwork denyをdefaultにする。

## 自動化できない範囲

- 「business上正しい」propertyの完全自動推論。
- browser layout、focus、pointer captureの意味をpure modelだけで完全再現すること。
- untrusted sourceを無条件にbuild・executeすること。
- API keyや外部serviceを必要とするend-to-end動作。

これらは薄いadapter、manifest annotation、またはbrowser test layerで補う。

## 成果物

```text
external/
  manifests/
  adapters/
  fixtures/
  snapshots/
  out/<id>/
    inspection.json
    atlas.json
    atlas.html
    atlas.svg
    atlas.dot
    summary.json
```

## 受け入れ条件

- [x] manifest schemaがある。
- [x] local checkoutのsource fileからRabbita entry point候補を機械検出できる。
- [x] pure、effect-model、subscription-modelを含むadapter方式を区別できる。
- [x] effect descriptorを記録し、boundedなresponse順序を生成できる。
- [ ] payloadなしMsgとsmall scalar payloadからaction scaffoldを生成できる。
- [x] generic propertyだけで1件以上の既知fixture failureを再発見できる。
- [x] app固有propertyをadapterとして追加できる。
- [x] failureを最小traceへ縮約できる。
- [ ] untrusted checkoutはnetwork denyのsandboxで扱う。
- [ ] CIで複数external targetをmatrix実行できる。


## 2026-08-04 実装進捗

- `external/schema/manifest.schema.json` と最初のmanifestを追加した。
- `external inspect-source <file>` でRabbita import、state constructor、`Model`、`Msg`、`update`、`view`、command、subscriptionを機械検出する。
- `EffectDescriptor`、adapter classification、bounded response permutation、generic monotonic property、effect ID uniqueness propertyを共通package化した。
- `justjavac/proton-demo` をdogfoodし、generic monotonic propertyで `SnapshotReceived(version=1) -> SnapshotReceived(version=0)` を再発見・縮約した。
- `shiguri-01/ensenzu` をeffect-modelとしてdogfoodし、全19 fieldの有限corpusから `Change(Frequency, "Infinity")` を1 actionへ縮約した。
- `external run all` はsubscription-modelとeffect-modelの2 targetを同一CLI契約で実行する。
- 残作業はaction scaffold自動生成、untrusted checkout sandbox、複数target CI matrix、manifest file parserとprepare/update workflow。

## 最初のdogfood対象

1. `justjavac/proton-demo`
2. `shiguri-01/ensenzu`
3. `CAIMEOX/signal_reader`
4. `moonbitlang/editor` file tree

## テスト計画

- manifest parser property test
- source detector golden test
- effect descriptor interpreter test
- response permutation test
- action corpus shrink test
- deterministic artifact test
- malicious/invalid manifest rejection test
- network deny確認

## リスク

- MoonBit AST APIが不足する場合、初期版はtext detectorとexplicit manifestを併用する。
- generated adapterを自動commitせず、人間またはagent review後に採用する。
- generic propertyを増やし過ぎるとfalse positiveが増えるため、判定根拠をreportへ出す。

## 変更履歴

`CHANGES.md` impact: yes
