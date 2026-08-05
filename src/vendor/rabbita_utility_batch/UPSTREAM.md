# Upstream provenance and batch boundary

The batch report at `external/utility-apps.json` is authoritative for all ten inspected repositories. It records pinned revisions, licenses, relevant source paths, deterministic source hashes, supported/partial/unsupported classification, and whether source was vendored.

## Executed supported boundaries

| Repository | Revision | License | Preserved source | Modeled boundary |
| --- | --- | --- | --- | --- |
| `CAIMEOX/symweb` | `a37f96d283b4bdbb2d1654ca88a9c26033db6c46` | Apache-2.0 | `upstream/symweb/app.mbt.txt` | draft revision, debounce, settings, structural display |
| `bobzhang/issues` | `a348501b2ca848d6564557b58446269c90ba4e3a` | Apache-2.0 | `upstream/issues/dashboard.mbt.txt` | selection, save descriptor, reverse `GraphSaved` delivery |
| `beso1225/fullstack_trial_moonbit` | `5ed67d454600210861eb4ba8178aa91e1e34406f` | Apache-2.0 | `upstream/fullstack_trial/main.mbt.txt` | local validation, HTTP request descriptor, reply ordering |
| `moonbit-community/proton` | `7e819f385af0c7cc7b78397281b1ab5c3306bc5f` | Apache-2.0 | `upstream/proton/adapter*.mbt.txt` | invoke completion and subscription generation |

Combined fixture SHA-256 using `scripts/external_harness.py` multi-source labeling: `25ab15a6554c1558d2942ef78252872d98d4886adc88f41dda540cfcded68871`.

Each upstream license is preserved beside its source. The adapter is clean-room MoonBit code in `rabbita_utility_batch.mbt`; it does not import or execute upstream packages. HTTP, timers, scheduler callbacks, browser DOM, native state, and subscriptions are explicit finite descriptors or injected messages.

## Classified-only boundaries

`chnlkw/moonxi_board`, `xz-xuezhe/moonblox`, `CAIMEOX/calculus-singularity`, `bobzhang/games`, `tekihei2317/moonbit-rpc-poc`, and `moonbitlang/OSC2026` remain metadata-only or partial. Their reasons are recorded per entry in `external/utility-apps.json`. No source was copied from repositories whose pinned revision lacks an explicit license.

## Revalidation

```sh
python3 scripts/utility_batch.py validate
python3 scripts/utility_batch.py sync --checkout-root .tmp/rabbita-usage-scan
moon run src/cli -- external run rabbita-utility-batch --json
```

Both utility commands are read-only with respect to upstream checkouts. The inspect result explicitly reports `upstreamWritePerformed: false`.
