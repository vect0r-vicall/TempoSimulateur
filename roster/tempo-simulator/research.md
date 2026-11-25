# Research — tempo-simulator

_Generated: 2026-11-25_
_Mode: full (3 documentarian sub-agents)_
_Online research: enabled_
_Note: Q4 (project directory) deliberately NOT given to blind researchers, since kb/ and README describe the task; the lead covers it below._

## Q1 — Index CSV format
- `mes-index-elec-*.csv`: ISO-8859-1, LF, `;` delimiter, 10 fields/row. Lines 1-3 preamble (empty, title, empty), line 4 header, data from line 5. `:1-4`
- Date `DD/MM/YYYY`, one reading per day, strictly newest first, no duplicate dates. Values are non-negative integers (kWh), cumulative, empty cells for unused columns. Type column constant "Index transmis par le distributeur".
- Columns 3-4 (Heures pleines, Heures creuses) are populated only for the older contract period; columns 5-10 (Creuses/Pleines x Bleu/Blanc/Rouge) only for the Tempo period. The two column groups never overlap on a row.
- At a contract switch the old counters and the new Bleu counters may be close, but the file states no mapping between them.
- Gaps (missing days) can occur. Counters can stay flat day to day. Decreasing indexes are rejected.

## Q3 — Other exports (same folder)
- Other exports exist: `ma-conso-mensuelle` (monthly kWh, yearly total rows with space thousands separators), `ma-conso-quotidienne` (daily kWh; has Réelle/Recalculée flag), `ma-puissance-max` (daily/monthly/annual max VA), `mes-puissances-atteintes-30min` (30-min W, newest first). All Latin-1, `;`, title line 2, newest first.
- The Tempo-era index file is the only one with per-colour HC/HP counters.

## Q2 — Price grids (9 PDFs: 20220201, 0801, 20230201, 0801, 20240201, 20250201, 0801, 20260201, 20260801)
- Each: Base, Heures Creuses and Tempo tables, TTC. Subscription in EUR/month per kVA; kWh prices in cents TTC. Extracted text at scratchpad `tarifs-YYYYMMDD.txt` (pdftotext -layout); transcription must be re-done/verified by the implementer.
- Within a grid kWh prices do not depend on power (exception: Base in 20260201 and 20260801: 3 and 6 kVA differ from 9-36). Only subscription varies by kVA.
- Available powers differ: Base 3-36 kVA in all grids; HC 6-36 (3 kVA only in 20260801); Tempo 9,12,15,18,30,36 in 2022 grids, 6-36 (no 24) 2023-02 to 2026-02, plus 24 in 20260801.
- Spot values (2026-02): Base 3kVA 12,03 EUR/month, 19,40 c/kWh; HC 6kVA 15,65, HP 20,65, HC 15,79; Tempo 6kVA 15,59: Bleu HC 13,25, HP 16,12, Blanc HC 14,99, HP 18,71, Rouge HC 15,75, HP 70,60.
- No grid states HC hours or Tempo day boundaries. Prices include taxes (accise, CTA, VAT); VAT 20% (5,5% on subscription in 2022).
- Grids have surcharges (autoproducteur, non-Linky): not relevant to a basic comparison, listed per grid in the extracted text.

## Q4 — Project directory (lead, not blind)
Greenfield. Only README.md, kb/{spec,properties,risks}.md, briefs/, roster/, memory/, skills-meta/ exist. No code.

## Q5 [ecosystem] — Tempo calendar and hours
- Tempo day = 06:00 to 06:00. HC = 22:00-06:00, HP = 06:00-22:00 whatever the colour (EDF excerpts via search; not fetched directly).
- Per season (1 Sep-31 Aug): 300 blue, 43 white, 22 red. Red only 1 Nov-31 Mar, never Sundays/holidays/Saturdays; white never Sundays.
- Official producer RTE (API needs account/token; not fetched). data.gouv.fr "Tempo Like Supply Contract": licence unspecified, outdated description.
- api-couleur-tempo.fr (fetched live 2026-11-25): free, no key, CORS `*`, no stated licence/terms. `GET /api/joursTempo?periode=YYYY-YYYY` returns array of `{"dateJour","codeJour","periode","libCouleur"}`, codeJour 1=Bleu, 2=Blanc, 3=Rouge, 0=unknown yet; `/api/joursTempo` returns all days from 2019-09-01. Complete seasons 2021-22..2025-26 each have 300/43/22 (2023-24: 301/43/22, leap year); single relay, not cross-checked.
- calendrier-tempo.fr: CC BY 4.0 (attribution required), `/api/history?days=N` (<=365), `{"history":[{"date","couleur_reelle"}]}`; not affiliated with EDF/RTE, EDF is authoritative. Jour Tempo: CSV history back to 2014, code MIT, credit "RTE, via Jour Tempo".
- Coverage needed here: 2022-08-01 onward lies in season 2021-22 (partial) and later; static download is feasible; tomorrow's colour may be unavailable (~11:00 publication).
- Gaps: RTE portal, eco2mix tempo dataset, EDF pages not directly verified.

## Q6 [ecosystem] — Prior art, CSP
- No open-source browser-only Tempo simulator found (search not exhaustive). iGeneration (Jan 2024) has a Tempo simulator taking the Enedis CSV + subscribed power; commercial simulators (jechange, fournisseurs-electricite) work from annual kWh and HP/HC share. Rates differ by source: treat all as dated.
- MDN strict-CSP pattern: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'`. Meta-tag CSP ignores frame-ancestors/report-uri/sandbox; those need real HTTP headers. SVG presentation attributes and CSSOM style setting are not blocked by CSP; SVG `style` attributes and inline `<style>` are. Inline event attributes blocked.
- Not found: evidence on SVG vs canvas choice, FileReader/File.text docs.

## Coverage gaps
- Q4 not given to blind researchers (by design). EDF/RTE primary sources not directly verified (Q5). Q6 gives no CSV-reading API guidance.
