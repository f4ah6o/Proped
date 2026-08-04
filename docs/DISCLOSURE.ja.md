# 外部findingの公開・連絡ポリシー

Proped Rabbitaは外部repositoryを常にread-only inputとして扱います。相手側に
issue、pull request、review、comment、commit、branchを作成しません。生成する
handoff fileはローカル下書きだけです。

## 公開前の分類

外部findingは詳細を出力する前に分類します。

- `public-bug`: 通常のcorrectness、reliability、UX上の不具合。ローカルの
  issue/PR handoffを生成できます。
- `private-security`: 再現手順や影響の公開がsecurity riskになり得るfinding。
  tracked file、通常Atlas、CI log、公開issue draftへ詳細を出しません。

`external/manifests/`に追跡されるmanifestは`public-bug`だけを許可します。
private securityのmanifest、adapter、evidence、reportはGitでignoreされる
`.private/disclosures/<id>/`に置きます。

## コードとCIによるgate

1. manifestとhandoff modelは`FindingVisibility`を必須にします。
2. `public_handoff_files`は`private-security`の詳細を返す前に拒否します。
3. external run policyはprivate findingを
   `.private/disclosures/<id>/run`へ強制し、stdoutにはredacted summaryだけを返します。
4. `.private/`はGit ignore対象です。
5. `scripts/check_public_disclosure.py`は、tracked manifestの
   `private-security`、tracked private file、ignore設定漏れを検出して失敗します。

これは公開事故を防ぐ境界であり、自動的な脆弱性判定器ではありません。
判断が曖昧なfindingはreview完了までprivateとして扱います。

## ローカルhandoff bundle

`public-bug`では次を実行します。

```bash
moon run src/cli -- external handoff <id> --output artifacts --json
```

`artifacts/handoff/<id>/`へ次を生成します。

- `issue.md`: 概要、revision、再現、期待/実際、影響、evidence、修正方針、検証。
- `reproduction.md`: 最小traceとstable action ID。
- `fix-plan.md`: scopeを限定した実装・回帰テスト計画。
- `pr-body.md`: 編集して使えるPR本文。
- `machine.json`: `upstreamWritePerformed: false`を含む構造化metadata。

generatorはGitHubやupstream APIを呼びません。実際の投稿はこのworkflow外で人間が
内容を確認・編集して行います。

private security handoffは同じ構成に`SECURITY-NOTE.md`を追加しますが、
`.private/disclosures/`以外へは出力できません。

## 公開前checklist

1. 認証、認可、secret露出、code execution、injection、privacy、integrity、
   availabilityに関するsecurity issueではないことを確認する。
2. upstreamで観測した事実とdeterministic adapterの仮定を分離する。
3. pinned revisionとstableな最小traceを含める。
4. 個人データ、credential、token、production URL、不要なexploit詳細を含めない。
5. metadataが`upstreamWritePerformed: false`であることを確認する。
