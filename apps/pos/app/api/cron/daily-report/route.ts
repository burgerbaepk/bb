import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { readOutletConfig } from '@/lib/outlet/queries';
import { computeBusinessDate } from '@/lib/orders/businessDateLogic';
import { sendDailyOwnerEmails } from '@/lib/daily/report';

/**
 * The daily owner emails, fired by Vercel Cron — ADR 0029; `vercel.json`.
 *
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`. Without the
 * secret configured the route refuses everything, rather than become a public
 * button anyone could press to mail the owner the day's takings.
 *
 * Which day: the business day containing the instant 24 hours ago. A business
 * day is 24 hours long, so that day has always closed by now, whatever the
 * outlet's cutoff and whenever the cron actually fires — early, late, or
 * retried. `?date=YYYY-MM-DD` names a day explicitly, for a missed send; the
 * idempotency key in `sendDailyOwnerEmails` still stops a day going twice.
 */
export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (secret === undefined || secret === '') return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const outlet = await readOutletConfig();
  if (outlet === null) {
    return NextResponse.json({ error: 'Outlet identity is incomplete.' }, { status: 500 });
  }

  const requested = new URL(request.url).searchParams.get('date');
  const businessDate =
    requested !== null && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : computeBusinessDate(new Date(Date.now() - 24 * 60 * 60 * 1000), {
          timezone: outlet.timezone,
          cutoff: outlet.businessDayCutoff,
        });

  const result = await sendDailyOwnerEmails(businessDate, outlet.businessDayCutoff);
  return NextResponse.json(
    { businessDate, ...result },
    { status: result.sent || result.alreadySent ? 200 : 503 },
  );
}
