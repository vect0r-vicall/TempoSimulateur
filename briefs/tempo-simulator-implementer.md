# Implementer brief — tempo-simulator
**Status: VALIDATED**

Goal: build TempoSimulateur per `specs/tempo-simulator.md` (read it fully; it is the contract, FR-001..024, AC-1..14) and `briefs/tempo-simulator-intake.md`. Greenfield TypeScript + esbuild, zero runtime deps, French UI, English code.
Scope boundary: no network after load, no storage, no surcharges, no Base-only files, no other CSVs than the index and the optional peak-power file.
Steps: follow `briefs/tempo-simulator-plan.md` S0..S8 in order; slices S1||S2 and S3||S4 may run in parallel.
Key decisions: D→D+1 differencing; boundary day excluded; contract periods by non-empty column group; integer µEUR; largest-remainder gap spread; unavailable offers excluded; calendar only for HC/HP-period Tempo cost; pure `scene` model for the chart; SVG presentation attributes only; no `style` attributes.
Light testing only: CHECK-1..6 as plain Node scripts on esbuild-bundled sources; synthetic fixtures; synthetic demo CSVs (`tests/demo-data/`, `TEMPO_DEMO_DATA=1`) optional assertions only; never commit personal CSV. Dev-only scripts (`gen-prices`, `gen-calendar`) are not part of the build; extracted data is committed.
Price source: `pdftotext -layout` on the 9 PDFs; research values in `roster/tempo-simulator/research.md`; verify 2026-02 Tempo/Base/HC spot values.
## Quality Gates
```bash
npm run build   # esbuild -> dist/ (exactly 5 files)
npm test        # node scripts/run-checks.mjs -> CHECK-1..6
npm run lint    # tsc --noEmit
```

## Model routing
Runtime Claude Code; inherited model, standard tier; native control: Agent model parameter; actual model unknown; cost unknown, no costly exception. Failure trigger: same red check after a diagnosis; bounds: improve-loop budget; fallback: none (escalate to the human).
