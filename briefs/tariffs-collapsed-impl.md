# Implementation Brief — tariffs-collapsed

**Date:** 2026-11-25
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Type of change | Reason |
|---|---|---|
| `src/ui/tariffs.ts` | modification | `renderTariffs` builds a persistent `<details class="tariffs-toggle">` shell once (summary with an h2 'Tarifs appliqués' and a hint span, plus `div.tariffs-body`); only the body is rebuilt on each update, so the open state lives in the DOM and survives re-renders; hint text flips through `textContent` |
| `src/app.css` | modification | Summary styled as the card header with a CSS chevron, muted right-aligned hint, reduced-motion rule, existing `:focus-visible` outline |
| `specs/tempo-simulator.md`, `README.md` | modification | FR-030/AC-20: collapsed by default, click/Enter/Space, state kept across re-renders, nothing stored |

## Decisions made

- Native `<details>/<summary>` for accessibility without extra scripting; the whole card (title kept visible as an h2 inside the summary) collapses.
- Closed on every page load; the user's open/closed choice is kept in the DOM across updates (period, kVA, offers, shortcuts, new file); nothing stored (no localStorage/sessionStorage/cookies).
- Nested 'Grille complète' details keep their own state logic, scoped to the body.
- `scripts/check-tariffs.mjs` unchanged: the hint helper lives in `src/ui` (DOM-dependent, not in the test build); the browser smoke covers it.

## Model routing

Delegated general-purpose agent, inherited model, standard tier; actual model unknown; cost unknown; no costly exception; no failure trigger; bounds unchanged; fallback none.

## Quality Gates

- [x] Build: `npm run build` ✅ (dist = 5 files)
- [x] Tests: `npm test` ✅; `TEMPO_DEMO_DATA=1 npm test` ✅
- [x] Lint: `npm run lint` ✅
- [x] Focused: Chromium smoke (new `smoke-toggle`): hidden before load; closed by default; click/Enter/Space toggle; hint flips; focus stays on the summary; state survives kVA change, period shortcut and a second file; no storage; 4 requests; no console/CSP errors; no overflow at 390 px. Lead re-ran build/test/demo/lint and the smoke (fails 0) and read the closed-card screenshot.

## Points of attention for review

- Chevron rendering (a CSS-drawn corner) at small size in light and dark; contrast of the muted hint.
- Heading semantics: h2 inside a summary (assistive technologies announce summary content; check order h2 > h3).
- Persistence of state across re-renders when the card is re-created (no file → hidden → file loaded).
- Older smoke scripts that read `#tariffs` innerText now need a click first (not product code).

## Identified out-of-scope

- Persisting the open state across page loads (would need storage; forbidden by design).
- A 'Tout replier' control for the inner grids (deferred earlier).
