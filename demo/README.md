# Runnable atlases

The CLI generates three end-to-end examples:

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
  rabbita-todo/
    atlas.html
    atlas.svg
    atlas.json
    atlas.dot
    summary.json
```

`newsletter` exercises form validation, consent, submission, reset behavior, state properties, and transition properties.

`rabbita-counter` uses the vendored source from Rabbita's official `examples/counter`, pinned to revision `67e8169efa1bb2e8bd17018b62b41211cbc4c357`. Its adapter preserves upstream increment/decrement behavior and bounds exploration to values from -3 through 3.

`rabbita-todo` uses the official 281-line TODO example at the same revision. Its finite adapter exercises title changes, add, delete, toggle, tab selection, filtered lists, and statistics. The declared expected outcome is a property failure: the upstream add guard rejects only the empty string, so a single-space title is stored. The runner shrinks the failure to `TitleChanged(" ") -> Add` and records it once.

Use a different output root with:

```bash
moon run src/cli -- demo run all --output artifacts --json
```

The CLI returns `0` when every selected demo matches its declared expected outcome, including expected-failure regression fixtures. It returns `3` when an expected pass fails or an expected failure is no longer reproduced.
