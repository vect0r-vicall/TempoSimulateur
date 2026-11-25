# QA Brief — settings-block-live-search
**Status:** GO ✅ round 1 (fast, degraded review)
Gates run by the lead after the fix pass: `npm run build` ✅ (5 files), `npm test` ✅ (CHECK-15, CHECK-16 included), `TEMPO_DEMO_DATA=1 npm test` ✅, `npm run lint` ✅; PDF-backed run ⏭ skipped (folder unavailable; no price data touched).
Browser (Chromium, mocked Open-Meteo): live-search smoke v2 + adapted earlier smokes, fails 0, 0 CSP violations, min gap between geocoding requests ~507 ms; screenshots light/dark viewed. Not done: real network, real IME editor, axe/Lighthouse.
