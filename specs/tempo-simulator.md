---
name: roster-spec
type: spec
status: live
feature: TempoSimulateur — client-side EDF Tempo/HC-HP/Base simulator
brief: briefs/tempo-simulator-intake.md
date: 2026-11-25
version: 1.0.0
---

# Spec — TempoSimulateur

## Clarifications

| Q | A |
|---|---|
| Which day does an index delta belong to? | Reading dated D = counter at 00:00 of D. Consumption of calendar day D = index(D+1) - index(D). Cross-checkable against the daily-consumption export (opt-in demo-data check). |
| How many days are priced for a file? | Every calendar day between the first and last reading, minus each contract-period boundary day (some of them estimated when readings are missing); the boundary day is excluded entirely, energy and subscription, and the UI states the number of priced days (era switch: old HP/HC counters -> new Bleu counters have no defined mapping). |
| Contract periods? | The file can hold several consecutive contract periods (e.g. HC/HP until a boundary day, Tempo afterwards). Columns are mapped by header names, never by position (old order HP,HC; new order HC,HP per colour). Each row's period = the non-empty column group. Each period is imported with its own native granularity (a 'HC/HP period' keeps HC/HP kWh only; a 'Tempo period' keeps colour counters) and the UI lists the detected periods with their dates. Periods can cohabit freely in one analysis. |
| Gap handling? | A missing reading makes the delta cover n days; it is split per bucket with integer largest-remainder (earliest days get the remainder), days flagged "estimé" and counted. A gap overlapping the era switch makes those days unavailable. |
| Money arithmetic? | Integer micro-euros (1e-6 EUR) everywhere: kWh price 19,27 c/kWh = 192700 µEUR/kWh; subscription per day = round(monthly µEUR / days in month); only displayed totals are rounded to cents. |
| Subscription accrual? | Charged on every day of the effective period, even with 0 kWh, identically for each offer, at one chosen kVA for the whole period. |
| Grid for a day? | Latest grid with effective date <= that calendar day (Europe/Paris civil date, UTC date arithmetic, no clock-time). After the last grid (2026-08-01) its prices continue to apply. |
| Offer availability? | An offer is unavailable for the period when any priced day has no (offer, kVA, grid) row (e.g. Tempo at 3 kVA, HC at 3 kVA before 2026-08, Tempo 24 kVA before 2026-08). Unavailable offers show the reason, are excluded from the recap sum and from "cheapest". |
| HC/HP offer pricing? | Uses the file's HC/HP kWh (HC 22:00-06:00 as in EDF Tempo; real contract hours are unknown, flagged in UI). Base = total kWh. |
| Pre-2025 Tempo cost? | Each day's HC and HP kWh priced at the Tempo colour of that calendar date from the embedded calendar. Approximation (the 00:00-06:00 HC kWh actually belong to the previous Tempo day), flagged in the UI. In the Tempo era the meter's real colour counters give exact cost. |
| Where is the calendar needed? | Only for days of an HC/HP contract period (and as chart colour there). The Tempo-era colours never need it. For an HC/HP period running past the calendar's last day, days with an unknown colour make Tempo unavailable for the period (runtime guard, not a build failure); in the Tempo era colours come from the counters and the calendar is only a build-time cross-check. Calendar source: api-couleur-tempo.fr (relay of RTE, no stated licence), cross-checked at build time against counters and season counts 300/43/22; footer credit as plain text, not a link. |
| Default period? | 365 days ending on the last priced day (not the browser clock). Start > end, empty intersection or invalid date: French message, previous period kept. Clamped periods state the effective range. |
| kVA inference? | Manual selector (3,6,9,12,15,18,24,30,36). Optional peak-power file recognised by its header (`Puissance max`), dropped before or after the index file or together; its daily block max is used; pre-selects the smallest standard size >= max VA (36 if above), labelled "au moins". Without it: 6 kVA, labelled "à vérifier". |
| Validation limits? | File <= 5 MB, <= 20000 rows, no NUL bytes; UTF-8 (strict, BOM allowed) tried first, else Latin-1 decode, with header matched on ASCII-folded lower-case substrings; CRLF/BOM tolerated; any row order accepted (sorted by date); duplicate dates, decreasing index (meter replacement/rollover included) or unknown format = refusal with French message citing the physical line, quoted content truncated to 40 chars and set via textContent. A second file of the same kind replaces the first. |
| Chart semantics? | Groups: calendar year / calendar month overlapped / day. Each offer bar = stacked cost: subscription (neutral) + HC part (lighter) + HP part (darker); Tempo bars are stacked by colour then HC/HP, mixed-colour buckets split by colour, and hued by the kWh colour (blue/white/red, white outlined, unknown grey). Each group also shows a thin HC/HP kWh ratio strip. Shared value axis. Day granularity only for periods <= 400 days. Bars have aria-labels; groups are keyboard-focusable at month/year granularity, day view exposes one focusable summary. |
| Security headers? | Meta CSP first in head: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'` (no connect-src => no connections). `frame-ancestors`, X-Content-Type-Options, Referrer-Policy need real headers: shipped as `dist/_headers` and an nginx snippet, documented as a deploy requirement. dist = index.html, app.js, app.css, favicon.svg, _headers. |

### US-1: Import the EDF index export (Priority: P0)
As an EDF customer, I want to drop my `mes-index-elec-*.csv` onto the page so that my daily consumption per HC/HP (and Tempo colour) bucket is loaded locally.
**Scope**: does NOT cover other CSV exports except the optional peak-power file of US-3.
**Independent Test**: parse the sample file and compare daily deltas to a hand-computed reference.
**Acceptance Scenarios**:
1. **Given** a Latin-1 index file with two contract periods, 3 missing readings and one period-boundary day, **When** dropped, **Then** the priced days are available as daily kWh per bucket (consumption of day D = index(D+1) - index(D)); the boundary day is excluded entirely (period boundary: neither energy nor subscription, counted in the notice); each missing reading makes one delta span two days, spread evenly and flagged as estimated (so 3 gaps give 6 estimated days).
2. **Given** a file whose index decreases on line 100, **When** dropped, **Then** a French error names physical file line 100 and no data is loaded.
3. **Given** a 50 MB file or a binary file, **When** dropped, **Then** it is refused with a French message and nothing is parsed.

### US-2: Price the three offers (Priority: P0)
As a customer, I want my consumption priced under Tempo, HC/HP and Base with the EDF grid applicable on each day so that costs are comparable.
**Scope**: does NOT cover surcharges, taxes beyond those included in TTC grid prices, or prices outside 2022-02..present.
**Independent Test**: price one known day by hand for each offer and each grid.
**Acceptance Scenarios**:
1. **Given** 10 kWh Base on 2026-03-01 at 9 kVA, **When** priced, **Then** the kWh part is 10 x 19,27 c = 1,927 EUR plus 19,56/31 EUR of subscription.
2. **Given** a day on 2026-07-31 and another on 2026-08-01, **When** priced, **Then** they use the 20260201 and 20260801 grids respectively.
3. **Given** kVA = 3 and the Tempo offer, **When** priced, **Then** Tempo is shown as unavailable (no 3 kVA row), not 0.
4. **Given** a day of an HC/HP period (HP/HC columns only) priced for Tempo, **When** priced, **Then** its HC/HP kWh use the calendar colour of that date and the UI flags the approximation.

### US-3: Choose period, offers and subscribed power (Priority: P0)
As a customer, I want to choose the period (default last 12 months), the compared offers and my kVA so that the recap shows which offer is cheapest for me.
**Scope**: does NOT cover saving settings between visits.
**Independent Test**: change period/offers/kVA and verify the recap totals.
**Acceptance Scenarios**:
1. **Given** a file loaded on the current day, **When** no choice is made, **Then** the period is the 365 days ending on the last priced day and all three offers are selected.
2. **Given** only Base and Tempo ticked, **When** the recap renders, **Then** it sums exactly those two and highlights the cheaper.
3. **Given** the peak-power file dropped with max 8200 VA, **When** loaded, **Then** kVA is pre-selected to 9 and remains editable; without it kVA defaults to 6.
4. **Given** a period partly outside the data range, **When** chosen, **Then** it is clamped and the UI states the effective range.

### US-4: Read costs on a bar chart (Priority: P1)
As a customer, I want a bar chart by year, month or day with each selected offer side by side, coloured by Tempo day colour and showing the HC/HP ratio, so that I understand where cost comes from.
**Scope**: does NOT cover export/print or animations beyond CSS transitions.
**Independent Test**: render the sample period at each granularity and check bar count and segments.
**Acceptance Scenarios**:
1. **Given** 12 months and 3 offers, **When** granularity is month, **Then** 13 groups of 3 bars are drawn, bar heights proportional to cost.
2. **Given** granularity day, **When** rendered, **Then** the Tempo bar of a red day is coloured red and an HC/HP segmentation matches that day's HC/HP kWh ratio.
3. **Given** a period longer than 400 days, **When** day granularity is requested, **Then** day granularity is disabled with an explanatory French message and month granularity is used.

### US-5: Be inert towards the server (Priority: P0)
As the host, I want a static page that cannot send data or interact with the server so that nothing is stored and the page cannot be abused.
**Scope**: does NOT cover protecting the user's own machine from other software.
**Independent Test**: grep build for forbidden APIs; inspect CSP; run with network blocked.
**Acceptance Scenarios**:
1. **Given** the built `dist/`, **When** scanned, **Then** no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `innerHTML`, `eval` appears.
2. **Given** the page, **When** loaded, **Then** its CSP forbids connections and inline script, and no request is made other than the three static files.
3. **Given** a CSV cell containing `<img src=x onerror=...>`, **When** loaded, **Then** it is never rendered as HTML.

## Challenges

| ID | Story | Challenge | Resolution |
|---|---|---|---|
| C-1 | US-1,2,4 | Day boundary: which date a delta belongs to; Tempo day 06:00 vs midnight index | Verified D..D+1 convention; Tempo-era cost exact via counters; pre-2025 approximation flagged (see Clarifications) |
| C-2 | US-1 | Era switch, column order, 0 vs empty | Map by header; era by non-empty group; boundary day unavailable |
| C-3 | US-1 | Gap spreading, rounding, flagging | Integer largest-remainder per bucket, flagged estimated, switch-overlap = unavailable |
| C-4 | US-1 | Validation semantics, caps, binary, encoding, XSS in errors | Physical line numbers, 5 MB/20000 rows/NUL check, ASCII-folded headers, truncated textContent errors |
| C-5 | US-2 | Rounding and subscription proration | Integer µEUR, per-day rounding, subscription every day, one kVA |
| C-6 | US-2,3 | Offer availability varies inside a period | Unavailable if any day lacks a row; excluded from sum and cheapest; ties = both shown cheapest |
| C-7 | US-2 | HC/HP hours assumption, contract permutations | HC 22-06 assumed and flagged; file must contain HP/HC or Tempo columns else refusal |
| C-8 | US-3 | Default period anchoring, clamping, time zone | Anchored to last priced day; civil-date arithmetic; messages |
| C-9 | US-3 | Peak file recognition and use | Header-recognised, order-free, daily-block max, lower bound labelled |
| C-10 | US-4 | Group counts, year definition, segmentation | Calendar months overlapped (13), calendar year, stacked sub/HC/HP, ratio strip, kWh ratio |
| C-11 | US-4 | Performance, a11y | Day view <= 400 days (~1.2k bars); aria-labels; outlined white |
| C-12 | US-5 | CSP: connect-src, meta limits, favicon | No connect-src (default-src none), form-action none, headers file, favicon.svg shipped |
| C-13 | US-5 | Forbidden-API list and verification | Extended list scanned on source and bundle; footer credit as text; textContent for errors |
| C-14 | US-2,4,5 | Prior art: live calendar, calendar licence, tariff sources | Static by explicit user decision (no server interaction); calendar only needed for historical days; cross-checks vs counters, season counts and api /api/tarifs for 2026-08 Tempo prices; no live fetch |

## Functional Requirements

#### Import
- **FR-001** [US-1]: The system MUST read the dropped file locally (File API) and decode it as strict UTF-8 if valid, else Latin-1, refusing files > 5 MB, > 20000 rows or containing NUL bytes with a French message.
- **FR-002** [US-1]: The system MUST map columns by normalised header names, derive each row's contract period (HC/HP or Tempo) from which column group is non-empty, import each period with its native buckets, allow any number of periods to cohabit, and display the detected periods with their date ranges.
- **FR-003** [US-1]: The system MUST compute consumption of day D as index(D+1) - index(D) per bucket taking both readings from the same contract period, and MUST mark the day at each period boundary unavailable (the last day of the older period) and list it in the UI.
- **FR-004** [US-1]: The system MUST spread deltas spanning missing readings over their days with integer largest-remainder per bucket and MUST flag those days as estimated.
- **FR-005** [US-1]: The system MUST refuse files with decreasing indexes, duplicate dates or unrecognised formats, citing the physical line, without loading any data.
#### Pricing
- **FR-006** [US-2]: The system MUST price Base, HC/HP and Tempo per day from the latest grid effective on or before that day, in integer micro-euros.
- **FR-007** [US-2]: The system MUST charge the monthly subscription of the selected kVA pro rata per day (monthly / days in month) on every day of the period.
- **FR-008** [US-2]: The system MUST mark an offer unavailable for the period when any priced day lacks a price row, and MUST exclude it from the recap sum and from "cheapest".
- **FR-009** [US-2]: The system MUST price Tempo cost for days belonging to an HC/HP period with the embedded calendar colour of the calendar date and MUST display a visible notice near the recap and the chart that this cost is an estimate.
- **FR-010** [US-2]: The system MUST price Tempo-era days with the meter's colour counters, not the calendar.
#### Selection and recap
- **FR-011** [US-3]: The system MUST default to the 365 days ending on the last priced day with all offers selected, and MUST clamp or reject invalid periods with a French message.
- **FR-012** [US-3]: The system MUST sum, for the effective period, the cost of each selected available offer and highlight the cheapest.
- **FR-013** [US-3]: The system MUST accept an optional peak-power file and pre-select the smallest standard kVA >= its max VA, otherwise default to 6 kVA, always editable.
#### Chart
- **FR-014** [US-4]: The system MUST draw an SVG bar chart by calendar year, month or day with one bar per selected offer side by side and a shared axis.
- **FR-015** [US-4]: Bars MUST be stacked subscription / HC / HP cost; Tempo bars MUST be hued by kWh colour (blue, white outlined, red, unknown grey).
- **FR-016** [US-4]: Each group MUST show a HC/HP kWh ratio strip; bars MUST carry aria-labels; groups MUST be keyboard-focusable at month/year granularity and day view MUST expose one focusable summary.
- **FR-017** [US-4]: The system MUST disable day granularity for periods longer than 400 days with an explanatory message.
- **FR-025** [US-4]: Clicking (or Enter/Space on) a group MUST drill down: a year group in the year view opens the MONTH view of that calendar year, a month group in the month view opens the DAY view of that calendar month; day groups are not clickable. The drilled range is the calendar year/month intersected with the imported (priced) day range, independent of the selected period and of the recap (analysis recomputed with the same kVA and offers). The card MUST state the shown range ('Vue : 2025', 'Vue : novembre 2025'), show a 'Retour' button going up one level (day -> month view of its year -> period-based view) and a visible notice that the view differs from the selected period. Groups are focusable with pointer cursor and aria-label ending 'Entrée pour détailler' (not at day level). The Année/Mois/Jour toggle resets to the period-based view; the 400-day rule applies to the period-based day view only.
- **FR-026** [US-4]: The chart card MUST offer a native `select` labelled 'Aller à' whose options depend on the current view, built from the priced range: in period-based views (years, months or days of the selected period) it lists only the imported calendar YEARS (choosing one opens the month view of that year); in the month view of a given year it lists only the imported MONTHS of that year, with a French label such as 'novembre 2025' (choosing one opens the day view of that month); in the day view of a month it lists the imported months of that month's year with the current month selected. When nothing is selected a disabled hint option ('Choisir une année…' / 'Choisir un mois…') is shown. The select MUST stay in sync with drill-down, Retour and the toggle.
- **FR-027** [US-4]: Hovering or focusing a group MUST show only the SVG tooltip bubble; there MUST be no text readout line under the chart. Group aria-labels and a one-sentence chart summary (visually hidden) remain for screen readers.
- **FR-028** [US-4]: Each bar (month/year views) MUST show its offer name above it when it fits: 'Tempo', 'HC/HP', 'Base' if the bar width (viewBox units) is at least the estimated text width (label font size x 0.62 per character) plus a margin; else 'T', 'H', 'B' if that fits; else nothing. A label never exceeds its bar width, so neighbouring labels cannot overlap.
- **FR-029** [US-4]: The legend MUST be one block per selected offer, in bar order, each with the offer name as heading, its bar tag (T/H/B) and large (28x18) swatches with a label, drawn with the same colour classes as the bars (HP swatches carry the hatch overlay at month/year level, white Tempo swatches keep the outline, grey dotted swatches only if unknown-colour segments exist in the view): Tempo = Abonnement + Bleu/Blanc/Rouge heures creuses/pleines; HC/HP = Abonnement, Heures creuses, Heures pleines; Base = Abonnement, Énergie; an unavailable offer keeps its note in its block. A small 'Répartition des kWh' block explains the HC/HP ratio strip. Swatches use createElementNS and CSS classes only (no style attribute).
#### Security
- **FR-018** [US-5]: The shipped code MUST NOT use fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource, Worker, importScripts, cookies, web storage, IndexedDB, eval/Function, document.write, innerHTML/outerHTML/insertAdjacentHTML, window.open.
- **FR-019** [US-5]: The page MUST ship a meta CSP (first in head) that forbids connections, inline script/style and framing-independent embeds, plus a `_headers` file adding frame-ancestors none, nosniff and no-referrer.
- **FR-020** [US-5]: File-derived text MUST only reach the DOM through textContent/attributes set via DOM API; quoted content in errors MUST be truncated to 40 chars.
- **FR-021** [US-5]: The page MUST make no network request beyond its own static files (index.html, app.js, app.css, favicon.svg).
#### Assumptions box
- **FR-024** [US-2,3]: The page MUST show a small, always-visible assumptions box stating: HC hours assumed 22:00-06:00; Tempo estimate on HC/HP periods; excluded period-boundary days; estimated gap days count; kVA source (inferred 'au moins' / default 'à vérifier' / manual); last-grid-reuse; calendar credit.

#### Applied tariffs
- **FR-030** [US-2,3]: At the bottom of the page (after the assumptions box, before the footer line) a card 'Tarifs appliqués' MUST show, once a file is loaded and re-rendered on every update (file, period, kVA, offers), the prices actually used by the simulation: a one-line summary (kVA, TTC, units), then one section per EDF price grid applied to at least one day of the effective period (grid = latest effective <= day, same rule as pricing), in chronological order, titled 'Du JJ/MM/AAAA au JJ/MM/AAAA — grille du 1er février 2026' (sub-range covered by the grid), with a note when the last grid is carried over beyond its date, a source line ('Source : EDF — grille de prix « Tarif Bleu » (clients particuliers), applicable au 1er février 2026, prix TTC.', derived from the grid's `audience` and `appliesFrom` fields with the literal 'Tarif Bleu', plain text, no link, no file name) and a table (caption, th scope) with, per selected offer, the monthly subscription for the chosen kVA ('19,56 €') and its kWh prices in c€/kWh ('19,27 c€/kWh'; Base: Prix du kWh; HC/HP: Heures pleines, Heures creuses; Tempo: Bleu/Blanc/Rouge heures creuses/pleines). An offer without a row for the chosen kVA in that grid reads 'Non proposé pour cette puissance dans cette grille' (never 0). A second source line crediting RTE via api-couleur-tempo.fr appears only when the Tempo estimate on HC/HP days was used. The table scrolls horizontally inside its wrapper on narrow screens. Under it, each section has (a) a closed `<details>` whose summary carries the grid date and so differs in every section ('Grille complète du 1er février 2026 (toutes les puissances)'), holding the full Tempo, Heures creuses/Heures pleines and Base tables for every kVA row as printed in the PDF (captions 'Option Tempo', 'Option Heures creuses / Heures pleines', 'Option Base', th scope, horizontal scroll inside a wrapper; the row of the chosen kVA is highlighted by a CSS class AND carries `aria-current="true"`; a hint says that this row is highlighted 'lorsqu'elle figure dans la table', since some tables have no row for 3 or 24 kVA) and (b) a 'Taxes et majorations' definition list with every extra datum the grid prints: accise, or CSPE with its alias when printed ('aussi appelée TICFE', 2023-02 grid; 2022 grids also TCFE, montant maximum) in c€/kWh HTVA ('3,085 c€/kWh HTVA'), the CTA mention (with 'correspondant à la majorité des clients' when printed), VAT rates ('20 %', '5,5 %'), majorations in € par an HT ('9,60 € / an HT': auto-producers with injection; absence of Linky, only when the grid prints it; absence of index transmission for more than 12 months, with the qualifier 'à partir du 1er janvier 2022' when printed) and the Base extinction: a fact 'Puissances Base en extinction' = 'de 9 à 36 kVA (non souscriptibles)' followed, when the grid prints it, by a fact 'Base de l'extinction' giving the legal basis (the printed 'Arrêté du 12 août 2010 relatif aux tarifs réglementés de vente de l'électricité', 2022 to 2024 grids). Labels are normalised, not verbatim: they are paraphrased from the printed wording (shortened or reordered) and data-derived text is shown with the straight apostrophe instead of the printed typographic one (U+2019); values are as printed. No-break spaces (U+00A0) sit before '€', before 'HTVA' and around '/ an HT' so a value never wraps from its unit. Items a grid does not print are omitted (never 0). These data are hardcoded per grid in `src/data/grids.ts` (generated, integer micro-units, null when not printed). The card is hidden until a file is loaded.
- **FR-031** [US-4]: The chart card MUST show, directly under the 'Vue : …' title area and above the toggle/'Aller à' controls, a compact block of the ACTUAL RECAP VALUES of the range the chart displays (the same analysis object as the scene, via `buildRecap`; pure model `viewRecap` in src/core/viewrecap.ts): titled 'Total de la période sélectionnée' (period-based views), 'Total de l'année 2025' (year drill-down, clipped to imported days) or 'Total de novembre 2025' (month drill-down; elision 'Total d'avril 2025'). One chip per SELECTED offer shows its total ('1 234,56 €', existing formatter), a 'Le moins cher' badge on the cheapest available offer(s) only when at least two offers are compared (same rule as the main recap), 'indisponible' + the pricing reason for an unavailable offer; a line 'N jours valorisés' adds ', N jours estimés' / ', N jours exclus' only when non-zero. The block is a region labelled by its title, is rebuilt on every draw (file, period, kVA, offers, drill-down, Retour, 'Aller à', toggles), wraps on 390 px screens, works in light and dark themes, and a visually hidden polite status line names the view total (the chart card itself is not aria-live). For every offer the block total equals the sum of that offer's bar totals of the scene of the same view, and in period-based views equals the main recap total.

#### Period shortcuts
- **FR-032** [US-3]: The 'Période' fieldset of block 2 MUST offer three native buttons in a group (role="group", aria-label 'Raccourcis de période'): 'Toute la période importée', 'Dernière année', '2 dernières années'. Windows use the UTC civil-date arithmetic and end on the LAST PRICED DAY of the import (never the browser clock): whole = first..last priced day; last year = the 365 days ending there (identical to the FR-011 default period, which the month chart shows over up to 13 calendar months; the button title says so); last 2 years = the 730 days ending there. A window longer than the data is clamped to the first priced day and the period message line says in French that the data only covers N days (N = calendar span from the first to the last priced day, singular 'jour' when N is 1; not an error; the period still applies); excluded boundary days stay unpriced. A click sets the date inputs and applies the period through the same path as a manual date change (resolvePeriod, recap, chart reset to the period view, tariffs, assumptions), keeping kVA and offers. Buttons are disabled until an index file is loaded; each has aria-pressed="true" (and a visible pressed style) iff the applied period equals its window, recomputed on every update, so two shortcuts are both pressed when the data is short. Pure model in src/core/period.ts (`shortcutPeriods`, `pressedShortcuts`, `shortcutMessage`): no DOM, no clock. Re-clicking a pressed shortcut re-applies the same period (idempotent). aria-pressed is true on every shortcut whose window equals the applied period, so several may be pressed when the data is short.

#### Data
- **FR-022** [US-2]: Price tables, taxes, majorations and notes MUST be generated and verified against the nine PDF grids, with the 2026-08 Tempo prices also checked against api-couleur-tempo.fr /api/tarifs. Without the PDFs, the committed data MUST still be pinned exactly: a SHA-256 of each grid's canonical price tables and literal expected values of every other datum (title, audience, Base extinction and legal basis, majorations, accise/CSPE alias, TCFE, CTA flag, VAT), so any change fails plain `npm test`. Printed items that are not tariff data are excluded on purpose (see the gen-prices.mjs header): electricity origin mix (percentages), EDF address/capital/RCS/phone, chèque énergie text, CGV article references, the taxes.edf.com mention.
- **FR-023** [US-2,4]: The embedded Tempo calendar MUST cover 2022-09-01.. and MUST satisfy 300/43/22 per complete season and match counter-derived colours in the Tempo era, else the build fails.

## Acceptance Criteria

- AC-1 [US-1 happy path]: A synthetic index file with 3 gap deltas of 2 days and one boundary day yields 6 estimated days and the boundary day excluded → matches the hand-computed reference.
- AC-2 [US-1, C-4]: Decreasing index, duplicate date, NUL bytes or > 5 MB → French error with physical line, nothing loaded.
- AC-3 [US-2 happy path, C-5]: Known day priced by hand for Base, HC/HP and Tempo on grids 20260201 and 20260801 at 9 kVA → equal to engine output to the micro-euro.
- AC-4 [US-2, C-6]: Tempo at 3 kVA, or 24 kVA over a period before 2026-08 → shown unavailable and excluded from the sum and from "cheapest".
- AC-5 [US-2, C-1]: A day in an HC/HP period uses the calendar colour and the UI shows the estimate notice; a day in a Tempo period uses counters; the UI lists both detected periods with their dates.
- AC-14 [US-2,3, FR-024]: The assumptions box is visible, in French, and lists the dynamic items that apply to the loaded data.
- AC-6 [US-3 happy path, C-8]: Default period is the 365 days ending on the last priced day with all three offers; recap equals the sum of the per-day costs.
- AC-7 [US-3, C-9]: Peak file with max 8200 VA pre-selects 9 kVA; absent file gives 6 kVA flagged; manual change recomputes.
- AC-8 [US-4 happy path, C-10]: Month granularity over the default period draws 13 groups of 3 stacked bars plus HC/HP strips; red day bars are red.
- AC-9 [US-4, C-11]: A period > 400 days disables day granularity with a message.
- AC-10 [US-5 happy path, C-13]: Source and bundle contain none of the forbidden APIs (FR-018).
- AC-11 [US-5, C-12]: Meta CSP present first in head with no connect-src and no inline script/style; `_headers` present; dist contains exactly the five files.
- AC-12 [US-5, C-4]: A CSV cell/line containing `<img onerror>` is displayed as text only.
- AC-13 [US-2, C-14]: Generated price table and extra data (title, date, majorations, accise/CSPE/TCFE, VAT, CTA, Base extinction) equal an independent re-parse of the PDFs (when present) and the api 2026-08 Tempo prices, and equal the committed exact pins (SHA-256 of the tables, literal extras) in every run, mutation-checked; calendar passes 300/43/22 and the counter cross-check.
- AC-15 [US-4, FR-025]: Year groups carry a month-view drill target of their year and month groups a day-view target of their month (ranges clamped to the priced range, independent of the selected period, day groups without target, aria hint, Retour levels, view titles) → CHECK-3; browser smoke: clicking a year then a month shows the month then the day view with 'Retour' and the 'Vue :' title.
- AC-16 [US-4, FR-026]: The 'Aller à' option model lists only years in period-based views, only the months of the selected year in a year's month view, the months of the month's year (current one selected) in a day view, and every option value maps to the right view → CHECK-3.
- AC-17 [US-4, FR-027]: Every group has tooltip lines and an aria-label; no readout element exists in the chart card (browser smoke: only the SVG bubble appears on hover) → CHECK-3 and smoke.
- AC-18 [US-4, FR-028]: The bar label rule returns full / one-letter / none from the bar width with the 0.62 em estimate, and labels fit inside their bars at year, month and day level → CHECK-3.
- AC-19 [US-4, FR-029]: The legend model has one block per selected offer, in bar order, with exactly the specified entries, tags, hatch/dots flags and unavailable-offer notes, plus the ratio block → CHECK-3.
- AC-20 [US-2,3, FR-030]: The tariffs model returns one section per grid applied in the period with correct grid date and sub-range (straddling 2026-07-31/2026-08-01 -> 2 sections with different Tempo prices equal to the grid values at 9 kVA), flags last-grid reuse, marks offers lacking the kVA row unavailable, honours the offer selection, and derives the source label from the grid date (no file name, no '.pdf'), exposes the full Tempo/HC-HP/Base tables with every kVA row and the selected kVA flagged, lists taxes/majorations/Base extinction only when the grid prints them; full-grid captions use the offer labels ('Option Heures creuses / Heures pleines'), the Base extinction range and its legal basis (when printed), the CSPE/TICFE alias, the Linky and no-index qualifiers, no U+2019 in displayed facts, the source label follows grid.audience and grid.appliesFrom; French formats with no-break spaces '19,56 €', '19,27 c€/kWh', '3,085 c€/kWh HTVA', '9,60 € / an HT', '20 %' → CHECK-7; browser smoke: the card is last in the page, updates with kVA/offers, details closed by default with distinct dated summaries, the highlight and `aria-current` on exactly the rows of the chosen kVA, hidden before a file is loaded.
- AC-21 [US-4, FR-031]: The view recap titles follow the view; per-offer totals equal the sum of the scene's bar totals for period/year/month views and the main recap total in period-based views; cheapest badge only with >= 2 compared offers (ties all badged); unavailable offers (kVA 3) read 'indisponible' with the pricing reason; counts text omits zero estimated/excluded → CHECK-8; browser smoke: the block equals the main recap by default, follows year/month drill-down (year = sum of its months), Retour and kVA changes.
- (AC-22 is intentionally unused: numbering kept stable.)
- AC-23 [US-3, FR-032]: For synthetic multi-year data (with an excluded boundary day and a gap) the shortcuts return the full priced range, 365 days (= defaultPeriod) and 730 days ending on the last priced day; for 8-month and exactly-365-day data the longer windows are clamped with availableDays N and the French message; no priced day gives null; the pressed helper matches the applied period (both buttons when windows coincide); results do not depend on TZ; with TEMPO_DEMO_DATA=1 the ranges equal an independent scan of the demo CSV → CHECK-9; browser smoke: buttons disabled before loading, a click sets the inputs, recap title, tariffs and chart period view, aria-pressed on exactly the matching buttons, a manual date edit unpresses.

## Edge Cases

- EC-1 [US-1]: Duplicate dates → refused (FR-005). EC-2 [US-1]: Unordered rows → accepted, sorted. EC-3 [US-1]: Flat counters → 0 kWh. EC-4 [US-1]: Bucket becomes empty mid-era → refused as malformed. EC-5 [US-1]: Missing/mangled header → refused "format non reconnu". EC-6 [US-1]: CRLF/BOM → tolerated. EC-7 [US-1]: Gap at file edge → not applicable (gaps are between readings). EC-8 [US-1]: Decrease inside a gap → refused. EC-9 [US-2]: 0 kWh day → subscription only. EC-10 [US-2]: Period crossing a grid change → per-day grid. EC-11 [US-2]: Day after last grid → last grid reused, noted. EC-12 [US-2]: Calendar colour unknown for a pre-2025 day → build failure (calendar must be complete). EC-14 [US-3]: Start > end → message, previous period kept. EC-15 [US-3]: No offer selected → empty recap with hint. EC-16 [US-3]: Peak above 36 kVA → 36. EC-17 [US-3]: Peak file dropped first → kept, applies when index arrives. EC-19 [US-4]: Period shorter than a bucket → partial bucket labelled. EC-20 [US-4]: Different magnitudes → shared axis. EC-21 [US-4]: Offer unavailable → no bars, legend notes it. EC-23 [US-5]: HTML in file content → text only. EC-24 [US-5]: JavaScript disabled → `noscript` message in French. EC-25 [US-1]: Second file of same kind → replaces the first.

## Runnable Checks

All are plain self-contained scripts: exit 0 = pass, 1 = assertion fired, >= 2 = error.
- CHECK-1 [AC-1, AC-2, AC-12]: `node scripts/check-import.mjs` → parses sample fixtures and malformed fixtures, exit 0.
- CHECK-2 [AC-3, AC-4, AC-5, AC-6, AC-7, AC-14]: `node scripts/check-pricing.mjs` → hand-computed reference days and recap, exit 0.
- CHECK-3 [AC-8, AC-9, AC-15, AC-16, AC-17, AC-18, AC-19]: `node scripts/check-chart.mjs` → builds the pure chart scene (the DOM layer only maps scene to SVG): group/bar counts, stacking order, day-disable rule, drill-down ranges and targets, 'Aller à' option model, bar label fit rule, legend model, exit 0.
- CHECK-4 [AC-10, AC-12]: `node scripts/check-forbidden-apis.mjs` → scans src/ and dist/ for FR-018 patterns, exit 0.
- CHECK-5 [AC-11]: `node scripts/check-dist.mjs` → CSP meta first in head, no connect-src, five-file dist, `_headers` content, exit 0.
- CHECK-6 [AC-13]: `node scripts/check-data-prices.mjs` → price table sanity, exact pins, api cross-check and independent PDF re-parse (when PDFs present), then `node scripts/check-data-calendar.mjs` → calendar 300/43/22 and counter cross-check, exit 0.
- CHECK-7 [AC-20]: `node scripts/check-tariffs.mjs` → pure 'Tarifs appliqués' model on synthetic periods (sections per grid, ranges, reuse flag, unavailable rows, offer filter, source label/file, French formats, full-grid tables, taxes/majorations lines), exit 0.
- CHECK-8 [AC-21]: `node scripts/check-viewrecap.mjs` → pure view recap on synthetic data (titles, sum-of-bars invariant for period/year/month views, main recap equality, cheapest/ties/unavailable, counts text), exit 0.
- CHECK-9 [AC-23]: `node scripts/check-shortcuts.mjs` → pure period shortcuts on synthetic days (windows, defaultPeriod equality, clamping/availableDays/message, null, pressed matching, TZ independence) plus, with TEMPO_DEMO_DATA=1, exact ranges on the committed demo export, exit 0.

## Claims Metadata

```claims
{"record":"claims-header","schema_version":1,"namespace":"tempo-simulator","spec_lifecycle":"draft"}
```
(claims validator not installed in this project; per-item records omitted and unvalidated.)

## Entities

- `IndexRow`: one dated reading of cumulative kWh counters, by bucket.
- `DayConsumption`: kWh per bucket for one calendar day, with an estimated flag.
- `Grid`: EDF price table effective from a date, per offer and kVA.
- `Offer`: Base, HC/HP or Tempo.
- `Period`: inclusive civil-date range clamped to priced days.

## Test harness note (plan phase)
Checks are plain Node scripts run against esbuild-bundled TypeScript (`npm test` runs `scripts/run-checks.mjs`); Vitest is not used. Checks run on synthetic fixtures generated by `scripts/gen-fixtures.mjs`; the committed synthetic demo CSVs (`tests/demo-data/`, generated by `scripts/gen-demo-data.mjs`) add optional assertions when `TEMPO_DEMO_DATA=1`.
