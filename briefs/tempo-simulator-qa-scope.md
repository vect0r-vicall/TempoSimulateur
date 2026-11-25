# QA scope — tempo-simulator
**Status: VALIDATED**

## Quality Gates
```bash
npm run build   # esbuild -> dist/ (exactly 5 files)
npm test        # node scripts/run-checks.mjs -> CHECK-1..6
npm run lint    # tsc --noEmit
```

Behaviours: AC-1..14 via CHECK-1..6; manual browser smoke with a synthetic fixture and with the synthetic demo CSVs in tests/demo-data (network blocked): demo-data check passed (opt-in, TEMPO_DEMO_DATA=1).
## Model routing
Runtime Claude Code; inherited model, standard tier; native control: Agent model parameter; actual model unknown; cost unknown, no costly exception. Failure trigger: same red check after a diagnosis; bounds: improve-loop budget; fallback: none (escalate to the human).
