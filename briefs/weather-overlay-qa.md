# QA Brief — weather-overlay

**Status:** GO ✅ — Round 1 (fast, degraded review; convergence scripts not installed)

## Quality Gates (run by the lead after the review fixes, HEAD 46039e7)
| Gate | Command | Result |
|---|---|---|
| Build | `npm run build` | ✅ 5 files in dist |
| Tests | `npm test` | ✅ all checks passed (incl. check-weather, check-weather-scene, check-weather-review) |
| Tests (demo) | `TEMPO_DEMO_DATA=1 npm test` | ✅ all checks passed |
| Tests (PDF-backed) | `TEMPO_PDF_DIR=… npm test` | ⏭ skipped: folder not available (weather change touches no price data) |
| Lint | `npm run lint` | ✅ |

## Spec checks
CHECK-4/5 (forbidden APIs, dist: connect-src exactly two origins, exactly one fetch site), CHECK-10/11/12 all exit 0 inside `npm test`.

## Browser scenario (Chromium, dist served, Open-Meteo mocked via page.route)
0 fails, 3 API requests: none before opt-in+search; one geocoding on Enter; one archive on choice; tooltip temperature in year/month/day; trend path + right °C axis + legend; credit text; untick clears; stale response dropped; HTTP 400 French message; 0 CSP violations; no other origin.

## Real network smoke (Node, built net module, public data only, Paris)
Geocoding '75001' → 3 places; archive 2025-01-01..2025-12-31 → 365 days, 0 missing. Real provider contract matches the validation.
