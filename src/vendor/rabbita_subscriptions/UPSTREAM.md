# Vendored Rabbita subscriptions example

- Upstream: `moonbit-community/rabbita`
- Source: `examples/subscriptions`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Retrieved: 2026-08-04
- License: Apache-2.0
- `upstream/client.mbt.txt` SHA-256: `bfe68b159ed57ebbb4171b909fd1a0b8db58027c054565d230b2e96b47ee1db7`
- `upstream/styles.css` SHA-256: `49b22ed9d60540be7273937326198aed71200d7bd6b63f7556e6867145b86035`

The preserved upstream client is 420 lines and demonstrates timer, resize, scroll, keyboard, visibility, and mouse subscriptions.

The native adapter models one timer callback already queued when the user pauses the ticker. The upstream update increments `tick_count` for every `Tick`, so the queued callback mutates a paused model. The minimized counterexample is `ToggleTicker -> Tick`.
