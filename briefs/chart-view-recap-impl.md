# Implementation Brief — chart-view-recap

**Date:** 2026-11-25
**Mode:** fast
**Status:** COMPLETED

> Retroactive record. This feature was implemented and committed (`f357225`) by a delegated general-purpose
> agent OUTSIDE the roster pipeline; this brief documents it so that review and QA run as proper phases.
> No behaviour was re-implemented for this record.

## Modified files

| File | Type of change | Reason |
|---|---|---|
| `src/core/viewrecap.ts` | addition | Pure helper `viewRecap(view, a, selected)`: title, per-offer rows (total or 'indisponible' + reason), cheapest badge (>= 2 offers compared), counts, aria summary; reuses `buildRecap` on the chart's own analysis |
| `src/ui/chart.ts` | modification | Renders a `section.view-recap` under the 'Vue :' title from the same analysis as the scene; visually hidden polite status line |
| `src/app.css` | modification | Compact `.view-offer` chips (wrap, light/dark) reusing badge/reason styles |
| `scripts/check-viewrecap.mjs` | addition | CHECK-8: each offer's view total equals the sum of its bars in the chart scene (period/year/month views); period total equals the main recap; titles, cheapest/ties/unavailable, counts |
| `scripts/run-checks.mjs` | modification | 'viewrecap' added to the explicit ORDER list |
| `specs/tempo-simulator.md` | modification | FR-031, AC-21, CHECK-8 |
| `README.md` | modification | One French line describing the recap block |

## Decisions made

- Helper signature is `viewRecap(view, a, selected)` (no `period` argument: `a` already is the analysis of the shown range).
- Month titles use French elision ("Total d'avril 2025", "Total d'août 2025", "Total d'octobre 2025").
- The card itself is not an aria-live region; only a small visually hidden status line is.

## Model routing

Delegated general-purpose agent, inherited model, standard tier; actual model unknown; cost unknown; no costly exception; no failure trigger; bounds unchanged; fallback none.

## Quality Gates

- [x] Build: `npm run build` ✅ (exit 0, dist = 5 files)
- [x] Tests: `npm test` ✅ all checks passed (incl. `check-viewrecap`); `TEMPO_DEMO_DATA=1 npm test` ✅
- [x] Lint: `npm run lint` (`tsc --noEmit`) ✅
- [x] Focused: Chromium smoke on the committed synthetic demo files (block totals = main recap by default; year = sum of months within 1 cent; Aller à / Retour; kVA 3 shows Tempo + HC/HP unavailable; no console/CSP/Trusted-Types errors; 4 static requests). Re-run by the lead's preflight: build/test/lint exit 0 on a clean tree at `f357225`.

## Points of attention for review

- `buildRecap` rounding: the year total equals the sum of its months only within 1 cent (per-day µEUR rounding vs displayed cents).
- Invariant check is mainly exercised on HC/HP, Base and Tempo-estimate data; Tempo-period days are covered by the demo-data browser smoke only.
- Accessibility of the new region and status line not tested with a real screen reader.
- Chart/recap consistency when the drilled view range is clipped to imported days.

## Identified out-of-scope

- Process: the feature skipped intake/plan/review/qa (recorded in the friction log).
- Round-commit rule satisfied: the work is committed (`git status` clean).
