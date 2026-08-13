# Novelty-weighted external Web frontier corpus

Status: closed
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P1

## 目的

external Web corpusをtarget数ではなくproject topologyの未知性で増やす。React/Vite類似targetの追加より、Propedの既存推論・bootstrap・server lifecycleがまだ十分に前提化していないshapeを独立corpusへ投入し、production regression gateを弱めずに未対応領域を継続観測できるようにする。

## Scope

- passing `external` production corpusとは別に`frontier` corpusを追加する。
- SvelteKit、Astro、Remix、Web Components、legacy Webpack、monorepo、custom server、SSR+DB、PnPを実OSSのfull commit SHAでpinする。
- project-specific executable adapter LOCは0を維持する。
- frontierではsuccess-rateをproduction品質基準にせず、repository breadthとnovelty tag coverageをstructural gateにする。
- unknown-Web inspectorへSvelteKit / Astro / Remix / Lit Web Componentsのfirst-class family認識を追加する。
- `.svelte` / `.astro`をbounded source scanへ含める。
- Yarn PnP markerをinspection evidenceとして明示する。

## 受け入れ条件

- [x] frontier target count = 7。
- [x] distinct repository count = 7。
- [x] adapter LOC = 0。
- [x] required novelty tagsに`sveltekit` / `astro` / `remix` / `web-components` / `legacy-webpack` / `monorepo` / `custom-server` / `ssr-db` / `pnp`を含める。
- [x] `frontier` / `novelty` aliasでcorpusをresolveできる。
- [x] SvelteKit / Astro / Remix / Lit Web ComponentsをReact/Viteの副分類ではなく独立familyとしてinspectできる。
- [x] Yarn PnP install modeをread-only inspectionで認識できる。
- [x] production `external` gateは変更しない。
- [x] README / README.ja.md / CHANGESを更新する。

## Resolution

- `protocol/fixtures/external-frontier-corpus.json`を追加し、7 repositoryをtopology noveltyで固定した。
- SvelteKit RealWorld、Astroship、Remix custom Express server、Remix + Prisma SSR/DB、Lit Web Components、Yarn Berry PnP monorepo Web workspace、TodoMVC legacy Webpackを投入した。
- frontier gateはauto-onboarding失敗を許容しつつ、7 repository、9 novelty tag、adapter LOC 0を要求するため、未知shapeをproduction regressionとは別軸で計測できる。
- inspectorはSvelteKit / Astro / Remix / Lit、`.svelte` / `.astro`、PnP install modeをread-only evidenceから認識する。
