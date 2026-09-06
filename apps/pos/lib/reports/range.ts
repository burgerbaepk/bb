import 'server-only';
import type { DateRange } from '@natech/contracts';
import { readCurrentBusinessDate } from '../outlet/queries';

/**
 * The one place every §17 report turns `?from=&to=` into a `DateRange` —
 * BUILD-PLAN.md §17; docs/runfiles/M13-reporting.md §3.
 *
 * Range state lives in the URL, not component state, so the figure on screen
 * and the figure the export route builds can never drift apart for what
 * looks like the same range (R16's own principle, extended to "export
 * matches its screen").
 */
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WINDOW_DAYS = 7;

function isBusinessDate(value: string | undefined): value is string {
  return value !== undefined && BUSINESS_DATE_RE.test(value);
}

export interface ReportRangeParams {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/** Trailing `DEFAULT_WINDOW_DAYS` business days ending today, when nothing valid is given. */
export async function resolveReportRange(params: ReportRangeParams): Promise<DateRange> {
  if (isBusinessDate(params.from) && isBusinessDate(params.to)) {
    return params.from <= params.to
      ? { fromBusinessDate: params.from, toBusinessDate: params.to }
      : { fromBusinessDate: params.to, toBusinessDate: params.from };
  }

  const today = await readCurrentBusinessDate();
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
  return { fromBusinessDate: from.toISOString().slice(0, 10), toBusinessDate: today };
}
