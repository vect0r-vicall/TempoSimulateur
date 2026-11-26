// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
// CHECK-19 [FR-067, FR-068]: podium ranking of the available offers and the savings sentence (pure model, independent expectations),
// its use by the recaps, and the podium CSS/DOM rules (step heights, placement, tokens only). Synthetic data only.
import { readFileSync } from 'node:fs';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FAIL: ' + m); } else console.log('ok: ' + m); };
// formatEuro uses U+202F between thousands and U+00A0 before the euro sign: expectations are written with plain spaces
const fr = (v) => (typeof v === 'string' ? v.replace(/(\d) €/g, '$1\u00A0€').replace(/(\d) (\d{3})(?=,)/g, '$1\u202F$2') : Array.isArray(v) ? v.map(fr) : v);
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(fr(w)), `${m} (got ${JSON.stringify(g)}, want ${JSON.stringify(fr(w))})`);

const { buildPodium, PODIUM_NAME } = await import('../.build-test/core/podium.mjs');
const { analyse, buildRecap } = await import('../.build-test/core/recap.mjs');
const { viewRecap } = await import('../.build-test/core/viewrecap.mjs');
const { formatEuro } = await import('../.build-test/core/format.mjs');

const E = (euros) => Math.round(euros * 100) * 10000; // integer micro-euros from a euro amount with cents
const row = (offer, euros, available = true) => ({ offer, available, totalMicro: E(euros) });

// ---- three offers: the demo figures ----
const p3 = buildPodium([row('base', 1608.59), row('tempo', 1372.85), row('hchp', 1555.10)]);
eq(p3.entries.map((e) => e.offer), ['tempo', 'hchp', 'base'], 'ranking order is cheapest first, whatever the input order');
eq(p3.entries.map((e) => e.rank), [1, 2, 3], 'ranks 1, 2, 3');
eq(p3.entries.map((e) => e.rankLabel), ['1ᵉʳ', '2ᵉ', '3ᵉ'], 'rank labels');
eq(p3.entries.map((e) => e.name), ['Tempo', 'Heures creuses / Heures pleines', 'Tarif de base'], "the Base offer is named 'Tarif de base', the others keep their names");
eq(p3.entries.map((e) => e.winner), [true, false, false], 'only the cheapest is the winner');
eq(p3.entries.map((e) => e.gapText), ['', '+ 182,25 € par rapport à Tempo', '+ 235,74 € par rapport à Tempo'], 'gaps of the 2nd and 3rd against the winner');
eq(p3.sentence, 'Avec Tempo, vous économisez 235,74 € par rapport au tarif de base (et 182,25 € par rapport à Heures creuses / Heures pleines).', 'savings sentence: most expensive first, then the parenthesis for the middle offer');
ok(!/%/.test(p3.sentence), 'no percentage in the sentence');
eq(p3.summary, 'Classement des offres. 1ᵉʳ : Tempo 1 372,85 €. 2ᵉ : Heures creuses / Heures pleines 1 555,10 € (+ 182,25 €). 3ᵉ : Tarif de base 1 608,59 € (+ 235,74 €). ' + p3.sentence, 'screen reader summary');
eq(PODIUM_NAME, { tempo: 'Tempo', hchp: 'Heures creuses / Heures pleines', base: 'Tarif de base' }, 'podium names');

// other winner: the base tariff wins
const pb = buildPodium([row('tempo', 1500), row('hchp', 1400), row('base', 1300)]);
eq(pb.sentence, 'Avec le tarif de base, vous économisez 200,00 € par rapport à Tempo (et 100,00 € par rapport à Heures creuses / Heures pleines).', "winner 'le tarif de base' in the sentence");
eq(pb.entries.map((e) => e.offer), ['base', 'hchp', 'tempo'], 'reversed ranking');

// ---- two offers: no parenthesis ----
const p2 = buildPodium([row('tempo', 1372.85), row('hchp', 1555.10)]);
eq(p2.sentence, 'Avec Tempo, vous économisez 182,25 € par rapport à Heures creuses / Heures pleines.', 'two offers: one comparison, no parenthesis');
eq(p2.entries.length, 2, 'two entries');
const p2b = buildPodium([row('hchp', 1555.10), row('base', 1608.59)]);
eq(p2b.sentence, 'Avec Heures creuses / Heures pleines, vous économisez 53,49 € par rapport au tarif de base.', 'two offers without Tempo');

// ---- unavailable offers are out of the ranking; fewer than two available: no podium ----
eq(buildPodium([row('tempo', 0, false), row('hchp', 1555.10), row('base', 1608.59)]).entries.map((e) => e.offer), ['hchp', 'base'], 'an unavailable offer is not ranked');
eq(buildPodium([row('tempo', 0, false), row('hchp', 1555.10), row('base', 0, false)]), null, 'one available offer: no podium');
eq(buildPodium([row('tempo', 1372.85)]), null, 'one selected offer: no podium');
eq(buildPodium([]), null, 'no offer: no podium');

// ---- estimation: the amount is approximate ----
eq(buildPodium([row('tempo', 1372.85), row('hchp', 1555.10), row('base', 1608.59)], true).sentence,
  'Avec Tempo, vous économisez environ 235,74 € par rapport au tarif de base (et 182,25 € par rapport à Heures creuses / Heures pleines).', 'estimation: vous économisez environ');

// ---- ties share the rank ----
const t3 = buildPodium([row('tempo', 1000), row('hchp', 1000), row('base', 1000)]);
eq(t3.entries.map((e) => e.rank), [1, 1, 1], 'three-way tie: all rank 1');
eq(t3.entries.map((e) => e.rankLabel), ['1ᵉʳ ex æquo', '1ᵉʳ ex æquo', '1ᵉʳ ex æquo'], "tied labels say 'ex æquo'");
eq(t3.sentence, 'Les trois offres coûtent la même chose sur cette période.', 'three-way tie sentence');
eq(t3.entries.every((e) => e.winner && e.gapText === ''), true, 'tied winners have no gap');
const t2 = buildPodium([row('tempo', 1000), row('base', 1000)]);
eq(t2.sentence, 'Tempo et le tarif de base coûtent la même chose sur cette période.', 'two-offer tie sentence');
const tw = buildPodium([row('tempo', 1000), row('hchp', 1000), row('base', 1100)]);
eq(tw.entries.map((e) => e.rank), [1, 1, 3], 'competition ranking: 1, 1, 3');
eq(tw.entries.map((e) => e.rankLabel), ['1ᵉʳ ex æquo', '1ᵉʳ ex æquo', '3ᵉ'], 'labels with two tied winners');
eq(tw.sentence, 'Avec Tempo et Heures creuses / Heures pleines, vous économisez 100,00 € par rapport au tarif de base.', 'two winners, one loser');
eq(tw.entries[2].gapText, '+ 100,00 € par rapport aux moins chères', 'gap against several tied winners');
const tl = buildPodium([row('tempo', 1000), row('hchp', 1200), row('base', 1200)]);
eq(tl.entries.map((e) => e.rank), [1, 2, 2], 'tied losers share rank 2');
eq(tl.sentence, 'Avec Tempo, vous économisez 200,00 € par rapport à Heures creuses / Heures pleines et au tarif de base.', 'two tied losers in one comparison');

// ---- the amounts are the differences of the DISPLAYED (cent-rounded) totals, never of the exact micro-euro values ----
// tempo 1372,854999 -> 1 372,85 shown; base 1608,585001 -> 1 608,59 shown: displayed difference 235,74 while the exact one is 235,730002
const odd = buildPodium([{ offer: 'tempo', available: true, totalMicro: 1372854999 }, { offer: 'hchp', available: true, totalMicro: 1555104999 }, { offer: 'base', available: true, totalMicro: 1608585001 }]);
eq(odd.entries.map((e) => formatEuro(e.totalMicro)), ['1 372,85 €', '1 555,10 €', '1 608,59 €'], 'rounded display of the three totals');
eq(odd.sentence, 'Avec Tempo, vous économisez 235,74 € par rapport au tarif de base (et 182,25 € par rapport à Heures creuses / Heures pleines).', 'sentence amounts equal the difference of the displayed totals (1 608,59 − 1 372,85)');
// totals that differ by less than a cent but display the same are a tie
const sub = buildPodium([{ offer: 'tempo', available: true, totalMicro: 1000000001 }, { offer: 'hchp', available: true, totalMicro: 1000003000 }]);
eq([sub.entries.map((e) => e.rank), sub.sentence], [[1, 1], 'Tempo et Heures creuses / Heures pleines coûtent la même chose sur cette période.'], 'totals equal at the cent are tied');
eq(buildPodium([row('tempo', 1372.85), row('hchp', 1555.10), row('base', 1608.59)]).entries.map((e) => e.offer), buildPodium([row('hchp', 1555.10), row('base', 1608.59), row('tempo', 1372.85)]).entries.map((e) => e.offer), 'input order does not matter');

// ---- used by the recaps ----
const MS = 86400000;
const iso = (n) => new Date(n * MS).toISOString().slice(0, 10);
const num = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS);
const days = [];
for (let n = num('2025-01-01'); n <= num('2025-12-31'); n++) days.push({ date: iso(n), kind: 'hchp', kwh: { hc: 4 + (n % 3), hp: 6 + (n % 4) }, estimated: false });
const imp = { days, excluded: [] };
const period = { from: '2025-01-01', to: '2025-12-31' };
const ALL = ['tempo', 'hchp', 'base'];
const a9 = analyse(imp, period, 9);
const r9 = buildRecap(a9, ALL);
ok(r9.podium && r9.podium.entries.length === 3, 'recap: three available offers give a three-step podium');
eq(r9.podium.entries.map((e) => e.totalMicro), [...r9.rows].sort((x, y) => x.totalMicro - y.totalMicro).map((x) => x.totalMicro), 'recap: podium totals are the recap totals, ranked');
ok(r9.podium.sentence.startsWith('Avec ') && r9.podium.sentence.includes('environ'), 'recap: an HC/HP period estimates Tempo with the calendar, so the amount is approximate');
// 2022 grids carry no Tempo price at 6 kVA: Tempo is unavailable, HC/HP and Base are ranked
const days22 = [];
for (let n = num('2022-03-01'); n <= num('2022-12-31'); n++) days22.push({ date: iso(n), kind: 'hchp', kwh: { hc: 4, hp: 6 }, estimated: false });
const r6 = buildRecap(analyse({ days: days22, excluded: [] }, { from: '2022-03-01', to: '2022-12-31' }, 6), ALL);
ok(r6.rows.find((x) => x.offer === 'tempo' && !x.available) && r6.podium && r6.podium.entries.length === 2 && r6.podium.entries.every((e) => e.offer !== 'tempo'), 'recap: an unavailable Tempo is out of the podium, the two other offers are ranked');
eq(buildRecap(a9, ['tempo']).podium, null, 'recap: a single selected offer has no podium');
// estimated days (a reading gap spread over several days) make the amount approximate even without Tempo in the comparison
const daysGap = days.map((d, i) => ({ ...d, estimated: i >= 100 && i < 103 }));
const rGap = buildRecap(analyse({ days: daysGap, excluded: [] }, period, 9), ['hchp', 'base']);
ok(rGap.podium && rGap.podium.sentence.includes('vous économisez environ') && !rGap.calendarEstimate, 'estimated days alone (no Tempo) make the sentence approximate');
const rNoGap = buildRecap(a9, ['hchp', 'base']);
ok(rNoGap.podium && !rNoGap.podium.sentence.includes('environ'), 'exact days and no Tempo estimate: the sentence is exact');
const vr = viewRecap({ kind: 'period', gran: 'month' }, a9, ALL);
eq(vr.podium, r9.podium, 'view recap: same podium as the main recap on the same range');
ok(vr.summary.includes(vr.podium.sentence), 'view recap: the aria summary carries the savings sentence');
eq(viewRecap({ kind: 'period', gran: 'month' }, a9, ['base']).podium, null, 'view recap: one offer, no podium');

// ---- CSS and DOM rules ----
const css = readFileSync('src/app.css', 'utf8');
const block = css.slice(css.indexOf('/* podium'), css.indexOf('/* recap */'));
ok(block.length > 500, 'podium CSS block found');
ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block), 'podium CSS uses theme tokens only (no literal colour)');
ok(!/transition|animation/.test(block), 'podium CSS has no motion');
const rem = (sel) => { const m = new RegExp(`${sel.replace(/[.\s]/g, (c) => '\\' + c)}\\s*\\{[^}]*height:\\s*([\\d.]+)rem`).exec(block); return m ? Number(m[1]) : NaN; };
const [h1, h2, h3] = ['.pod-r1 .pod-step', '.pod-r2 .pod-step', '.pod-r3 .pod-step'].map(rem);
ok(h1 > h2 && h2 > h3 && h3 > 0, `step heights decrease from 1st to 3rd (${h1} > ${h2} > ${h3} rem)`);
const [c1, c2, c3] = ['.podium.compact .pod-r1 .pod-step', '.podium.compact .pod-r2 .pod-step', '.podium.compact .pod-r3 .pod-step'].map(rem);
ok(c1 > c2 && c2 > c3 && c3 > 0 && c1 < h1, `compact step heights decrease and are smaller (${c1} > ${c2} > ${c3} rem)`);
ok(/\.pod-pos-1\s*\{\s*order:\s*2;\s*\}/.test(block) && /\.pod-pos-2\s*\{\s*order:\s*1;\s*\}/.test(block) && /\.pod-pos-3\s*\{\s*order:\s*3;\s*\}/.test(block), '2nd left, 1st centre, 3rd right by CSS order (DOM stays in ranking order)');
ok(/@media \(max-width: 520px\)[\s\S]*\.pod-card/.test(block), 'narrow-screen rules exist (390 px phones)');
const narrow = block.slice(block.indexOf('@media (max-width: 520px)'), block.indexOf('@media (max-width: 360px)')); // the 520 px block only
ok(/\.podium\.compact \.pod-total\s*\{[^}]*font-size/.test(narrow) && /\.podium\.compact \.pod-winner \.pod-total\s*\{[^}]*font-size/.test(narrow), 'narrow rules also shrink the COMPACT podium (its desktop rules are more specific and would otherwise win)');
ok(/@media \(max-width: 360px\)/.test(block), 'very narrow rules exist (320 px phones)');
const sizes = [...block.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
ok(sizes.length > 10 && Math.min(...sizes) >= 0.66, `no podium text below 0.66rem (smallest ${Math.min(...sizes)}rem)`);
ok(/\.view-podium:empty,\s*\.view-offers:empty\s*\{\s*display:\s*none;\s*\}/.test(block), 'empty podium and list containers of the view recap are hidden');
const ui = readFileSync('src/ui/podium.ts', 'utf8');
ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(ui) && /node\('ol'/.test(ui) && /ol\.setAttribute\('aria-label', 'Classement des offres'\)/.test(ui), 'podium DOM: ordered list with an accessible name, text through textContent');
ok(/step\.setAttribute\('aria-hidden', 'true'\)/.test(ui) && /icon\.setAttribute\('aria-hidden', 'true'\)/.test(ui), 'decorative steps and the emoji are hidden from screen readers');
ok(/node\('span', 'badge', 'Le moins cher'\)/.test(ui), "the winner carries the 'Le moins cher' badge");
const recapUi = readFileSync('src/ui/recap.ts', 'utf8');
const chartUi = readFileSync('src/ui/chart.ts', 'utf8');
ok(/renderPodium\(r\.podium, false\)/.test(recapUi) && /renderPodium\(rec\.podium, true\)/.test(chartUi), 'both recaps render the podium (main full size, view recap compact)');
ok(/if \(r\.podium && row\.available\) continue;/.test(recapUi) && /if \(rec\.podium && r\.available\) continue;/.test(chartUi), 'available offers are not listed twice: with a podium only the unavailable ones stay in the list');

process.exit(failures ? 1 : 0);
