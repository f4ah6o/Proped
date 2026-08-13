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
