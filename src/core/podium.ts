// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure podium ranking of the available offers and the savings sentence. No DOM, integer arithmetic only.
 *  Ranks, ties and gaps use the totals rounded to the cent, exactly as displayed, so that the amounts of the sentence are the
 *  differences a reader computes from the displayed totals. */
import { OFFER_IDS, OfferId } from './pricing';
import { formatEuro } from './format';

export interface PodiumRowInput { offer: OfferId; available: boolean; totalMicro: number }
export interface PodiumEntry {
  offer: OfferId;
  name: string; // card title ('Tarif de base' for the Base offer)
  totalMicro: number;
  rank: number; // competition rank: tied offers share it (1, 1, 3)
  rankLabel: string; // '1ᵉʳ', '2ᵉ', '3ᵉ', with ' ex æquo' when the rank is shared
  winner: boolean; // among the cheapest offers
  gapMicro: number; // extra cost versus the cheapest offer(s), 0 for the winners
  gapText: string; // '+ 182,25 € par rapport à Tempo' ('' for the winners)
}
export interface Podium {
  entries: PodiumEntry[]; // ranking order: cheapest first
  sentence: string; // the savings sentence ('égalité' wording when nothing is saved)
  summary: string; // one text for screen readers
}

/** Names: the Base offer is called 'tarif de base' in the podium wording, the other names are unchanged. */
export const PODIUM_NAME: Record<OfferId, string> = { tempo: 'Tempo', hchp: 'Heures creuses / Heures pleines', base: 'Tarif de base' };
const SUBJECT: Record<OfferId, string> = { tempo: 'Tempo', hchp: 'Heures creuses / Heures pleines', base: 'le tarif de base' };
const VERSUS: Record<OfferId, string> = { tempo: 'à Tempo', hchp: 'à Heures creuses / Heures pleines', base: 'au tarif de base' };
const RANK_LABEL = ['', '1ᵉʳ', '2ᵉ', '3ᵉ'];
const CENT = 10000; // micro-euros per cent
const cents = (micro: number): number => Math.round(micro / CENT);

/** Savings sentence for offers sorted cheapest first (at least two). `estimation` makes the amount approximate. */
function savingsSentence(sorted: Array<{ offer: OfferId; cents: number }>, estimation: boolean): string {
  const best = sorted[0]!.cents;
  const winners = sorted.filter((e) => e.cents === best);
  const losers = sorted.filter((e) => e.cents !== best).sort((a, b) => b.cents - a.cents);
  if (losers.length === 0) {
    return sorted.length === 2
      ? `${SUBJECT[sorted[0]!.offer]} et ${SUBJECT[sorted[1]!.offer]} coûtent la même chose sur cette période.`
      : 'Les trois offres coûtent la même chose sur cette période.';
  }
  const who = winners.map((w) => SUBJECT[w.offer]).join(' et ');
  const verb = estimation ? 'vous économisez environ' : 'vous économisez';
  const gap = (l: { cents: number }) => formatEuro((l.cents - best) * CENT);
  const l1 = losers[0]!;
  if (losers.length === 1) return `Avec ${who}, ${verb} ${gap(l1)} par rapport ${VERSUS[l1.offer]}.`;
  const l2 = losers[1]!;
  if (l1.cents === l2.cents) return `Avec ${who}, ${verb} ${gap(l1)} par rapport ${VERSUS[l1.offer]} et ${VERSUS[l2.offer]}.`;
  return `Avec ${who}, ${verb} ${gap(l1)} par rapport ${VERSUS[l1.offer]} (et ${gap(l2)} par rapport ${VERSUS[l2.offer]}).`;
}

/** The podium of the available offers; null when fewer than two are available (nothing to rank). */
export function buildPodium(rows: PodiumRowInput[], estimation = false): Podium | null {
  const sorted = rows
    .filter((r) => r.available)
    .map((r) => ({ ...r, cents: cents(r.totalMicro) }))
    .sort((a, b) => a.cents - b.cents || OFFER_IDS.indexOf(a.offer) - OFFER_IDS.indexOf(b.offer));
  if (sorted.length < 2) return null;
  const best = sorted[0]!.cents;
  const winners = sorted.filter((r) => r.cents === best);
  const ranks: number[] = [];
  sorted.forEach((r, i) => ranks.push(i > 0 && r.cents === sorted[i - 1]!.cents ? ranks[i - 1]! : i + 1));
  const entries: PodiumEntry[] = sorted.map((r, i) => {
    const winner = r.cents === best;
    const gapMicro = (r.cents - best) * CENT;
    const shared = ranks.filter((k) => k === ranks[i]).length > 1;
    const versus = winners.length === 1 ? VERSUS[winners[0]!.offer] : 'aux moins chères';
    return {
      offer: r.offer,
      name: PODIUM_NAME[r.offer],
      totalMicro: r.totalMicro,
      rank: ranks[i]!,
      rankLabel: `${RANK_LABEL[ranks[i]!] ?? `${ranks[i]}ᵉ`}${shared ? ' ex æquo' : ''}`,
      winner,
      gapMicro,
      gapText: winner ? '' : `+ ${formatEuro(gapMicro)} par rapport ${versus}`,
    };
  });
  const sentence = savingsSentence(sorted, estimation);
  const list = entries.map((e) => `${e.rankLabel} : ${e.name} ${formatEuro(e.totalMicro)}${e.winner ? '' : ` (+ ${formatEuro(e.gapMicro)})`}`).join('. ');
  return { entries, sentence, summary: `Classement des offres. ${list}. ${sentence}` };
}
