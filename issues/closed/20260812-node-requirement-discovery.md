# Node requirement discovery for unknown Web projects

Status: closed

## Goal

Reduce unknown-project setup by inferring the target Node requirement without executing project code.

## Implemented

- Read `package.json#engines.node`.
- Read exact or shorthand selectors from `package.json#volta.node`, `.nvmrc`, and `.node-version`.
- Normalize `22` to `>=22.0.0 <23.0.0`, `22.22` to `>=22.22.0 <22.23.0`, and full three-part versions to exact pins.
- Intersect compatible range declarations instead of choosing one arbitrarily.
- Preserve raw selector evidence in the inspection result.
- Fail closed on conflicting exact pins, pin/range conflicts, or selectors that cannot be safely interpreted.
- Preserve ambiguities in manifest v2 inference metadata.
- Block `doctor`, `web prepare`, and `web run` before child-process execution while blocking Node ambiguities remain.

## Validation

- `.nvmrc` exact pin, shorthand major selector, Volta pin, engines+selector intersection, conflict, and unparseable-selector fixtures pass.
- `web prepare` / `web run` deny ambiguous Node requirements before install.
- Existing installed-runtime fallback remains green.
- Unknown onboarding acceptance remains 6/6 known-failure recall.
- Healthy generic transition benchmark remains 0 false positives / 10,000 transitions.
