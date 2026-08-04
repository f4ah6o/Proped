# Vendored Rabbita WebSocket example

- Upstream: `moonbit-community/rabbita`
- Source: `examples/websocket`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Retrieved: 2026-08-04
- License: Apache-2.0
- `upstream/client.mbt.txt` SHA-256: `c56b03c7bf8cfc1c96a41384535c3b4599f0ed887c06b75932110bb599326ca1`
- `upstream/styles.css` SHA-256: `56c6a08df3246456dcc9b92b773dcb60da999a81e5da999b1f6823118f23f802`

The preserved upstream client is 956 lines and includes subscription and command WebSocket APIs, connection lifecycle, state refresh, chat/raw sending, and capped transcripts.

The adapter focuses on the command client. Upstream treats `closing` as a `client_connecting` status, so the disconnect button remains enabled after a close request. A second click appends and dispatches another close request. The minimized counterexample is `ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested`.
