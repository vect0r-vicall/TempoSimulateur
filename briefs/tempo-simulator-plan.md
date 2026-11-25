# Plan — tempo-simulator

**Date:** 2026-11-25
**Status: VALIDATED**

## Sequential steps

1. **S0 Skeleton and hardening rails** — `package.json` (Node>=20; devDeps: typescript, esbuild only), `tsconfig.json`, `build.mjs` (esbuild classic script, no sourcemap), `src/index.html` (meta CSP first, French `noscript`, `<link rel=icon href=favicon.svg>`), `src/main.ts`, `src/app.css`, `favicon.svg`, `dist/_headers`, `nginx.conf.snippet`, `scripts/check-dist.mjs` (CHECK-5), `scripts/check-forbidden-apis.mjs` (CHECK-4, comment-stripped, bundle + src), `scripts/run-checks.mjs`. Done: `npm run build` emits exactly the 5 dist files; CHECK-4/5 pass; page loads with no CSP violation.
2. **S1 Import slice (US-1)** — `src/core/{csv,periods,days}.ts`, `src/ui/dropzone.ts`, `scripts/gen-fixtures.mjs`, `scripts/check-import.mjs` (CHECK-1). UTF-8-then-Latin-1 decode, caps, header folding, physical line numbers, contract periods by non-empty column group, D→D+1 differencing, largest-remainder gap spread (6 estimated days in the sample shape), boundary day excluded. Done: CHECK-1 passes on synthetic fixtures (two periods, 3 gaps, boundary, decreasing index, duplicate date, NUL, >5 MB, `<img onerror>` cell); UI lists detected periods and priced/estimated/excluded day counts as text.
3. **S2 Price data (parallel to S1)** — `scripts/gen-prices.mjs` (pdftotext-based, dev-only), `src/data/grids.ts` (integer µEUR), `scripts/check-data.mjs` part A (CHECK-6): sanity validator (blue<white<red, HC<HP, subscription grows with kVA, rows complete) + optional independent PDF re-parse when PDFs exist + 2026-08 Tempo prices vs api-couleur-tempo `/api/tarifs` (recorded as constants, no runtime fetch) + spot values from the research. Done: validator passes; spot values equal.
4. **S3 Base and HC/HP pricing, period, recap (needs S1,S2)** — `src/core/{pricing,period,recap}.ts`, `src/ui/{controls,recap}.ts`, `scripts/check-pricing.mjs` (CHECK-2 part). Done: AC-3 (Base, HC/HP; grids 20260201/20260801; 9 kVA) matches to the µEUR; unavailable offers excluded from sum and cheapest; default period = 365 days ending on last priced day.
5. **S4 Tempo calendar (parallel to S3)** — `scripts/gen-calendar.mjs` (one-shot, network, dev-only, not in build), `src/data/tempo-calendar.ts`, CHECK-6 part B. Done: 300/43/22 per complete season; counter cross-check against the committed demo CSV (opt-in, TEMPO_DEMO_DATA=1; skipped otherwise).
6. **S5 Tempo pricing + assumptions box (needs S3,S4)** — Tempo branch in `pricing.ts` (counters in Tempo periods, calendar in HC/HP periods, unknown colour ⇒ Tempo unavailable), `src/ui/assumptions.ts`, estimate notice. Done: AC-5, AC-6, AC-14 in CHECK-2.
7. **S6 Peak-power file (needs S1,S3)** — `src/core/peak.ts`, fixtures; CHECK-1/2 extended (AC-7, EC-16/17/25). Done: 8200 VA ⇒ 9 kVA (synthetic), order-free drop, replace on second file.
8. **S7 Chart (needs S5)** — `src/core/scene.ts` (pure scene: groups, stacked bars by colour then HC/HP, ratio strips, labels), `src/ui/{svg,chart}.ts` (scene→DOM via `createElementNS`, presentation attributes only), `scripts/check-chart.mjs` (CHECK-3). Done: AC-8 (13 groups × 3 bars) and AC-9.
9. **S8 Closing pass** — noscript, a11y (group tab stops, one summary in day view), polish (French copy, drop zone, fancy but light), README deploy note, manual browser smoke with a fixture and with the demo CSVs, network blocked. Done: `npm run build && npm test && npm run lint` green; smoke OK.

## Dependencies

S0 first (every slice must keep the CSP/no-API rails). S1 and S2 parallel; S3 needs both; S4 parallel to S3; S5 needs S3+S4; S6 needs S1+S3; S7 needs S5; S8 last. The two highest-risk steps are S2 (price data transcription, silent numerical errors) and S7 (stacked SVG chart, largest UI effort).

## Duration forecast

| Mission | Optimistic / likely / pessimistic minutes | Basis and evidence | Assumptions / dependencies |
|---|---|---|---|
| S0 | 15 / 30 / 60 | Boilerplate, no prior build evidence | Node>=20 present |
| S1 | 30 / 60 / 120 | Parsing + gap logic, many edge cases | Fixtures synthetic |
| S2 | 30 / 60 / 150 | PDF layouts differ by grid | pdftotext available (checked) |
| S3 | 25 / 50 / 100 | Pure logic | S1,S2 done |
| S4 | 15 / 30 / 60 | One API fetch | Network for the one-shot script |
| S5 | 20 / 40 / 80 | Branching on period type | S3,S4 done |
| S6 | 15 / 30 / 60 | Small | |
| S7 | 45 / 90 / 180 | Largest UI slice | |
| S8 | 20 / 40 / 90 | Polish + manual smoke | Browser available |
| Global verification | unknown | | Separate from step DoD |

## Model routing

| Mission / role | Runtime; requested model / tier | Native control and evidence | Selection reason; cost/uncertainty; costly exception | Actual model | Failure trigger; existing bounds; authorized fallback |
|---|---|---|---|---|---|
| S0-S6, S8 implement | Claude Code; inherited / standard | Agent model parameter observed | Mechanical TS; none | unknown | Repeated red check after diagnosis; improve-loop budget; none |
| S2, S7 implement | Claude Code; inherited / standard | same | Numerical and UI care; none | unknown | same |
| Review / QA | Claude Code; fresh agent / standard | same | Independence required | unknown | none |

## Identified risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Wrong numbers in the price table (digit transposition) | M | H | Sanity validator + independent re-parse + spot values + api cross-check of 2026-08 |
| Calendar single unlicensed source; HC/HP-period colours validated only by counts | M | M | 300/43/22 + counter cross-check on Tempo era; estimate flagged in UI |
| Tooling friction (TS imported by .mjs checks; Vitest dropped) | H | L | Bundle sources with esbuild into `.build-test/` before checks |
| CSP: `style` attributes blocked | H | M | SVG presentation attributes only; manual browser smoke in S8 |
| Forbidden-API scan false positives | M | L | Strip comments; scan src and bundle |
| Meter replacement refuses file | L | M | Clear French error; documented limitation |
| Self-referential references (author's rules vs author's tests) | M | M | Demo-data optional assertions; daily-export cross-check (opt-in demo-data check) |

## Decisions made

| Point | Decision | Reason |
|---|---|---|
| Test runner | Plain Node check scripts, no Vitest | Zero test deps; user wants light testing |
| Boundary day | Excluded entirely (energy and subscription) | Period label honest; user's own daily export also skips it |
| Fixtures | Synthetic, generated; committed synthetic demo CSVs (tests/demo-data, opt-in) | no personal CSV committed |
| Base-only files | Not supported | No Base column exists in the EDF export |
| Mixed-colour bars | Split by colour then HC/HP | One rule for all granularities |
| Calendar past its end | Tempo unavailable on unknown-colour days (runtime) | Not a build failure |
| Encoding | strict UTF-8 else Latin-1 | BOM/other exports |
| Bundle | classic non-module script, no sourcemaps | `file://`-safe, exactly 5 dist files |

## Assumptions

Node>=20; page served over http(s); pdftotext present for the dev-only price script; synthetic fixtures are acceptable proof; the peak-power header contains `Puissance max` (verified in the research sample).
