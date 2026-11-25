# TempoSimulateur — Spec (KB)

## Goal
Static, fully client-side page (no network unless the user opts in to the weather overlay, see specs/tempo-simulator.md FR-018/FR-021/FR-033..) comparing EDF Tempo, Heures Creuses/Heures Pleines and Base on a user's EDF index export.

## Input
`mes-index-elec-*.csv`: semicolon-separated, Latin-1, one title line first. Daily cumulative indexes (kWh).
- Later contract periods: 6 Tempo columns (Bleu/Blanc/Rouge x HC/HP).
- Before: plain HP/HC columns only.
Daily consumption = difference of consecutive indexes per bucket; handle resets/rollover.

## Day colour
Embedded public Tempo calendar from 2022 (data before 2022 disabled), cross-checked against index-derived colours.

## Offers
Hardcoded prices per grid date (2022-02 .. 2026-08, from /grilles PDFs), per subscribed kVA (selector): subscription + kWh prices.
Tempo, HC/HP, Base. HC/HP and Base use the total/HC-HP split of the same data.

## UI (French; code in English)
Period selector (default last 12 months), offer checkboxes, bar chart by year/month/day with offers side by side,
bar colour reflects Tempo day colour and HC/HP ratio, period recap summing selected offers.

## Weather overlay (opt-in)
Optional outdoor-temperature overlay from Open-Meteo (place search, daily archive), shown as coloured tooltip lines, smoothed mean/min/max temperature lines (green/blue/red) and a right-hand degC axis, plus the daily weather hint (WMO code: tooltip line and day-view SVG icon) and wind (mean speed and direction only, no gusts) in the tooltips (FR-041..FR-050). Never requested before explicit user action; fetch confined to src/net/weather.ts; pure logic in src/core/weather.ts.

## Core (70/30)
CSV import, pricing engine, period selector, monthly chart, recap. Then year/day views, colour/ratio overlays, polish.
