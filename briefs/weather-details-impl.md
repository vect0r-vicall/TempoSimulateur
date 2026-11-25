# Implementation Brief — weather-details

**Mode:** fast  **Status:** COMPLETED

## Modified files
| File | Change | Reason |
|---|---|---|
| specs/tempo-simulator.md, kb/spec.md, kb/properties.md, README.md | amend | FR-034/035 daily list; FR-041..047, AC-30..36, CHECK-13 |
| src/core/weather.ts | modify | validation of weather_code / wind mean / direction; labels, glyphs, compass, wind aggregation (circular, speed-weighted) |
| src/net/weather.ts | modify | three variables appended to the daily query only |
| src/core/scene.ts, src/ui/svg.ts, src/ui/chart.ts, src/ui/weather.ts, src/app.css | modify | tooltip lines (Météo day view, Vent all views), glyph row in day view, legend note |
| scripts/check-weather-details.mjs, run-checks.mjs, check-weather.mjs, check-weather-scene.mjs | add/modify | CHECK-13; two expectations updated (exact URL, +1 tooltip line) |

## Decisions made
- Glyphs only when a day cell is >= 14 viewBox units wide (365-day view shows none; tooltips still carry everything).
- BMP glyphs only (no emoji); label words always in tooltip.
- Wind: mean speed + direction only; direction = speed-weighted circular mean.

## Quality Gates (lead re-run)
build 0, npm test 0, TEMPO_DEMO_DATA=1 npm test 0, lint 0; two Chromium smokes (mocked network) fails 0. PDF-backed run skipped (no TEMPO_PDF_DIR; no price data touched).

## Points of attention for review
Validation of new arrays, tooltip fit with 8 lines, glyph layout, wind aggregation edge cases, no new request path.
