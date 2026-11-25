# QA Brief — tariffs-collapsed

**Date:** 2026-11-25
**Status:** GO ✅
**Round:** 1 (qualifying 0/5)

## Round state

Fresh cycle, round 1, no NO-GO causes. The QA state file was written by hand: `scripts/check-qa-convergence.cjs` and the round-lifecycle script are not installed in this project.

## Quality Gates

| Gate | Command | Result | Duration |
|---|---|---|---|
| Build | `npm run build` | ✅ PASS (dist = index.html, app.js, app.css, favicon.svg, _headers) | 0.1s |
| Tests | `npm test` | ✅ all checks passed (914 `ok` lines) | 0.6s |
| Tests (demo data) | `TEMPO_DEMO_DATA=1 npm test` | ✅ all checks passed (74 `ok: demo` lines) | 0.6s |
| Tests (PDF-backed) | `TEMPO_PDF_DIR=<folder of the nine PDFs> npm test` | ✅ all checks passed; 'independent PDF re-parse: 9/9 grids compared' | 0.6s |
| Lint | `npm run lint` (`tsc --noEmit`) | ✅ PASS | 0.1s |

## Tests: detail

- New: assertions of the pure toggle hint texts ('Cliquer pour afficher' / 'Cliquer pour masquer') in CHECK-7 (`scripts/check-tariffs.mjs`), added in the review fix-first pass (helper moved to `src/core/tariffs.ts`).
- Regression detected: NO.

## Spec runnable checks (specs/tempo-simulator.md)

Every check script run individually, exit 0: check-import, check-pricing, check-chart, check-viewrecap, check-tariffs, check-shortcuts, check-forbidden-apis, check-dist, check-data-prices, check-data-calendar.

## Browser scenarios (Chromium, committed synthetic demo files, `dist/` served statically)

- Disclosure (AC-20 manual smoke): fails 0 — card hidden before load; collapsed by default (content in the DOM but not visible); click, Enter and Space toggle it; the hint flips; focus stays on the summary; the open state survives a kVA change, a period shortcut and a second file; nothing stored (localStorage/sessionStorage/cookies empty); no '.pdf'/'fichier' text; no horizontal overflow at 390 px; no console, CSP or Trusted-Types errors; only the 4 static requests.
- Regression of earlier features: period shortcuts scenario fails 0; chart drill-down ('Aller à') scenario no console errors.

## Code-intel gate

Skipped (no code-intel resolver or `code-intel` block in this project).

## Cross-runtime QA

Skipped: `scripts/xruntime-exec.sh` / `xruntime-review.cjs` not installed (QA light bundle check fails, recorded as degraded). `opencode` is on PATH, but sending the project to another model service is not authorised.

## NO-GO issues

None.

## Verdict

**GO** — ready for `/roster-ship`. Caveats (non-blocking): review and QA ran without the roster mechanical tooling (degraded, one reviewer for this small diff); the disclosure smoke is manual (not part of `npm test`, stated in AC-20); deferred INFO: focus inside a nested grid summary is lost on re-render (pre-existing); no remote exists, so shipping means local commits only.
