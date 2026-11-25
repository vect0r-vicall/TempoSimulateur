# Reviewer brief — tempo-simulator
**Status: VALIDATED**

Audit first: `src/core/days.ts` (differencing, gap spread, boundary), `src/core/pricing.ts` + `src/data/grids.ts` (price numbers vs PDFs), `src/data/tempo-calendar.ts`, `src/index.html` (CSP meta first, no inline), `build.mjs`/`dist` (5 files), `src/ui/*` (textContent only).
Risks to verify: silent numerical errors; CSP-blocked style attributes; forbidden APIs; unavailable-offer logic at grid boundaries; period labelling; estimate notice and assumptions box present; file content never reaching innerHTML; error messages truncated.
Expected behaviours: spec ACs 1-14.
## Model routing
Runtime Claude Code; inherited model, standard tier; native control: Agent model parameter; actual model unknown; cost unknown, no costly exception. Failure trigger: same red check after a diagnosis; bounds: improve-loop budget; fallback: none (escalate to the human).
