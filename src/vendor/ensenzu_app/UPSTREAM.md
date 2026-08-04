# Upstream provenance

- Repository: `shiguri-01/ensenzu`
- Revision: `f1fbec776a393e7023c8fa8324ea26c0774752e5`
- Retrieved: 2026-08-05
- License: Apache-2.0
- Primary package: `app/src`
- Upstream calculation source: vendored from `ensenzu/` at the same revision

## Preserved files

- `upstream/app.mbt.txt`
  - SHA-256: `a580832dc58cd030ee22091abf58be8a1542c0696e57eae6f223d0e1c9bfd14b`
- `upstream/view.mbt.txt`
  - SHA-256: `5180af2068efe62d50d77a7b4cdbdf42112f81413b7ef65b9df5f183c832853b`
- `upstream/styles.css`
  - SHA-256: `f7ee87e2f438bfd67b991e99fc28db42765aa68b1f6e1db9dae8c0d6b81020df`

## Adaptation

The native adapter preserves parsing, field-source selection, diagram generation,
previous-result retention, pending input, reset, and advanced-toggle semantics.
The browser download command is recorded as a deterministic `DomCommand` effect.
The action generator uses a finite input corpus for every `FieldKey`.

The expected failure is the upstream acceptance of `Infinity` for the active
`Frequency` field. `parse_double` accepts the literal, and the downstream
validation checks only `frequency > 0.0`, so the non-finite value reaches a
state with `error=None` and `pending_input=false`.

No issue, pull request, comment, commit, or other write is made to the upstream
repository.
