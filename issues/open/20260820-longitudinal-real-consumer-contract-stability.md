# Longitudinal real-consumer contract stability

Status: open
Created: 2026-08-20
Priority: P1

## Purpose

Prove that Proped's completed generic opaque-Web and actionable-finding contracts keep the same meaning across time, consumer boundaries, and runtime boundaries without adding consumer-specific behavior.

This is a maturity/evidence issue, not a feature issue.

## Current baseline

Starting `main` revision: `301fdb31a358d8ff19275bb9072c1edb8a0ae4c1`.

- worktree clean and `origin/main` aligned after `git pull`;
- open issue set was empty;
- current hosted CI run `32266006726` is green on the exact starting revision;
- latest Production contracts run before this issue is `32260480685`, green on implementation revision `4572d195bfd5f18ba61f23cace9ff97839c229d5` after hosted managed-browser setup stalls were rerun without product code changes;
- the starting revision is docs/issues-only after that implementation, so Production contracts was correctly skipped by its `paths-ignore` policy;
- current CI still showed a long infrastructure-only setup observation: `Managed runtime (ubuntu-latest)` spent about 16m41s in `Install Chromium system dependencies` but completed successfully. This is setup latency, not a contract regression.

## Scope

1. Inventory the versioned generic contracts and their dependencies.
2. Pin a longitudinal baseline for contract versions and semantic evidence hashes.
3. Detect candidate-order, portable-vector, transition-classification, minimality, privacy, checkpoint, cross-engine, consumer-schema, adapter-LOC, and unexplained semantic-hash drift.
4. Revalidate the two existing independent real-consumer/runtime-boundary fixtures through the unchanged `OpaqueWebRealConsumerEvidenceV1` / `OpaqueWebRealConsumerAcceptanceV1` implementation.
5. Keep consumer-specific runtime execution outside Proped CI.
6. Keep hosted infrastructure/setup failures distinguishable from product/contract failures in completion evidence.
7. Add a third proof only if an already-available independent consumer can satisfy the unchanged contract with adapter LOC = 0 and no new generic/runtime capability.

## Contract invariants

The consumer producer boundary remains limited to fixed enums, `kind + ordinal`, transition classes, attempt counts, deterministic/fresh/isolation booleans, minimality, and version information.

Forbidden producer evidence remains consumer/application identity, URL, selector, text, accessibility names, screenshots/pixels, console/source data, storage values, and application-specific metadata.

No existing contract may be silently reinterpreted. A compatibility-breaking semantic change requires the owning contract version to change and an explicit migration note/baseline update.

## Exit criteria

- [ ] current main / CI / Production contracts reconfirmed;
- [ ] versioned contract inventory committed;
- [ ] longitudinal baseline and regression committed;
- [ ] candidate ordering drift detected;
- [ ] portable action vector / transition classification drift detected;
- [ ] accidental peer minimality inheritance detected;
- [ ] privacy surface expansion and consumer evidence schema drift detected;
- [ ] checkpoint isolation contract remains green;
- [ ] source/peer engine evidence remains green;
- [ ] adapter LOC remains 0;
- [ ] semantic hash/version churn requires an explicit baseline migration;
- [ ] both existing real-consumer fixed evidence vectors revalidate unchanged;
- [ ] third proof added only if naturally available under the unchanged contract;
- [ ] hosted CI green on the implementation revision;
- [ ] Production contracts green on the implementation revision;
- [ ] completion evidence records exact revision, versions, CI/Production results, privacy, determinism, minimality, checkpoint isolation, cross-engine result, adapter LOC, and drift status;
- [ ] issue moved to `issues/closed` when complete.

## Non-goals

- new action kinds, selectors, framework adapters, or browser-driver features;
- consumer-specific runtime code in Proped;
- retries that hide flaky failures;
- weakening production gates;
- treating hosted setup/runtime failures as product-contract regressions;
- manufacturing a third proof solely to increase proof count.
