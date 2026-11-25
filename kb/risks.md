# Risks
- R1 Tempo day (06:00-06:00) vs daily index reads: ambiguous/zero-consumption days. Mitigation: calendar + cross-check.
- R2 HC/HP offer assumes Tempo HC windows (only split in data).
- R3 Price grids transcribed from PDFs: table test against 2026-02 grid.
- R4 Tempo calendar fetched at build time: need fallback if source unavailable.
