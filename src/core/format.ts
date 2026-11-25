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

const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** ISO date -> "1er février 2026". */
export function frLongDate(iso: string): string {
  const d = Number(iso.slice(8, 10));
  return `${d === 1 ? '1er' : String(d)} ${FR_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Integer micro-euros per kWh -> "19,27 c€/kWh" (cents with two decimals). */
export function formatCentsPerKwh(microPerKwh: number): string {
  const c = Math.round(microPerKwh / 100); // hundredths of a cent
  const whole = Math.floor(c / 100);
  return `${whole},${String(c - whole * 100).padStart(2, '0')} c€/kWh`;
}

/** Integer micro-euros per kWh -> "19,27" (two decimals, no unit; for table cells whose header carries the unit). */
export function formatCentsNumber(microPerKwh: number): string {
  return formatCentsPerKwh(microPerKwh).replace(' c€/kWh', '');
}

/** Integer micro-euros -> "19,56" (two decimals, no unit). */
export function formatEuroNumber(micro: number): string {
  return formatEuro(micro).replace(' €', '');
}

/** Integer micro-euros per kWh -> "3,085 c€/kWh HTVA" (no-break space before HTVA; cents with 2 to 4 decimals, trailing zeros trimmed down to 2). */
export function formatCentsPerKwhHtva(microPerKwh: number): string {
  const whole = Math.floor(microPerKwh / 10000);
  let frac = String(microPerKwh - whole * 10000).padStart(4, '0');
  while (frac.length > 2 && frac.endsWith('0')) frac = frac.slice(0, -1);
  return `${whole},${frac} c€/kWh HTVA`;
}

/** Integer micro-euros per year -> "9,60 € / an HT" (no-break spaces, so the value never wraps from its unit). */
export function formatEuroPerYearHt(micro: number): string {
  return `${formatEuro(micro)} / an HT`;
}

/** Percentage -> "5,5 %" / "20 %" (non-breaking space before the sign). */
export function formatPercent(p: number): string {
  return `${String(p).replace('.', ',')} %`;
}

/** Whole-number grouped digits ('1 234', thousands separator U+202F as in formatEuro); tenths are kept only for a non-integer input. */
export function formatKwhNumber(kwh: number): string {
  const tenths = Math.round(Math.abs(kwh) * 10);
  const whole = Math.floor(tenths / 10);
  const frac = tenths - whole * 10;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${kwh < 0 ? '-' : ''}${grouped}${Number.isInteger(kwh) ? '' : `,${frac}`}`;
}

/** kWh -> "1 234 kWh" (no-break space before the unit). */
export function formatKwh(kwh: number): string {
  return `${formatKwhNumber(kwh)} kWh`;
}
