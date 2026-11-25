# Properties / invariants
- P1 No network by default: nothing is requested unless the user explicitly ticks the opt-in weather overlay (or searches a place). The only exception: GET requests to exactly https://geocoding-api.open-meteo.com and https://archive-api.open-meteo.com, no credentials, no referrer, coordinates rounded to 0.1 degree; the fetch API is confined to src/net/weather.ts (allowlist in scripts/check-forbidden-apis.mjs, for the `fetch` pattern only). XHR/WebSocket/beacon/EventSource/Worker, cookies, localStorage/sessionStorage/IndexedDB stay forbidden everywhere. The weather cache is in memory only.
- P2 Strict CSP (default-src 'none', no inline script); connect-src is exactly `https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com` (no wildcard, no other origin), generated from scripts/policy.mjs into the meta CSP, dist/_headers and nginx.conf.snippet and asserted by check-dist; sample server headers shipped.
- P3 No raw HTML from file content: textContent / DOM API only, never innerHTML.
- P4 Input limits (file size, rows); tolerant parsing; French error messages, no unhandled exceptions.
- P5 Money in integer cents/micro-euros; no float drift in totals.
- P6 No personal data in git (*.csv ignored).
- P7 Grid data (src/data/grids.ts, generated): integer micro-units only; null means 'not printed in that grid', never 0; the generated grids equal the nine EDF PDFs (independent PDF-backed re-parse when the PDFs are present, exact SHA-256/literal pins in scripts/check-data-prices.mjs otherwise); no path or identifier of the owner's data folder appears anywhere in the repo.
- P8 Weather data is untrusted: strict validation (same-length arrays, finite values in -90..60 C else missing, WMO code from the known set, wind speed 0..300 km/h, direction 0..360, dates inside the requested window, at most 5 places, truncated text, 1 MB cap, 10 s timeout), rendered via textContent only; nulls near today are missing days, never zero.
- Zero runtime dependencies, no CDN.
## Test policy
Pragmatic and light: parser, pricing engine, aggregation only. Test debt is noted in the friction log, never blocking.
