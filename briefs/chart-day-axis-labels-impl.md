# chart-day-axis-labels — implementation (express)

Mode: express. Status: COMPLETED.

Request: in the day view, day numbers must appear at the bottom of the chart without overlap (previously only month names at the 1st).

Change (src/core/scene.ts, src/ui/svg.ts): day view axis now has two rows. Row 1: day numbers, aligned on the 1st of each month and thinned by column width (`dayLabelStep`), skipping a number that would crowd the next month's 1st. Row 2: month caption (with year at the view start or when the year changes) under the 1st, and under the first column when there is room; captions are skipped when they would touch the previous one (width estimated from text length). Axis text is now centred on the column for all granularities.

Tests: scripts/check-chart.mjs, day scenes of 14/30/90/200/400 days at widths 1200/960/520 (numbers >= 20 units apart, captions never touching, start of view captioned when there is room, only plain day numbers). Chromium screenshots of a year of days (1280 and 560 wide) and a drilled month: no overlap.

Gates: build, npm test, TEMPO_DEMO_DATA=1 npm test, lint exit 0. Review: lead only (assurance local; recorded skip).
