# Sandbox capability model

Status: open
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

- [ ] Linux / macOSのisolation guaranteeをreportから識別できる。
- [ ] strict要求時に不足capabilityでfail-closedする。
- [ ] filesystem/network/processのescape fixtureを持つ。
- [ ] fallbackは明示diagnosticを伴うか拒否される。
- [ ] capability reportがdeterministic。
