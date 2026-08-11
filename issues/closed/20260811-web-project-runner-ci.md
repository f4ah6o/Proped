# Web project runnerとCI統合を追加する

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-11
Updated: 2026-08-11
Priority: P1
Depends-On: `20260807-web-mutation-quality-gate.md`

## 目的

React/Vue/Playwright/Next.js/Nuxt、cross-mode replay、external dogfood、mutation quality gateを個別test scriptの集合ではなく、1つのfail-closed manifestから実行できる安定したWeb project runnerとして提供する。

## 実装

- project manifestのschemaと厳格validationを追加する。
- stage kind、argv、cwd、timeout、required、dependsOnをmanifestで定義する。
- shellを経由せずargvでchild processを起動する。
- dependency failure時はdownstream stageをblockedとして実行しない。
- exit 0/1/2/other/timeoutをpass/quality_gate_failed/usage_error/execution_failed/timeoutへ分類する。
- child JSON outputからstable semantic hashとquality diagnosticsを集約する。
- summary.json、atlas.json、atlas.html、atlas.svg、atlas.dotを統一出力する。
- `validate`、`run`、`--output`、`--no-artifacts`、`--help`を持つCLIを追加する。
- repository自身のfull Web quality manifestを追加する。
- CIからrunner manifestを実行する。

## 安全性

- manifest path、projectRoot、stage cwd、artifact outputはrepository root外へescapeできない。
- shell executionを使わない。
- child stageへallowlist外の環境変数を渡さない。
- network、child filesystem write、upstream write、credentialsはcaller-enforced policyとして明示し、runnerがOS sandboxを提供していると誤認させない。

## 受け入れ条件

- [x] valid manifestがdeterministicにvalidateされる。
- [x] unknown field、path escape、duplicate stage、invalid dependencyがfail closedする。
- [x] stage failure codeとdependency blockingがunit testで固定される。
- [x] custom outputとartifact suppressionが動作する。
- [x] repository full manifestが既存Web suiteを表現する。
- [x] CI integrationを追加する。
- [x] docs/README/CHANGESを更新する。
- [x] 関連test、MoonBit test、`git diff --check`がpassする。

## 変更履歴

`CHANGES.md` impact: yes

## 完了結果

- manifest v1と厳格validatorを追加し、13 stageのrepository Web quality graphを固定した。
- stage exitを`pass` / `quality_gate_failed` / `usage_error` / `execution_failed` / `timeout`へ分類し、dependency failureは`blocked`へ倒す。
- lexical path traversalとsymlink escapeをprojectRoot、cwd、artifact outputで拒否する。
- child stageへallowlist外の環境変数を渡さず、child processのnetwork/filesystem/upstream/credential制約はcaller-enforcedであることを明示した。
- JSON/HTML/SVG/DOT/summary artifactを統一出力し、custom outputとartifact suppressionを固定した。
- CIを個別Web test列からdependency install + manifest validate/runへ統合した。
- `pnpm install`で5つのWeb package依存とPlaywright Chromiumを実導入し、13 stage full manifestを実行して13/13 passを確認した。
- 初回full runでNext production buildが120秒上限に到達し、Nuxt buildも107.6秒だったため、両SSR build timeoutを300秒へ調整した。再実行ではNext build 18.5秒、Nuxt build 34.7秒で通過した。
- 実Browser ModeはPlaywright 1.62.0 / Chromium 151.0.7922.34でpassし、Next/Nuxt production build + hydration、cross-mode replayまで完走した。
- runner unit test、generic property、network/timer、external dogfood、mutation quality gate、MoonBit native/js、YAML parse、`git diff --check`を確認した。
