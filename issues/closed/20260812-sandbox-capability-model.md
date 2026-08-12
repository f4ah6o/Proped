# Sandbox capability model

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-12
Updated: 2026-08-12
Priority: P1

## 目的

未知repo実行時のisolation guaranteeをplatformごとに曖昧にせず、filesystem / network / processの保証レベルとしてmachine-readableに固定する。

## Capability model

各軸を少なくとも以下で表現する。

- `strict`
- `constrained`
- `caller_enforced`

対象軸:

- filesystem
- network
- process

## Policy

- campaignがstrict isolationを要求し、hostが満たせない場合は実行拒否する。
- 弱いsandboxへのsilent fallbackは禁止する。
- report/artifactへ実際に適用されたcapabilityを保存する。
- Linux bubblewrap backendをstrict baselineとして扱う。
- Mac backend完成前も、caller-enforcedであることを明示できるようにする。

## 受け入れ条件

- [x] Linux / macOSのisolation guaranteeをreportから識別できる。
- [x] strict要求時に不足capabilityでfail-closedする。
- [x] filesystem/network/processのescape fixtureを持つ。
- [x] fallbackは明示diagnosticを伴うか拒否される。
- [x] capability reportがdeterministic。
- [x] `git diff --check` と対象テストが通る。

## 実装結果

- `protocol/sandbox-capability-model.mjs` を追加し、`filesystem` / `network` / `process` の3軸と `strict` / `constrained` / `caller_enforced` の3レベルを固定した。
- Web runnerは実際に適用されたplatform/backend/capability/required capability/diagnosticをsummaryへ保存する。
- strict実行は3軸すべてが`strict`でなければstage起動前に `sandbox_capability_requirement_not_met` でfail-closedする。
- macOSを含むstrict backend未対応platformは3軸とも`caller_enforced`として観測され、strictへsilent fallbackしない。
- Linux bubblewrap baselineへPID namespace、IPC/UTS namespace、new sessionを追加し、process isolationをstrict capabilityへ含めた。
- live escape fixtureへrepository外filesystem write、host PID visibility、child process policy inheritanceを追加した。
- CIでcapability-model regressionを常時実行し、Linux sandbox-policy jobではlive escape probeを継続する。

### 検証

- `node scripts/test_sandbox_capability_model.mjs`
- `node scripts/test_web_execution_sandbox.mjs`
- `node scripts/test_web_project_runner.mjs`
- `node scripts/test_web_project_onboarding_v2.mjs`
- `git diff --check`

Linux live probe:

- `node scripts/test_web_execution_sandbox.mjs --live`（CI `sandbox-policy` job。macOSローカルでは実行不可）
