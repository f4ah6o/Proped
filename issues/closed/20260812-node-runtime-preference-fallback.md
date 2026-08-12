# Compatible fallback for preferred Node runtime pins

Status: closed

## Goal

Avoid blocking unknown-project onboarding when a project declares a broad compatible Node engine range plus an exact local-tooling preference such as `.nvmrc`, and the exact preferred runtime is not already installed.

## Implemented

- Manifest v2 now carries optional `project.nodePreferredVersion`.
- `engines.node` and shorthand selectors remain compatibility requirements.
- Exact `.nvmrc`, `.node-version`, and Volta pins are retained as preferred versions when compatible with every declared range.
- An exact pin without any broader range remains an exact requirement, preserving fail-closed behavior.
- Runtime selection order is: exact preferred version, highest compatible installed runtime in the preferred major, current compatible runtime, then highest compatible installed runtime.
- No Node runtime is downloaded implicitly.
- Doctor reports a warning when a compatible fallback is used instead of the preferred exact version.
- Pin/range conflicts and unsupported selectors remain critical inference failures.

## Real evidence

Pinned `moonbitlang/website` declares `engines.node >=18.0` and `.nvmrc v22.10.0`. The host does not have Node 22.10.0 but does have Node 22.22.3. Proped now records `nodeRequirement: >=18.0`, `nodePreferredVersion: 22.10.0`, and selects Node 22.22.3 with `selectedReason: preferred-major-fallback` instead of blocking on the missing exact pin.

## Validation

- Exact preferred runtime selection is covered by the Node runtime unit fixture.
- Same-major compatible fallback is covered and remains download-free.
- Existing unknown Web onboarding acceptance remains 6/6 known-failure recall with 0 false positives / 10,000 healthy transitions.
