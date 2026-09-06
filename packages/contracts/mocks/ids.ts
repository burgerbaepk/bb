/**
 * Stable identifiers for the Phase 1 dataset.
 *
 * Every id is derived from a slug rather than written out, for two reasons.
 * A screen that renders `menu-item:mutton-tikka` in a debug view is readable,
 * and — more importantly — the value is identical on the server and in the
 * browser, so a React tree hydrating over server-rendered HTML matches. A
 * `crypto.randomUUID()` here would produce a hydration mismatch on every page.
 *
 * The output is shaped as a v4 UUID because the contracts validate it as one.
 */

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

function fnv1a(seed: string): number {
  let hash = OFFSET;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, PRIME) >>> 0;
  }
  return hash >>> 0;
}

function hex(value: number, length: number): string {
  return value.toString(16).padStart(length, '0').slice(-length);
}

/** A deterministic v4-shaped UUID for a slug. */
export function uuidFrom(seed: string): string {
  const a = fnv1a(seed);
  const b = fnv1a(`${seed}:1`);
  const c = fnv1a(`${seed}:2`);
  const d = fnv1a(`${seed}:3`);
  return [
    hex(a, 8),
    hex(b >>> 16, 4),
    `4${hex(b, 3)}`,
    `${((c >>> 30) | 0x8).toString(16)}${hex(c, 3)}`,
    `${hex(c >>> 4, 4)}${hex(d, 8)}`,
  ].join('-');
}

/**
 * The instant the whole dataset is rendered against.
 *
 * Fixed, not `Date.now()`. Every elapsed timer, dwell counter, and "time since
 * check" figure on these screens is computed from this, so a review sees the
 * same numbers twice running and a server render agrees with its hydration.
 * It is the timestamp on the Appendix A.1 reference invoice.
 */
export const MOCK_NOW = new Date('2026-08-22T14:13:07.000Z');

/** Seconds before `MOCK_NOW`, as a Date. */
export function ago(seconds: number): Date {
  return new Date(MOCK_NOW.getTime() - seconds * 1000);
}

/** Whole seconds between an instant and `MOCK_NOW`, never negative (R13). */
export function elapsed(from: Date): number {
  return Math.max(0, Math.floor((MOCK_NOW.getTime() - from.getTime()) / 1000));
}

export const MOCK_BUSINESS_DATE = '2026-08-22';
