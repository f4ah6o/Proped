# External finding disclosure policy

Proped Rabbita treats every external repository as a read-only input. It never
creates an upstream issue, pull request, review, comment, commit, or branch.
Generated handoff files are local drafts only.

## Classification before publication

Every external finding is classified before details are exported:

- `public-bug`: a normal correctness, reliability, or UX defect. A local issue
  and pull-request handoff may be generated.
- `private-security`: a finding whose reproduction or impact could create a
  security risk. Detailed output must not enter tracked files, normal Atlas
  output, CI logs, or public issue drafts.

Tracked manifests under `external/manifests/` may contain only `public-bug`.
Private security manifests, adapters, evidence, and reports belong below
`.private/disclosures/<id>/`, which is ignored by Git.

## Enforced gates

The policy is enforced in code and CI:

1. `FindingVisibility` is required by the manifest and handoff model.
2. `public_handoff_files` rejects `private-security` before returning detailed
   content.
3. external run policy redirects private findings to
   `.private/disclosures/<id>/run` and returns only a redacted summary.
4. `.private/` is ignored by Git.
5. `scripts/check_public_disclosure.py` fails if a tracked manifest is marked
   `private-security`, a private file is tracked, or the private root is not
   ignored.

This is a publication safety boundary, not an automatic vulnerability
classifier. The agent or reviewer must classify ambiguous findings as private
until reviewed.

## Local handoff bundles

For a `public-bug`, run:

```bash
moon run src/cli -- external handoff <id> --output artifacts --json
```

The command writes the following local drafts under
`artifacts/handoff/<id>/`:

- `issue.md`: summary, revision, reproduction, expected/actual behavior, impact,
  evidence, suggested direction, and verification.
- `reproduction.md`: minimized trace and stable action IDs.
- `fix-plan.md`: scoped implementation and regression-test plan.
- `pr-body.md`: a ready-to-edit pull-request description.
- `machine.json`: structured metadata with
  `upstreamWritePerformed: false`.

The generator does not call GitHub or any upstream API. A human may later edit
and submit the drafts outside this workflow.

A private security handoff uses the same structure plus `SECURITY-NOTE.md`, but
is written only below `.private/disclosures/` and cannot be exported through the
public path.

## Review checklist

Before moving any external finding into a public document:

1. Confirm it is not an authentication, authorization, secret exposure, code
   execution, injection, privacy, integrity, or availability security issue.
2. Separate observed upstream behavior from assumptions introduced by the
   deterministic adapter.
3. Include the pinned revision and stable minimized trace.
4. Avoid including private user data, credentials, tokens, production URLs, or
   unnecessary exploit detail.
5. Confirm the generated metadata says `upstreamWritePerformed: false`.
