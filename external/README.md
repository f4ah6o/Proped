# External Rabbita exploration

External repositories are read-only inputs. This directory stores reviewed,
pinned metadata for deterministic local exploration; it never creates issues,
pull requests, comments, or commits in upstream repositories.

Each manifest fixes the repository, revision, license, package entry points,
adapter strategy, source hash, and enabled properties. Executable network and
native effects are replaced with deterministic descriptors and injected
responses.


## Current targets

| ID | Strategy | Expected failure |
| --- | --- | --- |
| `proton-demo-todo` | `subscription-model` | stale snapshot version rollback |
| `ensenzu-app` | `effect-model` | accepted non-finite frequency |

Run both with `moon run src/cli -- external run all --json`.
