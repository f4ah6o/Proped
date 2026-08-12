# macOS isolation backend

Status: closed
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

- [x] macOS backendの実保証と未保証をfixtureで示せる。
- [x] filesystem / network / child process boundaryを検証できる。
- [x] credential/home leakageを防ぐか明示的にunsupportedとする。
- [x] strictを名乗る場合はLinux baselineと同等のrequired capabilityを満たす。
- [x] 満たせない場合はconstrained/caller-enforcedとして正しくreportする。

## 実装結果

- macOSではsystemのSeatbelt frontendである`/usr/bin/sandbox-exec`を、明示的な`constrained` backendとして追加した。manifestの`strict`を自動降格せず、ローカル実行時に`--sandbox-mode constrained`を明示した場合だけ利用する。
- filesystemはdefault write denyとし、review済みwritable pathとrunごとのprivate temporary HOME/TMPだけをwrite許可する。repository source、`.git`、repository外へのwriteはlive fixtureで拒否を確認した。
- networkはexternal trafficをdefault denyし、Generic Browserが必要とするlocalhost inbound/outboundだけを許可する。外向き接続拒否とloopback通信成功を同じlive fixtureで確認した。
- child processはSeatbelt policyを継承し、親と同じfilesystem write restrictionを受けることをlive fixtureで確認した。
- environmentはallowlist化し、HOME/TMPをrun専用directoryへ移す。`.ssh`、`.aws`、`.azure`、`.config/gcloud`、`.config/gh`、`.git-credentials`、`.netrc`、`Library/Keychains`はhost側の既知credential pathとしてread denyする。
- Playwrightはprivate HOMEへ切り替えると既存Chromium cacheを見失うため、既存の`ms-playwright` browser cacheだけを`PLAYWRIGHT_BROWSERS_PATH`で明示的にread利用する。cache自体へのwriteは許可しない。
- macOSではhost processが可視で、host HOME全体をread-isolateする保証もない。したがって`filesystem` / `network` / `process`はすべて`constrained`としてreportし、`strictEligible: false`とする。Linux bubblewrapのstrict baselineは維持する。
- strict要求をmacOSで実行すると、実際に利用可能なconstrained capabilityをreportしたうえでrequired strictとの差分によりstage開始前にfail-closedする。
- CIのsandbox-policyをLinux/macOS matrix化し、Linux strict live probeとmacOS constrained live probeを継続検証する。

## 検証

- `node scripts/test_sandbox_capability_model.mjs`
- `node scripts/test_web_execution_sandbox.mjs`
- `node scripts/test_web_execution_sandbox.mjs --live`（macOS実機）
- `node scripts/test_web_project_manifest_v2.mjs`
- `node scripts/test_web_project_runner.mjs`
- `node scripts/test_web_project_onboarding_v2.mjs`（macOSではGeneric Browser constrained E2Eを含む）
- `node scripts/test_proped_web_cli.mjs`
- `git diff --check`

macOS live probeでは、external network deny、loopback allow、source/`.git`/repository外write deny、明示writable path、credential path read deny、HOME relocation、child policy inheritanceを確認した。host process visibilityは意図的に`true`をfixtureで観測し、strict isolationではないことを固定している。
