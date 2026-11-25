# TempoSimulateur — Spec (KB)

## Goal
Static, fully client-side page comparing EDF Tempo, Heures Creuses/Heures Pleines and Base on a user's EDF index export.

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

## Core (70/30)
CSV import, pricing engine, period selector, monthly chart, recap. Then year/day views, colour/ratio overlays, polish.
