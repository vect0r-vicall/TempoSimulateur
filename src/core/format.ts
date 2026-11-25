// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure display helpers (French formatting of civil dates and integer micro-euros). */

export function frDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Integer micro-euros -> "1 234,57 €" (rounded to the cent with integer arithmetic only). */
export function formatEuro(micro: number): string {
  const neg = micro < 0;
  const cents = Math.round(Math.abs(micro) / 10000);
  const euros = Math.floor(cents / 100);
  const cc = String(cents - euros * 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${grouped},${cc} €`;
}

/** "N jours (d1, d2, ...)" with at most `max` dates, for a possibly huge list of ISO dates. */
export function frDateList(dates: string[], max = 10): string {
  const n = dates.length;
  const shown = dates.slice(0, max).map(frDate).join(', ');
  return `${n} jour${n > 1 ? 's' : ''} (${shown}${n > max ? `, … ; ${max} premières dates affichées` : ''})`;
}

/** File name for display: bidi controls removed, at most 60 characters. */
export function displayName(name: string): string {
  const t = name.replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}
