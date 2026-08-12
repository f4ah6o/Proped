# macOS isolation backend

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-12
Updated: 2026-08-12
Priority: P2
Depends-On: `20260812-sandbox-capability-model.md`

## 目的

macOSローカルで未知repoを実行する際のfilesystem / network / process isolationを強化し、Linux bubblewrapとの差を明示したうえで可能な範囲をstrict backendへ近づける。

## 調査・実装対象

- macOS App Sandbox / Seatbelt系機構の利用可能性
- filesystem allowlist / deny-by-default
- network deny-by-default
- child processへのpolicy継承
- temporary workspace / home / credential leakage防止
- container / VM境界の必要性
- developer UXとCI policyの共通化

## 方針

- 「Macでも安全」と一括りにせず、capability modelで実保証を表現する。
- private APIや将来性の低い仕組みへ依存する場合はstrict扱いしない。
- 完全なstrict isolationが実用的でない場合、`Mac = discovery/development`, `Linux = untrusted autonomous execution` を正式policyとして選択可能にする。

## 受け入れ条件

- [ ] macOS backendの実保証と未保証をfixtureで示せる。
- [ ] filesystem / network / child process boundaryを検証できる。
- [ ] credential/home leakageを防ぐか明示的にunsupportedとする。
- [ ] strictを名乗る場合はLinux baselineと同等のrequired capabilityを満たす。
- [ ] 満たせない場合はconstrained/caller-enforcedとして正しくreportする。
