# External Web dogfood campaign

The external Web dogfood campaign runs one reviewed, permissively licensed target boundary for React, Vue, Next.js, and Nuxt. It is intentionally bounded and offline: upstream repositories are read-only inputs, source snapshots are hash-pinned, and no network, issue, pull request, comment, commit, mail, payment, filesystem-outside-report, cloud, or native mutation is permitted.

## Targets

| Target | Upstream revision | Boundary | Result |
| --- | --- | --- | --- |
| `vite-react-counter` | `vitejs/vite` `843a47da6b93dbd3ce28c4ffae33a8ef338c6f05` (`create-vite@9.1.2`) | React counter state and accessible button | 5 states, 4 transitions, zero failure |
| `vite-vue-counter` | `vitejs/vite` `843a47da6b93dbd3ce28c4ffae33a8ef338c6f05` (`create-vite@9.1.2`) | Vue ref state and accessible button | 5 states, 4 transitions, zero failure |
| `next-hello-world` | `vercel/next.js` `d73f5622e226358dcef8cf7a8a373333ff265ae7` (`v16.3.0`) | App Router static semantic render | 1 state, 0 transitions, zero failure |
| `nuxt-hello-world` | `nuxt/nuxt` `2bfc2c87a6f3bb9b17b4b6a2e9c117ef06b278d4` (`v4.4.8`) | Nuxt static semantic SSR render | 1 state, 0 transitions, zero failure |

The checked-in source files are reviewed reduced boundaries, not claims of byte-for-byte full upstream copies. Each manifest records the upstream path, exact revision, permissive license, local snapshot path, snapshot kind, and SHA-256 digest.

## Property coverage

All targets run deterministic replay, unhandled-exception, and pending-effect-leak checks. Counter targets also verify stable semantic action identity. Static SSR targets verify semantic render stability. A zero-failure result means only that every property covered by the finite reviewed boundary passed; it does not imply that the whole upstream application is defect-free.

Every target emits a replay signature from the target ID, pinned revision, stable action trace, and final semantic fingerprint. Running the campaign twice must produce byte-equivalent machine results and the committed golden fixture.

## Unsupported effects

Unsupported behavior is never silently ignored. It is emitted as `unsupported_effect` with `descriptor-only` policy in the machine report and Atlas.

- React/Vue: asset loading, CSS rendering, development HMR, and browser navigation.
- Next.js: React Server Component transport, server actions, routing, network fetch, and asset optimization.
- Nuxt: Nitro execution, hydration scheduling, routing, async data, server routes, and asset processing.

The synthetic framework adapters preserve only the reviewed state or render boundary. Full framework behavior remains covered separately by the existing React Component, Vue Component, Playwright Browser, Next.js SSR/hydration, and Nuxt SSR/hydration fixtures.

## Running

```sh
node scripts/test_external_web_dogfood.mjs
```

Generated artifacts are written under `protocol/out/external-web-dogfood/`:

- `summary.json`
- `atlas.json`
- `atlas.html`
- `atlas.svg`
- `atlas.dot`

The stable golden report is `protocol/fixtures/external-web-dogfood-result.json`. Source and manifest validation fail closed before exploration begins.
