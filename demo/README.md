# Newsletter atlas demo

This executable demonstrates the complete local Proped Rabbita flow:

- reachable newsletter-form state transitions;
- model and rendered-HTML properties;
- Rabbita browserless rendering through `rabbita_machine`;
- static HTML, JSON, and Graphviz DOT atlas exports.

Run it from the module root:

```bash
moon run demo
```

The command writes generated artifacts to `demo/out/`:

- `atlas.html` — open this file in a browser to inspect the state cards,
  transitions, dependencies, and property results;
- `atlas.json` — machine-readable report for CI or another visualizer;
- `atlas.dot` — Graphviz transition graph source.

The demo is native-only because it writes local files. The Rabbita
`render_to_string` warning is expected: Rabbita currently marks that server-side
rendering entrypoint as an Experimental API.
