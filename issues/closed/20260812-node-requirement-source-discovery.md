# Node requirement source discovery for unknown Web projects

Status: closed

## Problem

Unknown projects frequently pin Node outside `package.json#engines.node`, especially through `.nvmrc`, `.node-version`, or `package.json#volta.node`. Ignoring those sources can select the wrong installed runtime; blindly preferring one source can hide repository configuration conflicts.

## Implementation

- Read-only inspection now gathers Node requirements from `engines.node`, `volta.node`, `.nvmrc`, and `.node-version`.
- Numeric selectors are normalized conservatively; no shell or version-manager command is executed.
- Compatible exact pins are checked against declared engine ranges with the existing bounded Node-engine evaluator.
- When an engine range and exact pin agree, the engine range remains the canonical manifest requirement while source evidence is retained.
- Multiple incompatible pins, a pin outside the declared range, an unprovable pin/range relationship, or an unsupported selector become `severity: error` inference ambiguities.
- Generated manifest v2 preserves those ambiguities and refuses compilation until reviewed.
- `web doctor`, `web prepare`, and `web run` reject critical inference ambiguity before install/build so review-required configuration can never trigger target mutation.

## Validation

Committed fixtures cover `.nvmrc` exact and major selectors, `.node-version`, `volta.node`, compatible range+pin declarations, conflicting pins, and unsupported selectors. Conflict/unsupported fixtures fail closed at manifest compilation; a separate prepare/run regression proves critical ambiguity blocks before `node_modules` creation.

Existing unknown-Web onboarding acceptance remains 6/6 known-failure recall with 0 false positives across 10,000 healthy transitions.
