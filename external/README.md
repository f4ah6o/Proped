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
| `signal-reader` | `effect-model` | stale feed, search, and saved-state responses |
| `moonbit-editor-file-tree` | `effect-model` | unrelated resolve failure cancels newer auto-reveal |
| `canopy-components` | `pure` | positive maximum resize nudge wraps to minimum width |
| `canopy-editor-integration` | `subscription-model` | reverse document callback ordering and queued callback after unmount |
| `rabbita-utility-batch` | `effect-model` | initial empty Fullstack Trial title crosses the HTTP boundary |
| `incr-typed-spreadsheet` | `pure` | typed formula addition wraps across Int32 boundary |
| `circular-state` | `effect-model` | task modal survives removal of its selected task |
| `isomorphic-suite` | `effect-model` | missing Kanban column plus stale Kanban/Todo/Note list state |

All tracked manifests are `public-bug`. Security-sensitive manifests and evidence must stay below `.private/disclosures/` and are rejected by `scripts/check_public_disclosure.py` if tracked.

Run all targets with `moon run src/cli -- external run all --json`. Validate the ten-repository Tier 3 and Proton classification report with `python3 scripts/utility_batch.py validate`; `inspect --checkout-root <dir>` also verifies pinned local checkout revisions and hashes. Generate local communication drafts with `moon run src/cli -- external handoff <id> --json`; no upstream API is called.
