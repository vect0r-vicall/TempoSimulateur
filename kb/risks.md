# Risks
- R1 Tempo day (06:00-06:00) vs daily index reads: ambiguous/zero-consumption days. Mitigation: calendar + cross-check.
- R2 HC/HP offer assumes Tempo HC windows (only split in data).
- R3 Price grids transcribed from PDFs: table test against 2026-02 grid.
- R4 Tempo calendar fetched at build time: need fallback if source unavailable.
- R5 Known differences between the EDF PDF grids (our source) and public CRE open data (audit 2026-11-25, briefs/grid-vs-public-apis-investigation.md): kWh prices equal except rounding (2026-02 HC, 2025-02 Bleu HC: CRE truncates); CRE's Tempo 2022 rows imply a different tax basis (about 1.09 c/kWh vs 0.76 c for its own Base/HC-HP rows) so they are 0.4 c above the EDF PDF; monthly TTC subscriptions differ from CRE annual TTC / 12 by at most 0.20 EUR/month (CTA allocation and rounding not public). The EDF PDFs stay the reference.
- R6 No 2024-08-01 grid on purpose: the TRVE did not change on that date (CRE publishes one continuous 2024-02-01 to 2025-01-31 period; the TURPE update was deferred to 2025-02-01). Not a data gap; do not add a grid.
