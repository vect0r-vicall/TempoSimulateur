// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
export type Bucket = 'hp'|'hc'|'bleuHC'|'bleuHP'|'blancHC'|'blancHP'|'rougeHC'|'rougeHP';
export type PeriodKind = 'hchp'|'tempo';
export interface DayConsumption { date: string /*YYYY-MM-DD*/; kind: PeriodKind; kwh: Partial<Record<Bucket, number>>; estimated: boolean }
export interface PeriodInfo { kind: PeriodKind; from: string; to: string; days: number }
export interface ImportResult { days: DayConsumption[] /*ascending, priced days only*/; periods: PeriodInfo[]; excluded: string[] /*boundary dates*/; estimatedCount: number }
export class ImportError extends Error {} // message is a French user message
