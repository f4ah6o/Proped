# 外部findingのprivate security隔離とissue/PR handoff生成を実装する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-05
Updated: 2026-08-05
Priority: P0
Depends-On: `20260804-mechanical-external-app-harness.md`

## 目的

外部Rabbita applicationの探索でsecurity riskが疑われるfindingを発見した場合、
詳細を公開repository、通常artifact、CI logへ出さない。同時に通常bugについては、
相手が理解しやすくissue化・PR化しやすいローカルhandoffを生成する。

## 実装結果

- `FindingVisibility`として`public-bug`と`private-security`を追加した。
- manifest schemaで`findingVisibility`を必須化した。
- private findingのpublic handoff exportを型付きerrorで拒否する。
- private external runは`.private/disclosures/<id>/run`へ強制し、通常summaryをredactする。
- `.private/`をGit ignoreへ追加した。
- tracked manifestに`private-security`が入ると失敗する
  `scripts/check_public_disclosure.py`を追加した。
- `external handoff <id|all>`で次を生成する。
  - `issue.md`
  - `reproduction.md`
  - `fix-plan.md`
  - `pr-body.md`
  - `machine.json`
- private bundleには`SECURITY-NOTE.md`も生成する。
- handoff metadataは`upstreamWritePerformed: false`を固定する。

## 受け入れ条件

- [x] private security findingをpublic exportできない。
- [x] private runの出力先をignore済みprivate rootへ固定する。
- [x] tracked public manifestへprivate findingを追加するとCIで失敗する。
- [x] 通常bugからissue/再現/fix plan/PR本文を機械生成できる。
- [x] generatorはupstream APIへ書き込まない。
- [x] 英日ポリシー文書を追加する。

## 注記

securityかどうかの分類自体は自動化しない。判断が曖昧な場合はprivateをdefaultとする。
