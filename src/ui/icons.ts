// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Hand-drawn weather icons: plain data (no DOM), one shared 24x24 coordinate system, keyed by the pure icon kind of src/core/weather.ts.
 *  Only path/circle/line/rect/g elements; colours come from CSS classes (--wx-* tokens), never from attributes or style. */
import { WeatherIconKind } from '../core/weather';

export interface IconEl { tag: 'path' | 'circle' | 'line' | 'rect' | 'g'; attrs: Record<string, string | number>; cls?: string; kids?: IconEl[] }
export const ICON_SIZE = 24; // width of the coordinate system; the visible window is 24 wide and ICON_H tall
export const ICON_H = 20;
export const ICON_TAGS: readonly string[] = ['path', 'circle', 'line', 'rect', 'g'];

const P = (d: string, cls: string): IconEl => ({ tag: 'path', attrs: { d }, cls });
const C = (cx: number, cy: number, r: number, cls: string): IconEl => ({ tag: 'circle', attrs: { cx, cy, r }, cls });
const L = (x1: number, y1: number, x2: number, y2: number, cls: string): IconEl => ({ tag: 'line', attrs: { x1, y1, x2, y2 }, cls });
const G = (transform: string, kids: IconEl[]): IconEl => ({ tag: 'g', attrs: { transform }, kids });

const CLOUD = 'M6.5 18a4.2 4.2 0 0 1-.5-8.37A6 6 0 0 1 17.4 8.9 4.6 4.6 0 0 1 17.5 18z';
const cloud = (transform?: string): IconEl => (transform ? G(transform, [P(CLOUD, 'wx-cloud')]) : P(CLOUD, 'wx-cloud'));
const UP = 'translate(1.2 -0.4) scale(.9)'; // smaller cloud, leaves room below for precipitation
const rays = (cx: number, cy: number, r0: number, r1: number, n: number, from = 0): IconEl[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((from + (i * 360) / n) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const f = (v: number) => Math.round(v * 100) / 100;
    return L(f(cx + c * r0), f(cy + s * r0), f(cx + c * r1), f(cy + s * r1), 'wx-ray');
  });
const drops = (xs: number[], y: number, len: number): IconEl[] => xs.map((x) => L(x, y, x - 1.6, y + len, 'wx-drop'));

// Icons are drawn inside the 24 x 20 window "0 2 24 20" (y from 2 to 22), content centred in it.
export const ICONS: Record<WeatherIconKind, IconEl[]> = {
  clear: [C(12, 12, 4.8, 'wx-sun'), ...rays(12, 12, 7, 9.6, 8)],
  partly: [C(8.8, 11, 3.6, 'wx-sun'), ...rays(8.8, 11, 5.6, 7.6, 8), cloud('translate(2.5 2.5)')],
  cloud: [cloud('translate(-1.2 -0.4) scale(1.1)')],
  fog: [cloud(UP), L(4, 17.2, 20, 17.2, 'wx-fog'), L(7, 20.8, 17, 20.8, 'wx-fog')],
  rain: [cloud(UP), ...drops([8.5, 12.5, 16.5], 16.5, 4.8)],
  'heavy-rain': [cloud(UP), ...drops([6.5, 10, 13.5, 17], 15.8, 3.2), ...drops([8.2, 11.7, 15.2], 19.2, 2.6)],
  sleet: [cloud(UP), ...drops([8, 15], 16.5, 4.5), C(11.5, 19, 1.25, 'wx-flake'), C(18, 19.6, 1.25, 'wx-flake')],
  snow: [cloud(UP), C(8, 17, 1.4, 'wx-flake'), C(12.5, 20, 1.4, 'wx-flake'), C(17, 17, 1.4, 'wx-flake')],
  storm: [cloud(UP), P('M13.2 12l-4.2 5.6h3.1l-1.5 4.4 5.4-6.6h-3.2z', 'wx-bolt')],
};
