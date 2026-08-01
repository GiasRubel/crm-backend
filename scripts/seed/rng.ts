/**
 * Deterministic randomness + time helpers shared by every seed step.
 *
 * All randomness goes through the single seeded faker instance below — never
 * call `Math.random()` in a generator, or re-runs stop being reproducible.
 */
import { faker } from '@faker-js/faker';
import { GROWTH_RAMP, MONTHS_OF_HISTORY, RNG_SEED } from './config';

faker.seed(RNG_SEED);

export { faker };

// ── Primitives ────────────────────────────────────────────────────────────

export function int(min: number, max: number): number {
  return faker.number.int({ min, max });
}

export function float(min: number, max: number, fractionDigits = 2): number {
  return faker.number.float({ min, max, fractionDigits });
}

/** True with probability `p` (0–1). */
export function chance(p: number): boolean {
  return faker.number.float({ min: 0, max: 1 }) < p;
}

export function pick<T>(items: readonly T[]): T {
  return items[faker.number.int({ min: 0, max: items.length - 1 })];
}

/** `n` distinct elements (or all of them, if the pool is smaller). */
export function sample<T>(items: readonly T[], n: number): T[] {
  return faker.helpers.arrayElements(items, Math.min(n, items.length));
}

export function shuffle<T>(items: readonly T[]): T[] {
  return faker.helpers.shuffle(items as T[]);
}

export interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}

export function weighted<T>(entries: readonly Weighted<T>[]): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

/**
 * Expands a weighted mix into an exact-count array, so a "180 accounts,
 * 55% active" spec produces exactly 99 active accounts rather than
 * approximately that many. Shuffled, so order carries no signal.
 */
export function distribute<T>(
  entries: readonly Weighted<T>[],
  total: number,
): T[] {
  const weightSum = entries.reduce((sum, e) => sum + e.weight, 0);
  const out: T[] = [];
  entries.forEach((entry, i) => {
    const count =
      i === entries.length - 1
        ? total - out.length
        : Math.round((entry.weight / weightSum) * total);
    for (let n = 0; n < Math.max(0, count); n++) out.push(entry.value);
  });
  return shuffle(out.slice(0, total));
}

// ── Time ──────────────────────────────────────────────────────────────────

/**
 * "Now" for the whole run, truncated to midnight UTC. Truncating keeps a run
 * deterministic within a day while still placing overdue tasks in the past
 * and upcoming ones in the future relative to real wall-clock time.
 */
export const NOW = (() => {
  const d = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
})();

export const HISTORY_START = (() => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - MONTHS_OF_HISTORY);
  return d;
})();

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}

export function addDays(date: Date, days: number): Date {
  return addMinutes(date, days * 24 * 60);
}

export function clamp(date: Date, min: Date, max: Date): Date {
  if (date < min) return new Date(min);
  if (date > max) return new Date(max);
  return date;
}

/** Uniform instant in `[from, to]`. */
export function between(from: Date, to: Date): Date {
  if (to <= from) return new Date(from);
  return new Date(from.getTime() + int(0, to.getTime() - from.getTime()));
}

/**
 * Snaps an instant onto a weekday between 08:00 and 18:00 UTC. Real CRM
 * activity clusters in business hours; uniform-random timestamps make
 * "activity by hour/day" reports look like noise.
 */
export function businessMoment(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2); // Sat → Mon
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
  d.setUTCHours(int(8, 17), int(0, 59), int(0, 59), 0);
  return d;
}

/**
 * A business-hours instant in the history window, biased toward recent
 * months by `GROWTH_RAMP` so record volume grows over time.
 */
export function historyMoment(): Date {
  const months = Array.from({ length: MONTHS_OF_HISTORY }, (_, m) => ({
    value: m,
    weight: 1 + (GROWTH_RAMP - 1) * (m / (MONTHS_OF_HISTORY - 1)),
  }));
  const monthIndex = weighted(months);

  const start = new Date(HISTORY_START);
  start.setUTCMonth(start.getUTCMonth() + monthIndex);
  const end = new Date(HISTORY_START);
  end.setUTCMonth(end.getUTCMonth() + monthIndex + 1);

  const moment = businessMoment(between(start, end));
  // Never past the end of the window, and never in the final hour of "today".
  return clamp(moment, HISTORY_START, addHours(NOW, -1));
}

/** A business-hours instant strictly after `after`, within `maxDays`. */
export function momentAfter(
  after: Date,
  minDays: number,
  maxDays: number,
): Date {
  const from = addDays(after, minDays);
  const to = addDays(after, maxDays);
  return businessMoment(between(from, to));
}

/** A business-hours instant in the future, `minDays`–`maxDays` from now. */
export function futureMoment(minDays: number, maxDays: number): Date {
  return businessMoment(between(addDays(NOW, minDays), addDays(NOW, maxDays)));
}

/**
 * Builds a strictly increasing chain of `count` instants starting at
 * `start`, each 1–`maxGapDays` business days after the previous, stopping
 * early if it would run past `ceiling`.
 */
export function ascendingMoments(
  start: Date,
  count: number,
  maxGapDays: number,
  ceiling: Date = NOW,
): Date[] {
  const out: Date[] = [];
  let cursor = start;
  for (let i = 0; i < count; i++) {
    let next = momentAfter(cursor, 0, maxGapDays);
    // businessMoment re-rolls the time of day, so a same-day result can land
    // before the cursor — push it to the next day rather than going backwards.
    if (next <= cursor) next = businessMoment(addDays(cursor, 1));
    if (next >= ceiling) break;
    out.push(next);
    cursor = next;
  }
  return out;
}
