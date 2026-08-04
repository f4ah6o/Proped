# Runnable atlases

The CLI generates two end-to-end examples:

```bash
moon run src/cli -- demo list --json
moon run src/cli -- demo run all --json
```

Outputs are grouped by stable demo ID:

```text
demo/out/
  newsletter/
    atlas.html
    atlas.svg
    atlas.json
    atlas.dot
    summary.json
  rabbita-counter/
    atlas.html
    atlas.svg
    atlas.json
    atlas.dot
    summary.json
```

`newsletter` exercises form validation, consent, submission, reset behavior, state properties, and transition properties.

`rabbita-counter` uses the vendored source from Rabbita's official `examples/counter`, pinned to revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`. Its adapter preserves upstream increment/decrement behavior and bounds exploration to values from -3 through 3.

Use a different output root with:

```bash
moon run src/cli -- demo run all --output artifacts --json
```

The CLI returns exit code `3` when any property fails, making the same command suitable for local inspection and CI gating.
