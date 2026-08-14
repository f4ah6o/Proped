# Proped

[日本語](README.ja.md) | English

Proped is a CLI and library for deterministic UI exploration. This repository provides a native `proped` CLI for Web projects and a MoonBit CLI/library for Rabbita model exploration.

## Native CLI

Build the native CLI from a checkout with Rust:

```bash
cargo build -p proped-cli
./target/debug/proped -V
```

Prepare the runtime used by Proped, then check it:

```bash
./target/debug/proped setup
./target/debug/proped doctor
```

`proped setup` prepares the Node/JavaScript and Playwright browser runtime used by the Web commands. It reuses a compatible installed Node when possible and otherwise installs the managed Node version. `proped doctor` checks runtime readiness without repairing or downloading it.

Release packaging builds native archives on Linux, macOS, and Windows. An archive contains the native executable under `bin/` and the Proped runtime sources under `lib/proped/`. Node, `node_modules`, and Chromium are not bundled in the archive; run `proped setup` after unpacking it. A SHA-256 checksum is generated alongside each archive.

If the runtime is stored somewhere other than the repository or the packaged `lib/proped` location, set `PROPED_RUNTIME_ROOT` to a Proped runtime tree containing `scripts/proped.mjs`.

## Web projects

Inspect a project without running its install, build, or start scripts:

```bash
proped web inspect <project>
proped web inspect <project> --json
```

Run the combined onboarding and exploration campaign:

```bash
proped web campaign <project>
```

`web campaign` can prepare project dependencies. Use `--no-prepare` when dependency preparation must not run.

For an explicit manifest-based flow:

```bash
proped web init <project> --output proped.web.json
proped web doctor proped.web.json
proped web prepare proped.web.json
proped web compile proped.web.json
proped web run proped.web.json
```

`web prepare` is the explicit dependency-install step. `web run` does not install missing target dependencies implicitly.

Run `proped web --help` for the Web commands implemented by the checked-in dispatcher.

## MoonBit exploration CLI

The MoonBit CLI is the direct interface to the Rabbita exploration engine:

```bash
moon run src/cli -- help
moon run src/cli -- schema --json
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
moon run src/cli -- external run all --json
```

`demo run all` writes under `demo/out/<demo-id>/`. `external run all` writes under `demo/out/external/<id>/`.

The complete MoonBit command and output contract is documented in [docs/CLI.md](docs/CLI.md).

## Documentation

- [CLI reference](docs/CLI.md)
- [Execution flow](docs/FLOW.md)
- [Disclosure and safety notes](docs/DISCLOSURE.md)
- [Web driver protocol](docs/WEB_DRIVER_PROTOCOL.md)

## License

Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
