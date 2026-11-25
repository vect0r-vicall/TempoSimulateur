# Implementation Brief — view-recap-temperature

**Date:** 2026-11-25
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `src/core/viewrecap.ts` | modification | `viewTemperatureSegments/Text(range, weather)` (aggregateTemps + tempTooltipSegments), `ViewRecap.tempText` / `tempSegs`, sentence appended to the aria summary |
| `src/ui/chart.ts` | modification | extra recap line under 'Consommation', coloured spans, hidden when the overlay is off |
| `src/app.css` | modification | `.view-recap-days .tt-mean/.tt-min/.tt-max` reuse the existing `--t-*-text` tokens (no new colour) |
| `scripts/check-viewrecap.mjs`, `specs/tempo-simulator.md` | modification | CHECK-8 additions; FR-063, AC-58 |

## Decisions made

- Location: the view recap card above the chart (month, year and custom-period views), not a new block.
- Coverage is computed against the viewed range (`a.period`), so a month or year only partly covered by the loaded weather shows `(N/M jours)`; no new request.

## Verification

`npm test` all checks passed; `npm run lint` clean.
