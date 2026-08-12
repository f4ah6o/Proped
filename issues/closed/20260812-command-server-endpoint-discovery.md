# Managed command-server endpoint discovery

## Problem

Manifest v2 command-server mode previously reserved a local port and injected `PORT`, `HOST`, `HOSTNAME`, and Nitro equivalents, then assumed the target server bound exactly that port. Unknown preview servers that ignore `PORT` and print their actual local URL would time out even when healthy. Readiness failure also needed stronger process-tree cleanup.

## Contract

- reserve a fresh `127.0.0.1` port and provide it as a strong hint
- seed readiness with the reserved-port URL
- inspect bounded stdout/stderr for literal `http://` or `https://` loopback URLs only
- allow `127.0.0.1`, `localhost`, and IPv6 loopback; never accept external origins from logs
- recover URLs split across output chunks by rescanning bounded tails
- probe all discovered loopback candidates until one returns status < 500
- pass a credential-safe environment allowlist to the child command
- on child exit, timeout, or readiness error, terminate the process tree before returning
- retain diagnostics showing requested port, selected URL source, and discovered loopback URLs

## Implementation

- `protocol/web-command-server.mjs`
- `scripts/web_generic_browser_stage.mjs` now delegates command-server lifecycle to the shared runtime
- `scripts/test_web_command_server.mjs`

## Synthetic acceptance

The fixture intentionally ignores the requested `PORT`, binds a random loopback port, and prints its real URL. The test verifies:

- stdout URL fallback succeeds
- selected URL is not the requested port
- external logged URL is ignored
- credential variables are absent in the child
- a URL split across output chunks is reconstructed
- a server that never becomes ready is killed after timeout
- normal successful shutdown also cleans up

Existing server-hook, generic browser onboarding, and unknown-project acceptance tests remain green.
