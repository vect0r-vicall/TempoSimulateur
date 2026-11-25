// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** The ONLY module allowed to use the network API (FR-018/FR-021): opt-in Open-Meteo requests, GET only,
 *  to exactly two origins pinned by the CSP connect-src. No exception escapes; results are discriminated. */
import { isValidIso } from '../core/period';
import { DailyTemp, Place, parseGeocodingResponse, parseWeatherResponse, roundCoord } from '../core/weather';

export const GEOCODING_ORIGIN = 'https://geocoding-api.open-meteo.com';
export const ARCHIVE_ORIGIN = 'https://archive-api.open-meteo.com';
export const TIMEOUT_MS = 10000;
export const MAX_BODY_CHARS = 1_000_000;
export const MIN_QUERY = 2;
export const MAX_QUERY = 60;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
/** `aborted` marks a cancelled search (superseded or unticked): not an error, the UI ignores it. */
export type PlacesResult = { ok: true; places: Place[] } | { ok: false; message: string; aborted?: true };
export type TempsResult = { ok: true; days: DailyTemp[]; missing: number } | { ok: false; message: string };

const defaultFetch: FetchFn = (url, init) => fetch(url, init);

const MSG = {
  query: 'Saisissez entre 2 et 60 caractères pour rechercher un lieu.',
  range: 'Période ou position invalide pour la météo.',
  net: 'Service météo injoignable. Vérifiez votre connexion et réessayez.',
  aborted: 'Recherche annulée.',
  timeout: 'Le service météo ne répond pas (délai dépassé). Réessayez plus tard.',
  http: 'Le service météo a refusé la requête.',
  http400: 'Requête météo refusée (paramètres ou période non acceptés).',
  big: 'Réponse du service météo trop volumineuse : ignorée.',
  bad: 'Réponse du service météo invalide : ignorée.',
};

/** Trim, collapse whitespace, drop control characters; null if outside 2..60 characters. */
export function sanitiseQuery(q: string): string | null {
  if (typeof q !== 'string') return null;
  const s = q.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= MIN_QUERY && s.length <= MAX_QUERY ? s : null;
}

type Raw = { ok: true; json: unknown } | { ok: false; message: string; aborted?: true };

async function getJson(url: string, fetchFn: FetchFn, external?: AbortSignal): Promise<Raw> {
  if (external?.aborted) return { ok: false, message: MSG.aborted, aborted: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onExternal = () => ctl.abort();
  external?.addEventListener('abort', onExternal);
  try {
    const res = await fetchFn(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal: ctl.signal });
    if (!res.ok) return { ok: false, message: res.status === 400 ? MSG.http400 : MSG.http };
    const len = Number(res.headers?.get('content-length'));
    if (Number.isFinite(len) && len > MAX_BODY_CHARS) return { ok: false, message: MSG.big };
    const text = await res.text();
    if (text.length > MAX_BODY_CHARS) return { ok: false, message: MSG.big };
    try { return { ok: true, json: JSON.parse(text) as unknown }; } catch { return { ok: false, message: MSG.bad }; }
  } catch {
    if (external?.aborted) return { ok: false, message: MSG.aborted, aborted: true };
    return { ok: false, message: ctl.signal.aborted ? MSG.timeout : MSG.net };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternal);
  }
}

const placesCache = new Map<string, Place[]>();

/** `signal` (optional) cancels the request: the result is then `{ok:false, aborted:true}`. Successful results are cached per lowercase query. */
export async function searchPlaces(query: string, fetchFn: FetchFn = defaultFetch, signal?: AbortSignal): Promise<PlacesResult> {
  const q = sanitiseQuery(query);
  if (q === null) return { ok: false, message: MSG.query };
  const hit = placesCache.get(q.toLowerCase());
  if (hit) return { ok: true, places: hit };
  const url = `${GEOCODING_ORIGIN}/v1/search?name=${encodeURIComponent(q)}&count=5&language=fr&format=json`;
  const raw = await getJson(url, fetchFn, signal);
  if (!raw.ok) return raw;
  const p = parseGeocodingResponse(raw.json);
  if (!p.ok) return { ok: false, message: MSG.bad };
  placesCache.set(q.toLowerCase(), p.places);
  return { ok: true, places: p.places };
}

const cache = new Map<string, TempsResult & { ok: true }>();

/** Clears the in-memory caches (temperatures and places; tests). */
export function clearWeatherCache(): void { cache.clear(); placesCache.clear(); }

export async function fetchDailyTemps(lat: number, lon: number, start: string, end: string, fetchFn: FetchFn = defaultFetch): Promise<TempsResult> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
    || !isValidIso(start) || !isValidIso(end) || start > end) return { ok: false, message: MSG.range };
  const rlat = roundCoord(lat), rlon = roundCoord(lon);
  const key = `${rlat}|${rlon}|${start}|${end}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = `${ARCHIVE_ORIGIN}/v1/archive?latitude=${rlat}&longitude=${rlon}&start_date=${start}&end_date=${end}`
    + '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_mean,wind_direction_10m_dominant&timezone=auto';
  const raw = await getJson(url, fetchFn);
  if (!raw.ok) return raw;
  const p = parseWeatherResponse(raw.json, start, end);
  if (!p.ok) return { ok: false, message: MSG.bad };
  const res = { ok: true as const, days: p.days, missing: p.missing };
  cache.set(key, res);
  return res;
}
