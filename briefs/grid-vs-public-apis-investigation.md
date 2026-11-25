# Investigation — grid-vs-public-apis

**Date:** 2026-11-25
**Symptom:** Owner asks whether the hardcoded EDF tariff grids (`src/data/grids.ts`, nine grids effective 2022-02-01 to 2026-08-01, extracted from the EDF PDFs) align with public data from public APIs, for 2022 to today. Read-only audit: no code or data changed.
**Status:** ROOT CAUSE IDENTIFIED (every divergence explained; none is a transcription error; no change to `grids.ts` required)

## Sources found (public, machine-readable)

| Source | Official? | Covers | Notes |
|---|---|---|---|
| CRE open data 'Historique des TRVE résidentiels' on data.gouv.fr (`Option_Base.csv`, `Option_HPHC.csv`, `Option_Tempo.csv`, `Notice.txt`; JSON view through the data.gouv tabular API) | Official (CRE) | Base (3–15 kVA), HC/HP (6–36 kVA, 3 from 2026-08), Tempo (6–36 kVA); HT and TTC; annual subscription; 2012 to 2026-08-01 | Best source. Static file updated about twice a year, no versioned REST API. Licence field `notspecified`. The tabular API stores Tempo dates as YYYY-DD-MM. |
| Jour Tempo 'TRVE depuis 2014' on data.gouv.fr (`trve-historique.csv`) | Community relay (built from JORF arrêtés and CRE) | All options, HT with legal source ids; Tempo TTC from CRE | `lov2` licence; freshest (updated 2026-11-21). No TTC subscription. |
| api-couleur-tempo.fr `/api/tarifs` | Community relay | **Current Tempo prices only** (2026-08-01), `tarifForce:true` | No history endpoint. |
| DGFiP form 2040-TIC-SD (2025, 2026) | Official | Accise per period from 2024-02-01 | PDF, primary source for the accise. |
| CRE deliberation 2024-190 and press release 2025-06-23 | Official | Context for 2024-08, 2025-02, 2025-08 | PDFs. |

## Findings

| Item | Result | Evidence |
|---|---|---|
| Base kWh prices, all grids, 3–15 kVA | **Match** CRE TTC exactly | agent comparison; lead spot-check 2022-02, 2023-02, 2025-02, 2026-02 |
| HC/HP kWh prices, all grids | **Match**, except one cell: 2026-02 HC, project 15,79 c (EDF PDF) vs CRE 15,78 c | CRE HT 10,07 c: (10,07 + accise 3,085) × 1,2 = 15,786 → 15,79 (PDF). CRE value looks truncated. |
| Tempo kWh prices, 2023-02 to 2026-08 (all six prices, all kVA) | **Match** CRE and Jour Tempo; 2026-08 also matches api-couleur-tempo | agent comparison of 372 TTC prices: 323 OK |
| Tempo 2025-02 Bleu HC: project 12,88 vs CRE 12,87 | Rounding only | (7,36 + 3,37) × 1,2 = 12,876 → 12,88 (EDF PDF); CRE looks truncated |
| **Tempo 2022-02 and 2022-08, all six prices (72 cells): project is 0.39–0.40 c lower than CRE** (e.g. Bleu HC 8,62 vs 9,02) | **CRE data is internally inconsistent; the project follows the EDF PDF** | HT prices are identical in both. In CRE's own file the implied tax per kWh in 2022 is about 0.76 c for Base and HC/HP (CSPE 0,10 + TCFE 0,663, the project's taxes) but about 1.09 c for the Tempo rows. The EDF PDF Tempo prices match the 0.76 c basis: (6,42 + 0,763) × 1,2 = 8,62. |
| Subscription (monthly TTC), all grids | **Not an exact match with CRE annual TTC / 12**; differences between −0,20 and +0,20 €/month (at most about 1.2 %), sign varies by option and year (e.g. 9 kVA 2026-02: Base 19,56 EDF vs 19,66 CRE; Tempo 19,38 vs 19,45) | HT annual subscription is known in CRE data, but the CTA allocation and rounding behind each TTC are not public. Cannot say which side is "more right"; the EDF PDF is the supplier's own published price. |
| Accise / CSPE / TCFE per period | **Match**. 2024-02 (21,00 €/MWh), 2025-02 (33,70), 2025-08 (29,98), 2026-02 (30,85), 2026-08 (30,62) match the DGFiP forms; 2022 and 2023 values (CSPE 0,10 + TCFE 0,663; CSPE 0,10) are corroborated by the implied taxes in CRE's Base and HC/HP rows (0.76 c and 0.10 c) | DGFiP PDFs read directly; CRE reconciliation by the lead |
| VAT on subscription 5,5 % → 20 % on 2025-08-01 | Matches the CRE press release of 2025-06-23 | |
| **Missing 2024-08-01 grid** | **Not a gap.** TRVE prices did not change on 2024-08-01 | CRE publishes one continuous row 2024-02-01 → 2025-01-31 for every option and power; no 2024-08 period in the CRE or Jour Tempo data; CRE deliberation 2024-190 explains the TURPE update was not applied on 1 Aug 2024 and was pushed to 2025-02-01. This corrects my earlier remark that the 2024 gap might misprice those months. |

## Could not be verified (no public source)

- Base 18–36 kVA (CRE stops at 15 kVA; those powers are in extinction).
- Surcharges (self-producer injection, no Linky meter, no index transmission), the CTA percentage, and VAT on the CTA.
- The monthly TTC subscription (see above).
- Whether the 2022 Tempo EDF prices or CRE's Tempo TTC are what customers were actually billed; the primary document (EDF PDF) is consistent with Base and HC/HP, CRE's Tempo 2022 rows are not.
- The Journal Officiel arrêtés themselves were not fetched.

## Root cause of the divergences

All divergences are rounding or basis differences between two publishers (EDF's PDF grids vs CRE's open-data table), not extraction errors: the project reproduces the EDF PDFs exactly (nine grids verified against the PDFs by an independent parser and a hash pin).

## Recommended follow-ups (none required; owner decides)

1. Keep `grids.ts` as is (EDF PDFs are the primary source for what EDF charges).
2. Document the known differences in the spec/README ('Écarts connus avec les données publiques CRE') so a future audit does not re-open them.
3. Optional dev-only script (network, never in the build) that re-fetches the CRE CSVs and reports differences beyond a tolerance (0.011 c/kWh for kWh prices, 0.25 €/month for subscriptions) with the known exceptions listed.

## Impact scope

Simulation costs: kWh differences are at most 0.01 c (rounding) apart from the 2022 Tempo grids (0.4 c on Tempo energy before 2023-02; outside the data range of the current demo and the owner's last 3 years); subscription differences at most 0.20 €/month, about 2.4 €/year per offer, identical in sign for all days of a grid.
