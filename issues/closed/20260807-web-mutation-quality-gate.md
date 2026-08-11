# Web mutation benchmarkを再利用可能な品質ゲートにする

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-07
Updated: 2026-08-11
Priority: P1
Depends-On: `20260805-web-mutation-benchmark.md`

## 背景

現在のWeb mutation benchmarkは8 mutationを検出し、healthy controlのfalse positiveがないことをCIでassertしている。ただし閾値判定がtest scriptへ埋め込まれており、外部CIやLLMから反復回数・mutation score・false-positive rate・性能閾値を指定できない。失敗時もassertion中心で、品質ゲート違反を機械的に分類しづらい。

## 実装

- mutation catalogとperformance resultを受け取る再利用可能なquality gate APIを追加する。
- mutation score、false-positive rate、deterministic replay、最小trace、throughput、elapsed timeを個別codeで判定する。
- benchmark scriptへfail-closedな引数解析を追加する。
- `--iterations`、score/rate/performance閾値、`--output`、`--no-artifacts`、`--help`を提供する。
- gate違反時はmachine-readable JSONをstderrへ出力してnon-zero終了する。
- default contractとgolden fixtureの決定性を維持する。

## 受け入れ条件

- [x] default benchmarkが8/8 mutation kill、false positive 0でpassする。
- [x] 各quality gate違反codeをunit assertionで固定する。
- [x] unknown/missing/invalid CLI argumentがfail closedする。
- [x] custom outputとartifact suppressionが動作する。
- [x] fixture、JSON/HTML/SVG/DOT artifact、documentationを更新する。
- [x] 全関連testがpassする。

## 変更履歴

`CHANGES.md` impact: yes

## 完了結果

- `evaluateMutationQualityGate`を追加し、mutation score、false-positive rate、deterministic replay、最小trace、throughput、elapsed timeをstable codeで判定するようにした。
- CLIへ反復回数・品質閾値・custom output・artifact suppression・helpを追加し、引数エラーはexit 2、品質違反はexit 1 + stderr JSONでfail closedする。
- CLIを子プロセスで検証し、unknown/missing/invalid argument、custom output、`--no-artifacts`、quality-gate rejectionを固定した。
- golden fixtureへdefault quality contractを追加し、JSON/HTML/SVG/DOT出力と英日ドキュメントを更新した。
- default benchmarkは8/8 mutation kill、false positive 0でpass。MoonBit native 159/159、js 131/131、関連Webテストと`git diff --check`もpassした。
