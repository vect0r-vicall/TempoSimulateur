# Implementation Brief — podium-ranking

**Date:** 2026-11-26
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `src/core/podium.ts` | addition | Pure ranking of the available offers (cent-rounded totals: ranks, ties, gaps) and the savings sentence ('tarif de base' wording, 'environ' when estimated) |
| `src/core/recap.ts`, `src/core/viewrecap.ts` | modification | `podium` on the recap and the view recap; the sentence joins the aria summary |
| `src/ui/podium.ts`, `src/ui/recap.ts`, `src/ui/chart.ts` | addition / modification | Ordered list in ranking order, CSS places 2nd, 1st, 3rd; full size in the main recap, compact above the chart; only unavailable offers stay in the flat list |
| `src/app.css` | modification | Podium and steps (theme tokens only), narrow rules for 520 px and 360 px, compact variant |
| `scripts/check-podium.mjs`, `specs/tempo-simulator.md`, `README.md`, `docs/screenshot-*.png` | addition / modification | CHECK-19, FR-067, FR-068, AC-60; README bullet and screenshots show the podium |

## Decisions made

- Gaps are the difference of the DISPLAYED (cent-rounded) totals, so the sentence equals what a reader computes from the figures on screen.
- DOM stays in ranking order for screen readers; the visual 2nd-1st-3rd order is CSS only (nothing focusable inside).
- The Base offer is 'tarif de base' only in the new podium wording; other labels of the app are unchanged.

## Verification

`npm test` (both modes), `npm run lint`, `check-spdx` pass; no overflow at 320, 360, 390 and 1200 px (probe), light and dark.
