// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Pure search-as-you-type state machine (FR-051..FR-053): debounce, minimum length, one in-flight request,
 *  stale-response drop, identical-query suppression, at most one request per DEBOUNCE_MS by construction.
 *  Timers, clock, sanitising and the search itself are injected, so it runs without DOM, network or real time. */
export const DEBOUNCE_MS = 400;

export interface LiveSearchDeps<R> {
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  now(): number;
  /** Sanitised query, or null when it is too short / too long (no request). */
  sanitise(text: string): string | null;
  search(query: string, signal: AbortSignal): Promise<R>;
  /** False for a failed or cancelled result: the same query may then be retried. */
  isOk(result: R): boolean;
  /** Query too short, or field cleared: the caller clears the list and its search message. */
  onIdle(): void;
  onLoading(query: string): void;
  /** Only called for the latest request (superseded results are dropped here). */
  onResult(query: string, result: R): void;
  onError(query: string, error: unknown): void;
}

export interface LiveSearch {
  /** The field text changed: debounced search. */
  input(text: string): void;
  /** Enter: immediate search (still spaced DEBOUNCE_MS after the previous request). */
  submit(text: string): void;
  /** Untick: cancel the timer and the in-flight request, drop any late result. No callback. */
  reset(): void;
}

export function createLiveSearch<R>(d: LiveSearchDeps<R>): LiveSearch {
  let token = 0;
  let timer: unknown = null;
  let ctl: AbortController | null = null;
  let last: string | null = null; // query of the latest request (cleared when it failed)
  let lastAt: number | null = null; // clock time of the latest request

  const clearTimer = () => {
    if (timer !== null) d.cancel(timer);
    timer = null;
  };
  const cancelAll = () => {
    token++;
    clearTimer();
    ctl?.abort();
    ctl = null;
    last = null;
  };

  function fire(q: string): void {
    timer = null;
    const tok = ++token;
    ctl?.abort();
    const mine = (ctl = new AbortController());
    last = q;
    lastAt = d.now();
    d.onLoading(q);
    d.search(q, mine.signal).then(
      (r) => {
        if (tok !== token) return;
        if (!d.isOk(r)) last = null;
        d.onResult(q, r);
      },
      (e) => {
        if (tok !== token) return;
        last = null;
        d.onError(q, e);
      },
    );
  }

  function request(text: string, immediate: boolean): void {
    clearTimer();
    const q = d.sanitise(text);
    if (q === null) {
      cancelAll();
      d.onIdle();
      return;
    }
    if (q === last) return; // identical consecutive query: nothing to refire
    let wait = immediate ? 0 : DEBOUNCE_MS;
    if (lastAt !== null) wait = Math.max(wait, DEBOUNCE_MS - (d.now() - lastAt)); // spacing guard
    if (wait <= 0) fire(q);
    else timer = d.schedule(() => fire(q), wait);
  }

  return {
    input: (t) => request(t, false),
    submit: (t) => request(t, true),
    reset: cancelAll,
  };
}
