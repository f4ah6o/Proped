First public release of Proped.

## Highlights

- Blind onboarding for unknown Web projects without project-specific executable adapters.
- Generic Browser exploration with deterministic replay and stable failure classes.
- Strict Linux sandboxing and constrained macOS sandboxing.
- Managed Node.js and Playwright/Chromium setup through `proped setup`.
- Native `proped` CLI distributions for Linux x86_64, macOS Apple Silicon (arm64), and Windows x86_64.
- 7/7 promoted frontier production gate with zero human interventions and zero adapter LOC.
- 11-target external production regression gate.

## Install

Download the archive for your platform, verify the adjacent SHA-256 file, extract it, then run:

```text
proped setup
proped doctor
```

Intel Mac builds are not supported.
