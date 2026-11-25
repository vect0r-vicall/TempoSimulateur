# Implementation Brief — weather-precipitation

**Date:** 2026-11-25
**Mode:** express
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `src/core/weather.ts` | modification | `precipMm` on `DailyTemp`, strict `precipitation_sum` validation (0..2000 mm, else null), `aggregatePrecip`, `formatPrecip`, `precipSegments`, `RAIN_CODES`, `displayCode` (liquid codes need a known sum > 1 mm, else 'Couvert') |
| `src/net/weather.ts` | modification | `precipitation_sum` appended to the archive `daily` list (same origin, CSP unchanged) |
| `src/core/scene.ts` | modification | Day label/icon use `displayCode`; every tooltip and aria ends with the precipitation line |
| `src/ui/svg.ts` | comment | longest tooltip is now 9 lines (MAX_TIP_LINES already 9) |
| `scripts/check-*.mjs`, `specs/tempo-simulator.md` | modification | existing checks moved to the new line layout; new precipitation block in CHECK-13; FR-062, AC-57 |

## Decisions made

- Rainy = liquid code (51/53/55/61/63/65/80/81/82) AND known daily sum strictly above 1 mm; otherwise 'Couvert' (code 3, cloud icon). Unknown sum keeps the provider code; freezing, snow, fog and storm codes are never changed.
- Month/year tooltips show the sum over the bucket with the `(N/M jours)` convention; no icon outside the day view.

## Verification

`npm test` all checks passed; `npm run lint` (tsc) clean.
