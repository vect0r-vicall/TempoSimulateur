# Implementation Brief — weather-visuals
**Mode:** fast  **Status:** COMPLETED
Replaced text glyphs by hand-made SVG icons (src/ui/icons.ts, kinds from core weatherIconKind), added min/max/mean temperature lines (blue/red/green, soft tokens light+dark) on the right axis with three legend entries, coloured tooltip tspans via tipRich (plain tip = concatenation, asserted). Spec FR-048..050, AC-37..42, CHECK-14 added first. Expectations changed in check-weather-scene/review/details (legend list, icon kinds). Icons shown when cell >= 12 units.
Gates: build, npm test, TEMPO_DEMO_DATA=1 npm test, lint all exit 0; smokes (mocked network) fails 0. PDF-backed run skipped (no TEMPO_PDF_DIR).
