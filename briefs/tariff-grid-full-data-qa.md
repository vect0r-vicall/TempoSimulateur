# QA Brief — tariff-grid-full-data

**Date:** 2026-11-25
**Status:** GO ✅
**Round:** 1 (qualifying 0/5)

## Round state

Fresh cycle, round 1, no NO-GO causes. The QA state file was written by hand: `scripts/check-qa-convergence.cjs` and the round-lifecycle script are not installed in this project.

## Quality Gates

| Gate | Command | Result | Duration |
|---|---|---|---|
| Build | `npm run build` | ✅ PASS (dist = index.html, app.js, app.css, favicon.svg, _headers) | 0.1s |
| Tests | `npm test` | ✅ all checks passed (866 `ok` lines) | 0.5s |
| Tests (demo data) | `TEMPO_DEMO_DATA=1 npm test` | ✅ all checks passed (62 `ok: demo` lines) | 0.5s |
| Tests (PDF-backed) | `TEMPO_PDF_DIR=<folder of the nine PDFs> npm test` | ✅ all checks passed; 'independent PDF re-parse: 9/9 grids compared' | 0.5s |
| Lint | `npm run lint` (`tsc --noEmit`) | ✅ PASS | 0.1s |

## Tests: detail

- New tests: exact per-grid pins (SHA-256 of price tables + literal title/audience/appliesFrom/extinction/surcharges/taxes) in `check-data-prices`; independent PDF re-parse of the new fields; full-grid, facts, label and formatter assertions in `check-tariffs`.
- Pin non-vacuity (lead re-run on a copy outside the repo, no PDFs): injection +1, TCFE 6630→6360 and alias change each fail with an explicit 'differs from its pin' message; the unmutated copy passes.
- Regression detected: NO.

## Spec runnable checks (specs/tempo-simulator.md)

Every check script run individually, exit 0: check-import, check-pricing, check-chart, check-viewrecap, check-tariffs, check-forbidden-apis, check-dist, check-data-prices, check-data-calendar.

## Browser scenario (Chromium, committed synthetic demo files, `dist/` served statically)

No '.pdf'/'fichier' text and no typographic apostrophe in the card; distinct dated summaries on every closed `<details>`; `aria-current` on exactly the selected-power rows; captions read 'Option Heures creuses / Heures pleines'; extinction facts as specified; no console, CSP or Trusted-Types errors; only the 4 static requests.

## Code-intel gate

Skipped (no code-intel resolver or `code-intel` block in this project).

## Cross-runtime QA

Skipped: `scripts/xruntime-exec.sh` / `xruntime-review.cjs` not installed (QA light bundle check fails, recorded as degraded). `opencode` is on PATH, but sending the project to another model service is not authorised.

## NO-GO issues

None.

## Verdict

**GO** — ready for `/roster-ship`. Caveats (non-blocking): review and QA ran without the roster mechanical tooling (degraded, recorded); one LOW review finding is deferred (card length on phones: optional 'Tout replier' control); the fact label 'Base de l'extinction' (legal basis of the Base extinction) is terse; no remote exists, so shipping means local commits only.
