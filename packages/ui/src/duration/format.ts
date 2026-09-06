/**
 * Duration formatting — BUILD-PLAN.md §2 R13, §10.3, defect V2.
 *
 * The system this replaces renders `-08:20` in red on the kitchen display. It
 * happens whenever a timer subtracts two timestamps without clamping: clock
 * skew between the till and the server, or a line whose `sent_at` is written
 * after the read. A cook looking at `-08:20` cannot tell whether the ticket is
 * late, so the timer stops being information.
 *
 * `clampSeconds` is the single choke point. Every formatter here runs input
 * through it, so a negative cannot reach the screen even if a caller passes one.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** Negative, NaN, and Infinity all collapse to a renderable value. R13. */
export function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return seconds < 0 ? 0 : Math.floor(seconds);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * §10.3 — `mm:ss` up to 59:59, then `1h 04m`.
 */
export function formatDuration(seconds: number): string {
  const safe = clampSeconds(seconds);

  if (safe < SECONDS_PER_HOUR) {
    const minutes = Math.floor(safe / SECONDS_PER_MINUTE);
    return `${pad(minutes)}:${pad(safe % SECONDS_PER_MINUTE)}`;
  }

  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${hours}h ${pad(minutes)}m`;
}

/**
 * §10.3 — past the overdue threshold a ticket reads `12:40 over` rather than a
 * bare elapsed time, because how late it is matters more than how long it has
 * been.
 */
export function formatOverdueBy(elapsedSeconds: number, overdueSeconds: number): string {
  // The clamp is explicit rather than left to formatDuration: a ticket read
  // before it is overdue yields a negative overrun, and the intent should be
  // visible here rather than two calls away.
  const overrun = Math.max(0, clampSeconds(elapsedSeconds) - clampSeconds(overdueSeconds));
  return `${formatDuration(overrun)} over`;
}

export type DurationState = 'OK' | 'WARN' | 'OVERDUE';

export interface DurationThresholds {
  readonly targetSeconds: number;
  /**
   * Reserved. §5.4 gives `stations` a `warn_seconds` column between target and
   * overdue; §10.3 does not say what distinguishes it from the WARN band it
   * sits inside. M09a decides whether it drives a stronger tint. Until then a
   * ticket is WARN from `targetSeconds`.
   */
  readonly warnSeconds?: number | undefined;
  readonly overdueSeconds: number;
}

/**
 * Total over every input. The §10.3 table leaves the span between `warn` and
 * `overdue` unstated; it resolves to the more urgent of the two readings, which
 * is the safe direction for a kitchen.
 */
export function durationState(
  elapsedSeconds: number,
  thresholds: DurationThresholds,
): DurationState {
  const elapsed = clampSeconds(elapsedSeconds);
  if (elapsed >= thresholds.overdueSeconds) return 'OVERDUE';
  if (elapsed >= thresholds.targetSeconds) return 'WARN';
  return 'OK';
}
