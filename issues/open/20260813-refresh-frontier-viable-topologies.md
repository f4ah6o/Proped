# Refresh frontier to seven viable unknown topologies

Status: open
Model: GPT-5.6 Sol
Created: 2026-08-13
Updated: 2026-08-13
Priority: P0
Depends-On: `20260813-frontier-score-generic-capability-loop.md`

## 目的

Frontier scoreをPropedのgeneric capability KPIとして意味のあるものにするため、upstream/pin lifecycle自体が不健全なtargetを、同等以上に未知性が高く、declared lifecycleが実行可能なpinned public projectへ置換する。

現在のcanonical `/tmp` runはraw auto-onboarding 3/7だが、viabilityはqualified 3 / failed 4であり、qualified targetだけではgeneric capability 3/3 = 100%だった。次のfrontierは7件すべてをProped capabilityの測定対象として成立させる。

## 置換対象

- SvelteKit: pinned dependency install failure
- Remix custom server: declared managed start unhealthy
- Remix SSR + DB: declared managed start unhealthy
- Yarn Berry PnP monorepo: declared workspace build failure

Astro、Lit Web Components、legacy React/Webpackはqualifiedなので維持する。

## Candidate qualification

候補はcorpusへ入れる前に、fresh checkout上で次を満たすこと。

1. exact revisionでclean checkoutできる。
2. lockfileに対応するdeclared/frozen dependency installが成功する。
3. declared buildがある場合は成功する。
4. local workspace dependencyがある場合は、そのdeclared build graphが成功する。
5. setupがREADME/package scriptで明示必須なら、credential-free/local-only構成で再現できるか判定する。
6. managed server targetはdeclared start/previewでloopback HTTP readinessに到達する。
7. project固有adapter LOCは0。
8. topology noveltyを弱めない。framework名よりcustom server / workspace / PnP / SSR+DB等のshapeを優先する。


## 進捗（2026-08-13）

### 採用済み replacement

1. **custom server**: `remix-run/react-router-templates` / `node-custom-server` / `b68be71489a22315c7a734a86a18347745b393d2`
   - fresh install/build/startが成立。
   - 当初はReact+Vite SPAへ誤推論していたためbrowser stageでstatic `dist`を探して失敗した。
   - React Router framework-mode + Express custom server signalをgeneric inferenceへ昇格し、campaign完走・deterministic replay=true・adapter LOC 0。
   - 旧`xHomu/remix-vite-node`を置換し、canonical frontierは3/7 -> 4/7へ改善。
2. **Yarn Berry PnP workspace**: `yarnpkg/berry` / `packages/docusaurus` / `57081c05a398f25c92df1dc78752f2053576cec0`
   - Yarn自身のPnP monorepo。immutable installは成功。
   - Propedがpackage graph cycleをbuild-order cycleとして誤判定したため、build scriptを持つworkspaceだけへbuild graphを縮約するgeneric fixを追加。真のbuild-script cycleは引き続きfail closed。
   - 修正後campaign完走・deterministic replay=true・adapter LOC 0。
3. **SSR + embedded DB**: `hsnice16/agent-friendly-code` / `70ca3d5f379c3ad8f8e9b4cc57f131ef8de3abc6`
   - Next.js server-rendered + committed SQLite (`better-sqlite3`) + Bun。credential/setupなしでinstall/build成立。
   - managed serverはbrowser lifecycleまで到達。Generic Browser stage timeoutが残るため、viabilityはqualifiedとして扱い、次のgeneric capability吸収対象とする。
   - 旧Remix+Prisma targetを置換し、required topology tagは`remix`から現行framework-modeを表す`react-router`へ更新。

### 不採用 / 保留 candidate

- `sveltejs/svelte.dev`: installは成立するが、project自身にNode範囲の選択根拠がなく、Node 22.14ではdependency engine不足、Node 25ではadapter buildが失敗するためqualification不可。
- `huntabyte/shadcn-svelte/docs`: dependencyが要求するNode engineをpackage manager failureから再交渉するgeneric runtime negotiationを実装して再qualification中。
- `epicweb-dev/epic-stack`: buildは成功するがdeclared start前にPrisma generate/setupが必要。`setup`がPlaywright install等まで含むため、任意setup script自動実行で隠さず不採用。

## 受け入れ条件

- [ ] 4 replacement candidateをpublic OSSから選定しexact revisionをpinする。
- [ ] candidate qualificationをmachine-readableに実行・記録する。
- [ ] frontier 7/7が`viability.status = qualified`になる。
- [ ] frontier全7件を再benchmarkする。
- [ ] generic capability failureがあればproject固有hackなしで1件ずつ吸収する。
- [ ] deterministic replay 100%を維持する。
- [ ] project-specific adapter LOC = 0を維持する。
- [ ] production external gateを弱めない。

## 成功状態

`frontierScore.viability.qualified = 7`になり、raw `autoOnboarded N/7`がそのままProped generic capabilityの進捗を表す。7/7到達後はproduction昇格し、さらに未知性の高いfrontierへ更新する。
