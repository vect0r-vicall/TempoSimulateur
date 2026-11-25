# QA Brief — chart-view-recap

**Date:** 2026-11-25
**Status:** GO ✅
**Round:** 1 (qualifying 0/5)

## Round state

Fresh cycle, round 1, no NO-GO causes. The QA state file was written by hand: `scripts/check-qa-convergence.cjs` and the round-lifecycle script are not installed in this project.

## Quality Gates

| Gate | Command | Result | Duration |
|---|---|---|---|
| Build | `npm run build` | ✅ PASS (dist = index.html, app.js, app.css, favicon.svg, _headers) | 0.1s |
| Tests | `npm test` | ✅ all checks passed (460 `ok:` lines) | 0.4s |
| Tests (demo data) | `TEMPO_DEMO_DATA=1 npm test` | ✅ all checks passed (62 `ok: demo` lines) | 0.5s |
| Lint | `npm run lint` (`tsc --noEmit`) | ✅ PASS | 0.1s |

## Tests: detail

- New tests added in the review fix-first pass: 12 month-title assertions (all 12 months, independent expectations) in `scripts/check-viewrecap.mjs`.
- Regression detected: NO.

## Spec runnable checks (specs/tempo-simulator.md)

Every check script run individually, exit 0: check-import, check-pricing, check-chart, check-viewrecap (CHECK-8 / AC-21 / FR-031), check-tariffs, check-forbidden-apis, check-dist, check-data-prices, check-data-calendar.

## Browser scenario (Chromium, committed synthetic demo files, `dist/` served statically)

FAILS 0: view recap totals equal the main recap by default; year totals equal the sum of its months within 1 cent; month titles and elision; Retour restores year then period totals; kVA 3 shows Tempo unavailable with its reason; no horizontal scroll at 390px; no console, CSP or Trusted-Types errors; only the 4 static requests.

## Code-intel gate

Skipped (no code-intel resolver or `code-intel` block in this project).

## Cross-runtime QA

Skipped: `scripts/xruntime-exec.sh` / `xruntime-review.cjs` not installed (QA light bundle check fails, recorded as degraded). `opencode` is on PATH, but sending the project to another model service is not authorised.

## NO-GO issues

None.

## Verdict

**GO** — ready for `/roster-ship`. Caveats (non-blocking): review and QA ran without the roster mechanical tooling (degraded, recorded in review.json and friction log); one LOW review finding is deferred (extract a shared pure `viewAnalysis()` and add Tempo-kind synthetic days to the check); no remote exists, so shipping means local commits only.
