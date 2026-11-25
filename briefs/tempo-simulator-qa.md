# QA Brief — tempo-simulator

**Date:** 2026-11-25
**Status:** GO ✅
**Round:** 1 (qualifying 0/5)

## Round state

Fresh cycle, round 1, no NO-GO causes. (qa-state persisted by hand: the QA convergence gate script is not installed in this project.)

## Quality Gates

| Gate | Command | Result | Duration |
|---|---|---|---|
| Build | `npm run build` | ✅ PASS (dist: index.html, app.js, app.css, favicon.svg, _headers) | 0.1s |
| Tests | `npm test` (CHECK-1..6, 249 `ok:` assertions) | ✅ all checks passed | 0.5s |
| Lint | `npm run lint` (`tsc --noEmit`, TypeScript 7) | ✅ PASS; non-vacuity proven: a deliberately ill-typed probe file made `tsc` exit 1 | 0.1s |

## Spec runnable checks (specs/tempo-simulator.md)

| Check | Command | Result |
|---|---|---|
| CHECK-1 | `node scripts/check-import.mjs` | ✅ PASS (incl. opt-in demo-data check, TEMPO_DEMO_DATA=1) |
| CHECK-2 | `node scripts/check-pricing.mjs` | ✅ PASS (incl. opt-in demo-data check, TEMPO_DEMO_DATA=1) |
| CHECK-3 | `node scripts/check-chart.mjs` | ✅ PASS (13 month groups × 3 bars, day disabled > 400 days) |
| CHECK-4 | `node scripts/check-forbidden-apis.mjs` | ✅ PASS (every pattern self-tested against a hostile sample) |
| CHECK-5 | `node scripts/check-dist.mjs` | ✅ PASS |
| CHECK-6 | `node scripts/check-data-prices.mjs`, `node scripts/check-data-calendar.mjs` | ✅ PASS (9/9 grids independently re-parsed from PDFs; calendar 300/43/22 per complete season; counter cross-check passed, opt-in demo data) |

## Manual / real-browser scenario (qa-scope)

Chromium (playwright-core in the scratchpad, outside the project), `dist/` served with the real CSP + hostile CSV: recap totals identical to the engine, kVA 9 inferred from the peak-power file, Année/Mois/Jour views render, 4 static requests only, 0 console/CSP/Trusted-Types errors, hostile `<img onerror>` CSV not executed. Day-view legibility defect found and fixed during implementation.

## Code-intel gate

Skipped (no code-intel resolver or `code-intel` block in this project).

## Cross-runtime QA

Skipped: xruntime scripts not installed; `opencode` is on PATH but sending the project code to another model service is not authorised.

## NO-GO issues

None.

## Verdict

**GO** — ready for `/roster-ship`. Open caveats (non-blocking): review/QA mechanical tooling was absent (degraded, recorded); no commit exists yet in the repo; pre-2025 Tempo cost is an estimate by design; the Tempo calendar's 2026-2027 season is partial (regenerate with `node scripts/gen-calendar.mjs` as it fills in).
