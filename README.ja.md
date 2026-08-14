# Proped

日本語 | [English](README.md)

Proped は、決定的な UI 探索を行う CLI / ライブラリです。このリポジトリには、Web プロジェクト向けの native `proped` CLI と、Rabbita モデル探索向けの MoonBit CLI / ライブラリが含まれます。

## Native CLI

Rust が利用できる checkout では、次のように native CLI をビルドできます。

```bash
cargo build -p proped-cli
./target/debug/proped -V
```

Proped が使用する runtime を準備し、状態を確認します。

```bash
./target/debug/proped setup
./target/debug/proped doctor
```

`proped setup` は Web command が使用する Node / JavaScript と Playwright browser runtime を準備します。互換性のある Node が既にあれば再利用し、なければ Proped が管理する Node version を導入します。`proped doctor` は runtime の readiness を確認しますが、repair や download は行いません。

Release packaging は Linux x86_64、macOS Apple Silicon (arm64)、Windows x86_64 向けの native archive を生成します。Intel Mac buildはサポートしません。archive には `bin/` 配下の native executable と `lib/proped/` 配下の Proped runtime source が含まれます。Node、`node_modules`、Chromium は archive に含まれないため、展開後に `proped setup` を実行します。各 archive には SHA-256 checksum も生成されます。

runtime を repository や packaged `lib/proped` 以外に置く場合は、`scripts/proped.mjs` を含む Proped runtime tree を `PROPED_RUNTIME_ROOT` で指定できます。

## Web プロジェクト

install / build / start script を実行せずに project を inspection できます。

```bash
proped web inspect <project>
proped web inspect <project> --json
```

onboarding と exploration をまとめて実行する場合は `campaign` を使います。

```bash
proped web campaign <project>
```

`web campaign` は必要に応じて project dependency を準備できます。dependency preparation を実行させない場合は `--no-prepare` を指定します。

manifest を明示して段階的に実行する場合は次の command を使います。

```bash
proped web init <project> --output proped.web.json
proped web doctor proped.web.json
proped web prepare proped.web.json
proped web compile proped.web.json
proped web run proped.web.json
```

`web prepare` が dependency install を明示的に行う step です。`web run` は不足している target dependency を暗黙に install しません。

checked-in dispatcher が実装している Web command は `proped web --help` で確認できます。

### 実OSS benchmark gate

Proped は pinned corpus に実OSS onboarding の evidence を保持します。`external-production` は strict regression corpus、`promoted-production` は auto-onboarding 100%、deterministic replay、human intervention 0、project-specific adapter LOC 0 を実証した frontier topology の production corpus です。scheduled OSS campaign はこれらのKPIを記録し、前回campaign artifactとの差分も比較します。

## MoonBit 探索 CLI

MoonBit CLI は Rabbita exploration engine の直接入口です。

```bash
moon run src/cli -- help
moon run src/cli -- schema --json
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
moon run src/cli -- external run all --json
```

`demo run all` は `demo/out/<demo-id>/` 配下へ、`external run all` は `demo/out/external/<id>/` 配下へ出力します。

MoonBit command と output contract の詳細は [docs/CLI.ja.md](docs/CLI.ja.md) にあります。

## ドキュメント

- [CLI リファレンス](docs/CLI.ja.md)
- [実行フロー](docs/FLOW.ja.md)
- [Disclosure / safety notes](docs/DISCLOSURE.ja.md)
- [Web driver protocol](docs/WEB_DRIVER_PROTOCOL.md)

## License

Apache-2.0。詳細は [LICENSE](LICENSE) と [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
