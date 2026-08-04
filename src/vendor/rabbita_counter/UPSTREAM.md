# Vendored Rabbita counter

- Upstream: `moonbit-community/rabbita`
- Source: `examples/counter`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Retrieved: 2026-08-04
- License: Apache-2.0
- `upstream/main.mbt.txt` SHA-256: `985210c29fbbc6eaa9e8fb39b116b7f858f5a849d81dac5132062246a7ecca45`
- `upstream/styles.css` SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

The unmodified upstream entry point is preserved as `upstream/main.mbt.txt`, with its stylesheet at `upstream/styles.css`.

`counter.mbt` is an adapter-oriented derivative. It keeps the upstream `Inc`/`Dec` transition semantics and visible heading/buttons, exposes those parts as a reusable package, and bounds generated actions to values from -3 through 3 so exhaustive state exploration remains finite and deterministic.
