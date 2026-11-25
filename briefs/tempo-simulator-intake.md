# Intake Brief — tempo-simulator

**Date:** 2026-11-25
**Status: VALIDATED**
**Type:** feature
**Trust boundary:** no  <!-- keyword heuristic did not fire; note: the only untrusted input is the user's own local CSV, handled by KB properties P1-P4 -->

## Goal

TempoSimulateur is a static web page, fully computed in the browser, that takes the user's EDF index export (CSV) and prices their actual consumption under the three EDF "Tarif Bleu" offers: Tempo, Heures Creuses/Heures Pleines (HC/HP) and Base. It uses hardcoded historical EDF price grids (2022-02 to 2026-08) and a hardcoded Tempo day-colour calendar (from 2022). The user picks a period (default: last 12 months), a subscribed power (kVA) and which offers to compare. A bar chart by year/month/day shows each selected offer's cost side by side. Bars reflect the Tempo day colour and the HC/HP ratio. A period recap sums the cost of each selected offer so the best offer is obvious. The UI is French, code is English, no data leaves the browser, and the hosting server can be neither contacted nor fed data by the page.

## Scope Boundary

OUT of scope:
- Any server-side component, analytics, cookies, localStorage/IndexedDB, or network request after page load.
- Tempo colours / prices before 2022 (older Tempo data is disabled).
- Other suppliers/offers than EDF Tarif Bleu Base, HC/HP, Tempo; surcharges (autoproducteur, non-Linky) and Linky load-curve (30-min) files.
- Other CSV exports except the optional peak-power file used only to pre-fill kVA (daily, monthly and 30-min files are ignored).
- Live fetching of colours or prices; forecasting future Tempo colours.
- Exhaustive tests (non-critical software): only parser, pricing engine, aggregation.

## Relevant Files

Greenfield: no code exists. Inputs only.

| File | Role | Key snippet |
|---|---|---|
| `<DATA_DIR>/mes-index-elec-<PDL>.csv` | Import template (not committed; `*.csv` gitignored) | `DD/MM/YYYY;Index transmis par le distributeur;;;<idx>;<idx>;<idx>;<idx>;<idx>;<idx>` (synthetic shape) |
| `<PDF_DIR>/tarifs-YYYYMMDD.pdf` (9) | Source of hardcoded prices | Tempo 6kVA 2026-02: `15,59 13,25 16,12 14,99 18,71 15,75 70,60` |
| `kb/spec.md`, `kb/properties.md`, `kb/risks.md` | Project constraints (P1-P6, R1-R4) | |
| `roster/tempo-simulator/research.md` | Verified format facts | CSV: Latin-1, `;`, 3 preamble lines, header line 4, newest first |

## Architecture Notes

Decisions made at intake (all from KB/research/user answers; none left to the implementers):
- **Stack:** TypeScript + esbuild, zero runtime dependencies, output `dist/{index.html,app.js,app.css}`; Vitest for light tests.
- **CSV:** read via `File`/`arrayBuffer`, decode Latin-1, `;`, skip preamble up to the header, cap size/rows. Rows are cumulative indexes; convert to daily kWh per bucket by differencing consecutive days. Missing days can occur: the delta across a gap is spread evenly over the gap days. Reject decreasing indexes with a French error naming the line.
- **Two eras in one file:** an older contract period has plain HP/HC columns; the later Tempo period has the 6 Tempo columns. Base = total kWh. HC/HP = HP and HC totals (Tempo-era HP/HC = sum of the three colours' HP / HC). Tempo-era Tempo cost uses the meter's real colour counters. HC/HP-period Tempo cost applies the embedded calendar colour of the day to that day's HC/HP kWh (approximation, flagged in the UI).
- **HC/HP hours:** HC 22:00-06:00, HP 06:00-22:00 (EDF), no other data in the file; the HC/HP offer reuses the file's HC/HP buckets.
- **Prices:** hardcoded table per grid effective date (9 grids), kWh prices and monthly subscription per kVA, in integer hundredths-of-cent. Subscription accrues per day (monthly fee / days in month). A day uses the latest grid with effective date <= that day. kVA is a manual selector, pre-filled by inference when possible: the index file has no power data, so the page also accepts the OPTIONAL `ma-puissance-max-*.csv` export (same Latin-1/`;` format, daily/monthly/annual peak VA) dropped alongside it, and pre-selects the smallest standard subscription (3,6,9,12,15,18,24,30,36) >= the highest peak VA (a lower bound only; the UI says so). Without that file the default is 6 kVA and the user must check it. Unavailable (offer, kVA, grid) combinations are shown as unavailable, not zero.
- **Tempo calendar:** static `src/data/tempo-calendar.json` produced once by a script from `api-couleur-tempo.fr` (single relay, no stated licence; the research cross-checked no second source), verified against index-derived colours (Tempo era) and the 300/43/22 season counts; attribution "RTE, via api-couleur-tempo.fr" in the footer.
- **Chart:** hand-written SVG; granularity year/month/day; per bucket one bar per selected offer; Tempo bar segmented by day colour (blue/white/red), HC/HP ratio shown as segmentation of each bar; recap panel with totals and the cheapest offer highlighted.
- **Hardening:** strict CSP via `<meta>` plus a sample headers file (frame-ancestors etc. need real headers): `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`, no `connect-src`. SVG styled with presentation attributes or CSSOM only; DOM built with `textContent`; no inline script/style.

## Quality Gates

No gate is documented yet (greenfield). Proposed, to be created by the implementation:
```bash
# Build
npm run build
# Tests
npm test
# Lint/Format
npm run lint   # tsc --noEmit (no extra linter dependency)
```

## Open Questions

(none; recorded assumptions: kVA inferred from the optional peak-power file as a lower bound, editable by hand; pre-2025 Tempo cost approximated from the calendar colour of the calendar date)
