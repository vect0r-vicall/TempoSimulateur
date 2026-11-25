# QA Brief — weather-details

**Status:** GO ✅ — round 1 (fast, degraded review)

## Quality Gates (lead, HEAD 4306744)
| Gate | Command | Result |
|---|---|---|
| Build | `npm run build` | ✅ 5 files |
| Tests | `npm test` | ✅ all checks passed (incl. CHECK-13) |
| Tests (demo) | `TEMPO_DEMO_DATA=1 npm test` | ✅ |
| Tests (PDF-backed) | `TEMPO_PDF_DIR=… npm test` | ⏭ skipped: folder unavailable; no price data touched |
| Lint | `npm run lint` | ✅ |

## Browser (Chromium, mocked Open-Meteo): smoke-weather.mjs and smoke-weather-details.mjs, fails 0, 0 CSP violations, no foreign origin; glyphs render (not tofu) light/dark; day tooltip shows Météo/Température/Vent lines.

## Real contract: weather_code, wind_speed_10m_mean, wind_direction_10m_dominant verified against the live archive API (Paris sample) before implementation.

## Known behaviour: glyphs only when a day cell is >= 14 units wide (not in the default 365-day day view).
