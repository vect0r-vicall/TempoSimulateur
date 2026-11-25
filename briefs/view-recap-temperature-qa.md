# QA — view-recap-temperature

**Status:** GO
**Assurance:** degraded (no qa convergence gate installed)

- `npm test`: exit 0, all checks passed. `npm run lint`: exit 0.
- Browser QA (headless chromium, built `dist/`, stubbed Open-Meteo, 365-day demo period): overlay off hides the line and keeps the aria summary free of 'Température'; overlay on shows the period line; year 2026 full coverage; year 2025 `(42/365 jours)`; year 2023 'donnée indisponible'; months 2026-03 and 2026-11 match independent expectations; toggling the overlay off hides the line again; no console errors.
- Colours: tt-mean/tt-min/tt-max differ from the muted text in light and dark; contrast on the card 5.4 to 9.7 (AA needs 4.5).
