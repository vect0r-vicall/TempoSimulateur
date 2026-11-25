// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure weather helpers (FR-033..FR-040): strict validation of Open-Meteo payloads, aggregation, smoothing, French formatting.
 *  No DOM, no network, no clock: civil dates are YYYY-MM-DD strings only. */
import { isValidIso } from './period';
import { dayNum } from './days';

/** One civil day of weather. `code` (WMO), `windKmh` (daily mean speed) and `windDeg` (dominant direction, the wind ORIGIN, [0,360))
 *  are optional: absent means the same as null (not provided). */
export interface DailyTemp {
  date: string; mean: number | null; min: number | null; max: number | null;
  code?: number | null; windKmh?: number | null; windDeg?: number | null;
}
export interface Place { label: string; latitude: number; longitude: number }
export interface WindAggregate { speed: number | null; deg: number | null; covered: number; total: number }
export interface TempAggregate { mean: number | null; min: number | null; max: number | null; covered: number; total: number }

export const TEMP_MIN = -90;
export const TEMP_MAX = 60;
export const WIND_MAX = 300;
export const MAX_PLACES = 5;
/** WMO weather codes accepted from the provider (anything else is treated as missing). */
export const WMO_CODES: readonly number[] = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
/** Hard ceiling on the days of one archive response (imports span at most 25 years). */
export const HARD_MAX_DAYS = 25 * 366 + 1;
const MAX_LABEL = 80;

export type ParsedWeather = { ok: true; days: DailyTemp[]; missing: number } | { ok: false; reason: string };
export type ParsedPlaces = { ok: true; places: Place[] } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rounds a coordinate to 0.1 degree (privacy: the archive request never carries a precise position). */
export function roundCoord(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

function cleanText(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001F\u007F-\u009F<>]/g, ' ').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
}

function tempOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= TEMP_MIN && v <= TEMP_MAX ? v : null;
}

function codeOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && WMO_CODES.includes(v) ? v : null;
}
function windOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= WIND_MAX ? v : null;
}
/** Direction in degrees normalised to [0,360) (360 -> 0); null when not finite or outside 0..360. */
function dirOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 360 ? v % 360 : null;
}

/** True when the day carries at least one valid value (temperature, weather code or wind). */
export function dayHasData(d: DailyTemp): boolean {
  return d.mean !== null || d.min !== null || d.max !== null || (d.code ?? null) !== null || (d.windKmh ?? null) !== null || (d.windDeg ?? null) !== null;
}

/** Strict validation of an archive response for the requested inclusive civil-date window. */
export function parseWeatherResponse(json: unknown, startDate: string, endDate: string): ParsedWeather {
  const bad = (reason: string): ParsedWeather => ({ ok: false, reason });
  if (!isValidIso(startDate) || !isValidIso(endDate) || startDate > endDate) return bad('window');
  if (!isObj(json) || !isObj(json['daily'])) return bad('shape');
  const d = json['daily'];
  const time = d['time'], mean = d['temperature_2m_mean'], min = d['temperature_2m_min'], max = d['temperature_2m_max'];
  if (!Array.isArray(time) || !Array.isArray(mean) || !Array.isArray(min) || !Array.isArray(max)) return bad('arrays');
  const opt = (k: string): unknown[] | null | 'bad' => (d[k] === undefined ? null : Array.isArray(d[k]) ? (d[k] as unknown[]) : 'bad'); // provider may omit an optional variable
  const code = opt('weather_code'), wind = opt('wind_speed_10m_mean'), dir = opt('wind_direction_10m_dominant');
  if (code === 'bad' || wind === 'bad' || dir === 'bad') return bad('arrays');
  const expected = dayNum(endDate) - dayNum(startDate) + 1; // inclusive civil-date span of the requested window
  if (time.length > expected || time.length > HARD_MAX_DAYS) return bad('too many days');
  if (mean.length !== time.length || min.length !== time.length || max.length !== time.length) return bad('length mismatch');
  for (const a of [code, wind, dir]) if (a !== null && a.length !== time.length) return bad('length mismatch');
  const days: DailyTemp[] = [];
  const seen = new Set<string>();
  let missing = 0;
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    if (typeof t !== 'string' || !isValidIso(t)) return bad('date');
    if (t < startDate || t > endDate || seen.has(t)) return bad('date window');
    seen.add(t);
    const day: DailyTemp = {
      date: t, mean: tempOrNull(mean[i]), min: tempOrNull(min[i]), max: tempOrNull(max[i]),
      code: code ? codeOrNull(code[i]) : null, windKmh: wind ? windOrNull(wind[i]) : null, windDeg: dir ? dirOrNull(dir[i]) : null,
    };
    if (!dayHasData(day)) missing++;
    days.push(day);
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ok: true, days, missing };
}

/** Strict validation of a geocoding response: at most 5 places with finite in-range coordinates. */
export function parseGeocodingResponse(json: unknown): ParsedPlaces {
  if (!isObj(json)) return { ok: false, reason: 'shape' };
  const r = json['results'];
  if (r === undefined) return { ok: true, places: [] }; // Open-Meteo omits results when nothing matches
  if (!Array.isArray(r) || r.length > MAX_PLACES) return { ok: false, reason: 'results' };
  const places: Place[] = [];
  for (const it of r) {
    if (!isObj(it)) return { ok: false, reason: 'result' };
    const lat = it['latitude'], lon = it['longitude'];
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return { ok: false, reason: 'coordinates' };
    }
    const name = cleanText(it['name']);
    if (!name) return { ok: false, reason: 'name' };
    const parts = [name, cleanText(it['admin1']), cleanText(it['country'])].filter((p, i, a) => p !== '' && a.indexOf(p) === i);
    places.push({ label: parts.join(', ').slice(0, 3 * MAX_LABEL), latitude: lat, longitude: lon });
  }
  return { ok: true, places };
}

/** Aggregates the daily temperatures of the given civil dates (a chart bucket). Mean of daily means, min of mins, max of maxes. */
export function aggregateTemps(days: DailyTemp[] | Map<string, DailyTemp>, bucketDates: string[]): TempAggregate {
  const byDate = days instanceof Map ? days : new Map(days.map((d) => [d.date, d]));
  let sum = 0, n = 0, covered = 0;
  let min: number | null = null, max: number | null = null;
  for (const date of bucketDates) {
    const d = byDate.get(date);
    if (!d) continue;
    let any = false;
    if (d.mean !== null) { sum += d.mean; n++; any = true; }
    if (d.min !== null) { min = min === null ? d.min : Math.min(min, d.min); any = true; }
    if (d.max !== null) { max = max === null ? d.max : Math.max(max, d.max); any = true; }
    if (any) covered++;
  }
  return { mean: n > 0 ? sum / n : null, min, max, covered, total: bucketDates.length };
}

/** Soft centred moving average (window 3, shrinking to the available neighbours at the edges); nulls are skipped and kept null. */
export function smoothTrend(points: Array<number | null>): Array<number | null> {
  return points.map((p, i) => {
    if (p === null) return null;
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(points.length - 1, i + 1); j++) {
      const v = points[j];
      if (v !== null && v !== undefined) { s += v; n++; }
    }
    return Math.round((s / n) * 1e6) / 1e6; // keeps constant series exactly constant
  });
}

/** 12.3 -> "12,3 °C" (no-break space, true minus sign, one decimal). */
export function formatTemp(x: number): string {
  return `${formatTempNumber(x)} °C`;
}

function formatTempNumber(x: number): string {
  const r = Math.round(Math.abs(x) * 10) / 10;
  const s = r.toFixed(1).replace('.', ',');
  return x < 0 && r !== 0 ? `−${s}` : s;
}

/** One run of tooltip text; `cls` (optional) is a CSS class for its colour/weight. */
export interface Seg { text: string; cls?: string }
/** The plain text of tooltip segments (what aria-labels and the box width use). */
export const segsText = (segs: Seg[]): string => segs.map((x) => x.text).join('');
const SEP: Seg = { text: ' · ' };

/** Tooltip segments for a bucket: "Température : moy. 12,3 °C · min −4,1 · max 31,0" (+ " (N/M jours)" when partial); values are coloured. */
export function tempTooltipSegments(a: TempAggregate): Seg[] {
  if (a.mean === null && a.min === null && a.max === null) return [{ text: 'Température : donnée indisponible' }];
  const parts: Seg[] = [];
  if (a.mean !== null) parts.push({ text: `moy. ${formatTemp(a.mean)}`, cls: 'tt-mean' });
  if (a.min !== null) parts.push({ text: `min ${formatTempNumber(a.min)}`, cls: 'tt-min' });
  if (a.max !== null) parts.push({ text: `max ${formatTempNumber(a.max)}`, cls: 'tt-max' });
  const out: Seg[] = [{ text: 'Température : ' }];
  parts.forEach((p, i) => { if (i) out.push(SEP); out.push(p); });
  if (a.covered < a.total) out.push({ text: ` (${a.covered}/${a.total} jours)` });
  return out;
}
/** Plain-text temperature tooltip line. */
export const tempTooltipLine = (a: TempAggregate): string => segsText(tempTooltipSegments(a));

/** Aggregates wind over a bucket: mean of daily mean speeds; direction = speed-weighted circular (vector) mean of the
 *  days with both speed and direction (null when no weight or the resultant is ~0, e.g. opposite winds). covered = days with a speed. */
export function aggregateWind(days: DailyTemp[] | Map<string, DailyTemp>, bucketDates: string[]): WindAggregate {
  const byDate = days instanceof Map ? days : new Map(days.map((d) => [d.date, d]));
  let sum = 0, n = 0, wSum = 0, x = 0, y = 0;
  for (const date of bucketDates) {
    const d = byDate.get(date);
    const v = d?.windKmh ?? null, a = d?.windDeg ?? null;
    if (v === null) continue;
    sum += v; n++;
    if (a !== null) {
      const r = (a * Math.PI) / 180;
      x += v * Math.sin(r); y += v * Math.cos(r); wSum += v;
    }
  }
  let deg: number | null = null;
  if (wSum > 0 && Math.hypot(x, y) / wSum > 1e-6) {
    deg = (Math.atan2(x, y) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    deg = Math.round(deg * 1e6) / 1e6 % 360;
  }
  return { speed: n > 0 ? sum / n : null, deg, covered: n, total: bucketDates.length };
}

const LABELS: Array<[number[], string]> = [
  [[0], 'Ciel dégagé'], [[1], 'Peu nuageux'], [[2], 'Nuageux'], [[3], 'Couvert'], [[45, 48], 'Brouillard'],
  [[51, 53, 55], 'Bruine'], [[56, 57], 'Bruine verglaçante'], [[61, 63, 65], 'Pluie'], [[66, 67], 'Pluie verglaçante'],
  [[71, 73, 75, 77], 'Neige'], [[80, 81, 82], 'Averses'], [[85, 86], 'Averses de neige'], [[95], 'Orage'], [[96, 99], 'Orage avec grêle'],
];
/** Icon families, one per visual symbol (the drawing lives in src/ui, the mapping stays pure). */
export type WeatherIconKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'heavy-rain' | 'sleet' | 'snow' | 'storm';
export const WEATHER_ICON_KINDS: readonly WeatherIconKind[] = ['clear', 'partly', 'cloud', 'fog', 'rain', 'heavy-rain', 'sleet', 'snow', 'storm'];
const ICONS: Array<[number[], WeatherIconKind]> = [
  [[0], 'clear'], [[1, 2], 'partly'], [[3], 'cloud'], [[45, 48], 'fog'], [[51, 53, 55, 61, 63, 80, 81], 'rain'], [[65, 82], 'heavy-rain'],
  [[56, 57, 66, 67], 'sleet'], [[71, 73, 75, 77, 85, 86], 'snow'], [[95, 96, 99], 'storm'],
];
const find = <T extends string>(t: Array<[number[], T]>, code: number | null | undefined): T | '' => {
  if (code === null || code === undefined) return '';
  for (const [cs, v] of t) if (cs.includes(code)) return v;
  return '';
};
/** French label of a WMO code ('' when null/unknown). */
export const weatherLabel = (code: number | null | undefined): string => find(LABELS, code);
/** Icon family of a WMO code ('' when null/unknown). */
export const weatherIconKind = (code: number | null | undefined): WeatherIconKind | '' => find(ICONS, code);

const COMPASS = ['nord', 'nord-nord-est', 'nord-est', 'est-nord-est', 'est', 'est-sud-est', 'sud-est', 'sud-sud-est',
  'sud', 'sud-sud-ouest', 'sud-ouest', 'ouest-sud-ouest', 'ouest', 'ouest-nord-ouest', 'nord-ouest', 'nord-nord-ouest'];
/** 16-point compass name of a direction in degrees (the wind origin), e.g. 225 -> 'sud-ouest'; '' when not finite. */
export function compassFr(deg: number): string {
  if (!Number.isFinite(deg)) return '';
  const n = ((deg % 360) + 360) % 360;
  return COMPASS[Math.floor((n + 11.25) / 22.5) % 16]!;
}
/** 'sud-ouest' -> 'du sud-ouest'; 'ouest' -> "de l'ouest"; 'est-nord-est' -> "de l'est-nord-est". */
export const windFrom = (name: string): string => (name.startsWith('est') || name.startsWith('ouest') ? `de l'${name}` : `du ${name}`);

/** Wind segments "Vent : moy. 11 km/h · du sud-ouest" (+ " (N/M jours)" when partial); direction omitted when unknown or when the speed rounds to 0. */
export function windSegments(speed: number | null, deg: number | null, covered = 1, total = 1): Seg[] {
  if (speed === null) return [{ text: 'Vent : donnée indisponible' }];
  const kmh = Math.round(speed);
  const out: Seg[] = [{ text: 'Vent : ' }, { text: `moy. ${kmh}\u00A0km/h`, cls: 'tt-wind' }];
  if (deg !== null && kmh > 0) out.push(SEP, { text: windFrom(compassFr(deg)), cls: 'tt-wind' });
  if (covered < total) out.push({ text: ` (${covered}/${total} jours)` });
  return out;
}
export const formatWind = (speed: number | null, deg: number | null, covered = 1, total = 1): string => segsText(windSegments(speed, deg, covered, total));
/** Tooltip line of a bucket. */
export const windTooltipLine = (a: WindAggregate): string => formatWind(a.speed, a.deg, a.covered, a.total);
export const windTooltipSegments = (a: WindAggregate): Seg[] => windSegments(a.speed, a.deg, a.covered, a.total);
/** Day-view tooltip line "Météo : Pluie" ('Météo : donnée indisponible' without a code). */
export const weatherTooltipSegments = (code: number | null | undefined): Seg[] => {
  const l = weatherLabel(code);
  return l ? [{ text: 'Météo : ' }, { text: l, cls: 'tt-strong' }] : [{ text: 'Météo : donnée indisponible' }];
};
export const weatherTooltipLine = (code: number | null | undefined): string => segsText(weatherTooltipSegments(code));
