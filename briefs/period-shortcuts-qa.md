# QA Brief — period-shortcuts

**Date:** 2026-11-25
**Status:** GO ✅
**Round:** 1 (qualifying 0/5)

## Round state

Fresh cycle, round 1, no NO-GO causes. The QA state file was written by hand: `scripts/check-qa-convergence.cjs` and the round-lifecycle script are not installed in this project.

## Quality Gates

| Gate | Command | Result | Duration |
|---|---|---|---|
| Build | `npm run build` | ✅ PASS (dist = index.html, app.js, app.css, favicon.svg, _headers) | 0.1s |
| Tests | `npm test` | ✅ all checks passed (912 `ok` lines) | 0.5s |
| Tests (demo data) | `TEMPO_DEMO_DATA=1 npm test` | ✅ all checks passed (74 `ok: demo` lines) | 0.6s |
| Tests (PDF-backed) | `TEMPO_PDF_DIR=<folder of the nine PDFs> npm test` | ✅ all checks passed; 'independent PDF re-parse: 9/9 grids compared' | 0.6s |
| Lint | `npm run lint` (`tsc --noEmit`) | ✅ PASS | 0.1s |

## Tests: detail

- New: `scripts/check-shortcuts.mjs` (CHECK-9): synthetic multi-year data with a boundary day and a gap, clamping at 245/365/729/730 days, null case, TZ independence (three time zones), exact demo-data block, and the singular message added in the review fix-first pass.
- Regression detected: NO.

## Spec runnable checks (specs/tempo-simulator.md)

Every check script run individually, exit 0: check-import, check-pricing, check-chart, check-viewrecap, check-tariffs, check-shortcuts, check-forbidden-apis, check-dist, check-data-prices, check-data-calendar.

## Browser scenario (Chromium, committed synthetic demo files + a short synthetic dataset, `dist/` served statically; light, dark, 390px)

fails 0: buttons disabled before load; each shortcut sets both date inputs, the recap title, the tariffs sections and returns the chart to the period view; aria-pressed exactly on the matching button(s); a manual date edit unpresses all; Enter works; the short 8-month dataset presses all three and shows the French clamp message ('ne couvrent que 245 jours'); no console, CSP or Trusted-Types errors; only the 4 static requests per page load.

## Code-intel gate

Skipped (no code-intel resolver or `code-intel` block in this project).

## Cross-runtime QA

Skipped: `scripts/xruntime-exec.sh` / `xruntime-review.cjs` not installed (QA light bundle check fails, recorded as degraded). `opencode` is on PATH, but sending the project to another model service is not authorised.

## NO-GO issues

None.

## Verdict

**GO** — ready for `/roster-ship`. Caveats (non-blocking): review and QA ran without the roster mechanical tooling (degraded, recorded); deferred LOW/INFO review findings (tooltip as the only explanation of the 13-calendar-month remark; 365-day window computed in two places; pre-existing createElement-pattern gap in the forbidden-API scan); no remote exists, so shipping means local commits only.
