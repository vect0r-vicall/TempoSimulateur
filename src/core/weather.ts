// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure weather helpers (FR-033..FR-040): strict validation of Open-Meteo payloads, aggregation, smoothing, French formatting.
 *  No DOM, no network, no clock: civil dates are YYYY-MM-DD strings only. */
import { isValidIso } from './period';

export interface DailyTemp { date: string; mean: number | null; min: number | null; max: number | null }
export interface Place { label: string; latitude: number; longitude: number }
export interface TempAggregate { mean: number | null; min: number | null; max: number | null; covered: number; total: number }

export const TEMP_MIN = -90;
export const TEMP_MAX = 60;
export const MAX_PLACES = 5;
export const MAX_DAYS = 800;
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
  return s.replace(/[\u0000-\u001F\u007F-\u009F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
}

function tempOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= TEMP_MIN && v <= TEMP_MAX ? v : null;
}

/** Strict validation of an archive response for the requested inclusive civil-date window. */
export function parseWeatherResponse(json: unknown, startDate: string, endDate: string): ParsedWeather {
  const bad = (reason: string): ParsedWeather => ({ ok: false, reason });
  if (!isValidIso(startDate) || !isValidIso(endDate) || startDate > endDate) return bad('window');
  if (!isObj(json) || !isObj(json['daily'])) return bad('shape');
  const d = json['daily'];
  const time = d['time'], mean = d['temperature_2m_mean'], min = d['temperature_2m_min'], max = d['temperature_2m_max'];
  if (!Array.isArray(time) || !Array.isArray(mean) || !Array.isArray(min) || !Array.isArray(max)) return bad('arrays');
  if (time.length > MAX_DAYS) return bad('too many days');
  if (mean.length !== time.length || min.length !== time.length || max.length !== time.length) return bad('length mismatch');
  const days: DailyTemp[] = [];
  const seen = new Set<string>();
  let missing = 0;
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    if (typeof t !== 'string' || !isValidIso(t)) return bad('date');
    if (t < startDate || t > endDate || seen.has(t)) return bad('date window');
    seen.add(t);
    const day = { date: t, mean: tempOrNull(mean[i]), min: tempOrNull(min[i]), max: tempOrNull(max[i]) };
    if (day.mean === null && day.min === null && day.max === null) missing++;
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
    return s / n;
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

/** Tooltip line for a bucket: "Température : moy. 12,3 °C · min −4,1 · max 31,0" (+ " (N/M jours)" when partial). */
export function tempTooltipLine(a: TempAggregate): string {
  if (a.mean === null && a.min === null && a.max === null) return 'Température : donnée indisponible';
  const parts: string[] = [];
  if (a.mean !== null) parts.push(`moy. ${formatTemp(a.mean)}`);
  if (a.min !== null) parts.push(`min ${formatTempNumber(a.min)}`);
  if (a.max !== null) parts.push(`max ${formatTempNumber(a.max)}`);
  const partial = a.covered < a.total ? ` (${a.covered}/${a.total} jours)` : '';
  return `Température : ${parts.join(' · ')}${partial}`;
}
