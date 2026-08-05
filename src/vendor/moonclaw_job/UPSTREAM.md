# Moonclaw Rabbita job UI provenance

- Repository: `vectie/moonclaw`
- Revision: `5fdc845f2a926cdd17260fb9720135a2c50eff38`
- License: Apache-2.0
- Relevant package: `ui/rabbita-job/main`
- Preserved source:
  - `upstream/update.mbt.txt`
  - `upstream/model_types.mbt.txt`
- Manifest source hash: SHA-256 of `upstream/update.mbt.txt`
  - `15b8300dce13d0ce57d9c0b7f5076c38a8135fe7659a582cef597e230c27fb04`

The adapter is a finite native behavioral model of the Jobs surface only. HTTP
requests and stream drains are descriptors; no Moonclaw daemon, browser stream,
or upstream API is executed. Request IDs exist in the adapter only to control
and explain response ordering. The pinned `SnapshotLoaded` branch accepts a
response by selected `run_id` and does not carry or compare a request generation,
which is the behavior preserved by the adapter.

The Cowork and ACP surfaces are excluded. In particular, the pinned Jobs surface
has no direct cancel or retry message; cancel exists on the separate ACP surface.
