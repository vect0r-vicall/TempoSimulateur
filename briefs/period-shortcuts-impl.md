# Implementation Brief — period-shortcuts

**Date:** 2026-11-25
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Type of change | Reason |
|---|---|---|
| `src/core/period.ts` | modification | Pure, no-DOM, no-clock: `shortcutPeriods(days)` (whole / 365 days / 730 days ending on the last priced day, clamped to the first priced day), `pressedShortcuts`, French clamp message |
| `src/ui/controls.ts` | modification | Labelled group of three native buttons in the Période fieldset (disabled until a file is loaded, aria-pressed, titles) |
| `src/main.ts` | modification | One `applyPeriod(start, end, notice)` shared by date inputs and shortcuts; pressed state recomputed on every update |
| `src/app.css` | modification | Wrapping row, pressed and disabled styles (light/dark, existing focus ring) |
| `scripts/check-shortcuts.mjs`, `scripts/run-checks.mjs` | addition / modification | CHECK-9: synthetic multi-year data (boundary day, gap), clamping, 730-day window, null case, TZ independence; exact demo-data block under TEMPO_DEMO_DATA |
| `specs/tempo-simulator.md`, `README.md` | modification | FR-032, AC-23, CHECK-9; one French line |

## Decisions made

- 'Dernière année' = 365 days ending on the last priced day, identical to the default period (spec FR-011); the button title says it spans up to 13 calendar months in the month chart. '2 dernières années' = 730 days. 'Toute la période importée' = the full priced range.
- A window longer than the data is clamped (not an error) with a French message "Les données importées ne couvrent que N jours".
- Clamp message comes from `shortcutMessage` because `resolvePeriod` receives already clamped dates.
- AC numbering: AC-23 leaves a gap after AC-21 (no AC-22 exists); not renumbered.

## Model routing

Delegated general-purpose agent, inherited model, standard tier; actual model unknown; cost unknown; no costly exception; no failure trigger; bounds unchanged; fallback none.

## Quality Gates

- [x] Build: `npm run build` ✅ (dist = 5 files)
- [x] Tests: `npm test` ✅ (911 ok lines); `TEMPO_DEMO_DATA=1 npm test` ✅
- [x] Lint: `npm run lint` ✅
- [x] Focused: `node scripts/check-shortcuts.mjs` ✅ (re-runs itself under three time zones)
- [x] Chromium smoke on the synthetic demo files (and a short 8-month dataset): disabled before load; each shortcut sets both dates, recap title, tariffs sections, resets the chart view; aria-pressed exact; manual edit unpresses; clamp message; 4 requests; no console/CSP/Trusted-Types errors. Lead re-ran build/test/demo/lint and read the desktop screenshot.

## Points of attention for review

- `aria-pressed` correctness when two shortcuts give the same window (short data) and after manual edits.
- Period arithmetic around month ends and leap years (365 vs 730 days), TZ independence.
- Interaction with the chart drill-down reset and the tariffs block on period change.
- Gap in AC numbering (AC-22).

## Identified out-of-scope

- No "13 calendar months" shortcut (the spec's default is 365 days).
- No persistence of the chosen shortcut across loads (nothing is stored by design).
