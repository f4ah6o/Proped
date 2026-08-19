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

## Hosted evidence checkpoint

Implementation revision: `89902ff48733b4f8d4c0c44d8aca369d62210399` (`test(web): pin longitudinal opaque contract stability`).

- Production contracts run `32269595858`, attempt 1: green on the exact implementation revision. The longitudinal validator, both fresh actionable campaigns and comparison, all production shards, and the aggregate gate passed. The Lit Web Components shard spent an extended period in `Prepare managed browser runtime`, then recovered without retry and its actual production shard passed. This is infrastructure/setup latency, not a product-contract failure.
- CI run `32269595850`, attempt 1: Core contracts, production external contracts, all external-contract shards, sandbox-policy Linux/macOS, and managed runtime Windows/macOS passed. Four Linux jobs remained blocked for an extended period before product checks in dependency/browser/sandbox setup (`Install strict sandbox backend for production gate`, `Install Chromium system dependencies`, and two `Install Web project dependencies` steps). No contract/product test had failed.
- Because the CI stall is entirely before the affected product-contract steps and Production recovered the same class of managed-browser setup stall on the same implementation revision, this checkpoint records the first CI attempt as hosted-infrastructure stall evidence. The next CI run is a single fresh-runner revalidation of the unchanged implementation tree; no retry count, gate, threshold, contract, or product code is changed to make it green.

## Exit criteria

- [ ] current main / CI / Production contracts reconfirmed;
- [x] versioned contract inventory committed;
- [x] longitudinal baseline and regression committed;
- [x] candidate ordering drift detected;
- [x] portable action vector / transition classification drift detected;
- [x] accidental peer minimality inheritance detected;
- [x] privacy surface expansion and consumer evidence schema drift detected;
- [x] checkpoint isolation contract remains green;
- [x] source/peer engine evidence remains green;
- [x] adapter LOC remains 0;
- [x] semantic hash/version churn requires an explicit baseline migration;
- [x] both existing real-consumer fixed evidence vectors revalidate unchanged;
- [x] third proof added only if naturally available under the unchanged contract (evaluated; no qualifying third proof was already available, so none was manufactured);
- [ ] hosted CI green on the unchanged implementation tree;
- [x] Production contracts green on the implementation revision;
- [ ] completion evidence records exact revision, versions, CI/Production results, privacy, determinism, minimality, checkpoint isolation, cross-engine result, adapter LOC, and drift status;
- [ ] issue moved to `issues/closed` when complete.

## Non-goals

- new action kinds, selectors, framework adapters, or browser-driver features;
- consumer-specific runtime code in Proped;
- retries that hide flaky failures;
- weakening production gates;
- treating hosted setup/runtime failures as product-contract regressions;
- manufacturing a third proof solely to increase proof count.
