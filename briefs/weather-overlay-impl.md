# Implementation Brief — weather-overlay

**Mode:** fast
**Status:** COMPLETED

## Modified files
| File | Change | Reason |
|---|---|---|
| kb/properties.md, kb/risks.md, kb/spec.md, specs/tempo-simulator.md, README.md | amend | P1/P2/FR-018/FR-021 opt-in exception; P8, R7-R9, FR-033..040, AC-24..29, CHECK-10/11 |
| scripts/policy.mjs | modify | connect-src exactly the two Open-Meteo origins |
| scripts/check-dist.mjs, check-forbidden-apis.mjs, run-checks.mjs | modify | CSP assertion, fetch allowlist (single module), exactly one fetch call site in bundle |
| scripts/check-weather.mjs, check-weather-scene.mjs | add | CHECK-10, CHECK-11 |
| src/core/weather.ts, src/net/weather.ts | add | pure core; single network module (injectable fetch) |
| src/core/scene.ts, src/ui/svg.ts, src/ui/chart.ts, src/ui/weather.ts, src/main.ts, src/app.css | modify/add | Météo fieldset, tooltip line, trend line, right °C axis, legend |

## Decisions made
- Weather fetched only for the applied period; drilled buckets outside it show "donnée indisponible".
- fetch exempt only in src/net/weather.ts (other APIs stay forbidden there); bundle must have exactly one fetch site.

## Quality Gates (final, run by lead)
- Build `npm run build` 0; `npm test` 0; `TEMPO_DEMO_DATA=1 npm test` 0; `npm run lint` 0. PDF-backed run not executed (no TEMPO_PDF_DIR) — recorded skip.
- Chromium smoke with mocked Open-Meteo routes: 0 failures, 3 requests, 0 CSP violations (scratchpad script, not in repo).

## Points of attention for review
- Security model change: confirm no request before opt-in+search, CSP exactness, validation strictness, stale-response tokens, no leakage of file data into requests.
- Real-network behaviour untested (only mocked); manual smoke needed in QA.

## Identified out-of-scope
- Refetching weather for drilled buckets outside the period.
