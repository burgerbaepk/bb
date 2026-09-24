import { formatPaisa } from '@natech/ui';
import { paisa, parseQty, type Paisa } from '@natech/domain';
import {
  VENDOR_FOOTER_LINE,
  type ChannelMixRow,
  type ExceptionRow,
  type ItemSalesRow,
  type PaymentMixRow,
  type SalesByDateRow,
} from '@natech/contracts';
import { formatQty } from '@/components/lib/format';

/**
 * The owner's two daily emails — the Daily Sales Report and the Activity
 * Summary — ADR 0029.
 *
 * Pure, like `lib/demand/email.ts`: no database and no `server-only`, so the
 * whole document is asserted in a unit test and rendered for preview without
 * a deployment. Everything the restaurant is — name, address, logo, colour —
 * arrives in `EmailOutlet`, read from `outlet_config` and the branding row at
 * send time (R12). The one fixed palette below is neutral greys and the two
 * signal colours, none of which is anybody's brand.
 *
 * Email HTML is its own dialect. Layout is nested tables with inline styles,
 * because Outlook renders through Word and Gmail strips `<style>` blocks from
 * anything but the head; widths are fixed at 600px, the width every client
 * agrees on; nothing depends on a web font. Every interpolated string passes
 * through `esc()` — item names and staff names are typed by people, and an
 * email is not the place to discover that a menu item is called `<b>`.
 *
 * Every email also carries a plain-text part (`text`), which is what a
 * watch, a screen reader on some clients, and a spam filter read.
 */

export interface EmailOutlet {
  readonly tradingName: string;
  readonly legalName: string;
  readonly address: string;
  readonly city: string;
  readonly phone: string;
  readonly email: string | null;
  readonly ntn: string | null;
  /** Absolute URL, or null to fall back to the name set as a wordmark. */
  readonly logoUrl: string | null;
  /** `rgb(…)` already — see `colour.ts`. */
  readonly brandColour: string;
  /** `rgb(…)` — the dark the brand is set on; used for the hero band. */
  readonly brandInk: string;
  readonly timezone: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/* ------------------------------------------------------------ primitives */

const INK = 'rgb(17, 24, 39)';
const MUTED = 'rgb(107, 114, 128)';
const SUBTLE = 'rgb(156, 163, 175)';
const RULE = 'rgb(229, 231, 235)';
const PAGE = 'rgb(243, 244, 246)';
const ZEBRA = 'rgb(249, 250, 251)';
const DANGER = 'rgb(185, 28, 28)';
const DANGER_SOFT = 'rgb(254, 242, 242)';
const OK = 'rgb(21, 128, 61)';
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function rs(value: bigint): string {
  return formatPaisa(value, { symbol: 'Rs.', trimWholeRupees: true });
}

/** `2026-09-24` → `Wednesday, 24 September 2026`. Held at UTC noon: it is a date, not an instant. */
export function longDate(businessDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${businessDate}T12:00:00Z`));
}

function clock(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(at);
}

function stamp(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(at);
}

/** Basis points as a share, to one decimal place: 8131 → `81.3%`, 10000 → `100%`. */
function percent(bps: number): string {
  const tenths = Math.round(bps / 10);
  const whole = Math.floor(tenths / 10);
  return tenths % 10 === 0 ? `${whole}%` : `${whole}.${tenths % 10}%`;
}

function sectionHeading(title: string, note?: string): string {
  return `
<tr><td style="padding:32px 40px 12px 40px;">
  <p style="margin:0;font:700 11px/1 ${FONT};letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${esc(title)}</p>
  ${note === undefined ? '' : `<p style="margin:6px 0 0 0;font:400 13px/1.5 ${FONT};color:${MUTED};">${esc(note)}</p>`}
</td></tr>`;
}

interface Column {
  readonly label: string;
  readonly align?: 'left' | 'right';
  readonly width?: string;
}

/** A zebra table with a hairline header. `cells` are already-escaped HTML. */
function dataTable(
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
  empty: string,
): string {
  const head = columns
    .map(
      (column) =>
        `<th align="${column.align ?? 'left'}" style="padding:10px 12px;border-bottom:2px solid ${INK};font:700 11px/1 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${INK};${column.width === undefined ? '' : `width:${column.width};`}">${esc(column.label)}</th>`,
    )
    .join('');
  const body =
    rows.length === 0
      ? `<tr><td colspan="${columns.length}" style="padding:16px 12px;font:400 14px/1.5 ${FONT};color:${MUTED};">${esc(empty)}</td></tr>`
      : rows
          .map(
            (cells, index) =>
              `<tr style="background:${index % 2 === 1 ? ZEBRA : 'rgb(255, 255, 255)'};">${cells
                .map(
                  (cell, cellIndex) =>
                    `<td align="${columns[cellIndex]?.align ?? 'left'}" valign="top" style="padding:10px 12px;border-bottom:1px solid ${RULE};font:400 14px/1.4 ${FONT};color:${INK};${columns[cellIndex]?.align === 'right' || cellIndex === 0 ? 'white-space:nowrap;' : ''}">${cell}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('');
  return `
<tr><td style="padding:0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</td></tr>`;
}

/** Two-by-N grid of small labelled figures. */
function kpiGrid(cells: readonly { label: string; value: string; note?: string }[]): string {
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += 3) {
    const slice = cells.slice(index, index + 3);
    rows.push(
      `<tr>${slice
        .map(
          (cell) => `
<td width="33%" valign="top" style="padding:16px;border:1px solid ${RULE};">
  <p style="margin:0;font:700 10px/1 ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">${esc(cell.label)}</p>
  <p style="margin:8px 0 0 0;font:700 20px/1.1 ${FONT};color:${INK};">${esc(cell.value)}</p>
  ${cell.note === undefined ? '' : `<p style="margin:4px 0 0 0;font:400 12px/1.3 ${FONT};color:${MUTED};">${esc(cell.note)}</p>`}
</td>`,
        )
        .join('')}${'<td width="33%" style="border:0;"></td>'.repeat(3 - slice.length)}</tr>`,
    );
  }
  return `
<tr><td style="padding:0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join('')}</table>
</td></tr>`;
}

/**
 * The frame both emails share: brand bar, logo, title block, body rows,
 * and the corporate footer with the disclaimer.
 */
function shell(input: {
  readonly outlet: EmailOutlet;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly preheader: string;
  readonly body: string;
  readonly generatedAt: Date;
}): string {
  const { outlet } = input;
  const logo =
    outlet.logoUrl === null
      ? `<p style="margin:0;font:800 26px/1 ${FONT};letter-spacing:3px;text-transform:uppercase;color:${INK};">${esc(outlet.tradingName)}</p>`
      : `<img src="${esc(outlet.logoUrl)}" alt="${esc(outlet.tradingName)}" height="64" style="display:block;margin:0 auto;height:64px;width:auto;border:0;outline:none;text-decoration:none;">`;
  const contact = [outlet.phone, outlet.email ?? ''].filter((part) => part.trim() !== '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(input.eyebrow)} — ${esc(outlet.tradingName)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">${esc(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:rgb(255, 255, 255);border-collapse:collapse;border:1px solid ${RULE};">
  <tr><td style="height:6px;line-height:6px;font-size:0;background:${outlet.brandColour};">&nbsp;</td></tr>
  <tr><td align="center" style="padding:36px 40px 8px 40px;">
    ${logo}
    <p style="margin:14px 0 0 0;font:400 12px/1.5 ${FONT};color:${MUTED};">${esc(outlet.address)}, ${esc(outlet.city)}</p>
  </td></tr>
  <tr><td style="padding:24px 40px 0 40px;"><div style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:24px 40px 8px 40px;">
    <p style="margin:0;font:700 11px/1 ${FONT};letter-spacing:3px;text-transform:uppercase;color:${outlet.brandColour};">${esc(input.eyebrow)}</p>
    <h1 style="margin:10px 0 0 0;font:700 26px/1.2 ${FONT};color:${INK};">${esc(input.title)}</h1>
    <p style="margin:8px 0 0 0;font:400 13px/1.5 ${FONT};color:${MUTED};">${esc(input.subtitle)}</p>
  </td></tr>
  ${input.body}
  <tr><td style="padding:40px 40px 0 40px;"><div style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:24px 40px 8px 40px;">
    <p style="margin:0;font:700 13px/1.5 ${FONT};color:${INK};">${esc(outlet.legalName)}</p>
    <p style="margin:2px 0 0 0;font:400 12px/1.6 ${FONT};color:${MUTED};">${esc(outlet.address)}, ${esc(outlet.city)}${contact.length === 0 ? '' : `<br>${contact.map(esc).join(' &nbsp;·&nbsp; ')}`}${outlet.ntn === null || outlet.ntn.trim() === '' ? '' : `<br>NTN ${esc(outlet.ntn)}`}</p>
  </td></tr>
  <tr><td style="padding:16px 40px 36px 40px;">
    <p style="margin:0;font:400 11px/1.6 ${FONT};color:${SUBTLE};">
      <strong style="color:${MUTED};">Confidential.</strong> This report is intended solely for the owners of ${esc(outlet.tradingName)} and may contain commercially sensitive information. If you have received it in error, please delete it and notify the sender; any other use, copying or distribution is prohibited.
    </p>
    <p style="margin:10px 0 0 0;font:400 11px/1.6 ${FONT};color:${SUBTLE};">
      Generated automatically by the point-of-sale system on ${esc(stamp(input.generatedAt, outlet.timezone))} from the records held at that time. It is a management summary, not a tax invoice or a fiscal return; figures for the day may still change if an invoice is credited later. The point-of-sale reports remain the record of account.
    </p>
    <p style="margin:14px 0 0 0;font:400 11px/1.6 ${FONT};color:${SUBTLE};">${esc(VENDOR_FOOTER_LINE)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ---------------------------------------------------- daily sales report */

export interface DailySalesInput {
  readonly outlet: EmailOutlet;
  readonly businessDate: string;
  readonly generatedAt: Date;
  /** The one `readSalesByDate` row for the day, or null for a day with no invoices. */
  readonly day: SalesByDateRow | null;
  readonly paymentMix: readonly PaymentMixRow[];
  readonly channelMix: readonly ChannelMixRow[];
  readonly topItems: readonly ItemSalesRow[];
  readonly exceptions: readonly ExceptionRow[];
  /** `ORDER_VOIDED_AFTER_BILL_*` rows for the day — the headline flag. */
  readonly flaggedCount: number;
}

const PAYMENT_LABEL: Record<PaymentMixRow['method'], string> = {
  CASH: 'Cash',
  CARD: 'Card',
  WALLET: 'Wallet',
  QR: 'QR',
};
const CHANNEL_LABEL: Record<ChannelMixRow['channel'], string> = {
  POS: 'In store (till)',
  WEB: 'Online orders',
  PHONE: 'Phone orders',
};

export function dailySalesEmail(input: DailySalesInput): RenderedEmail {
  const { outlet, day } = input;
  const zero = paisa(0n);
  const gross = day?.grossTakings ?? zero;
  const invoices = day?.invoiceCount ?? 0;
  // Rounded to the rupee like every other figure here; an average quoted to
  // the paisa reads as precision the owner has no use for.
  const average = invoices === 0 ? zero : paisa(((gross / BigInt(invoices) + 50n) / 100n) * 100n);
  const voids = input.exceptions.filter((row) => row.kind === 'VOID_ORDER').length;
  const unfinalized = input.exceptions.filter((row) => row.kind === 'BILL_NOT_FINALIZED').length;
  const payments = input.paymentMix.filter((row) => row.approvedCount > 0 || row.declinedCount > 0);
  const channels = input.channelMix.filter((row) => row.orderCount > 0);
  const top = input.topItems.slice(0, 10);

  const hero = `
<tr><td style="padding:16px 40px 24px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${outlet.brandInk};border-collapse:collapse;">
    <tr>
      <td style="padding:28px 28px;" valign="bottom">
        <p style="margin:0;font:700 11px/1 ${FONT};letter-spacing:2px;text-transform:uppercase;color:rgb(209, 213, 219);">Gross takings</p>
        <p style="margin:10px 0 0 0;font:800 38px/1 ${FONT};color:rgb(255, 255, 255);">${esc(rs(gross))}</p>
      </td>
      <td align="right" style="padding:28px 28px;" valign="bottom">
        <p style="margin:0;font:400 13px/1.7 ${FONT};color:rgb(209, 213, 219);"><strong style="color:rgb(255, 255, 255);font-size:18px;">${invoices}</strong> ${invoices === 1 ? 'invoice' : 'invoices'}<br>Average <strong style="color:rgb(255, 255, 255);">${esc(rs(average))}</strong></p>
      </td>
    </tr>
  </table>
</td></tr>`;

  const flagBanner =
    input.flaggedCount === 0 && unfinalized === 0
      ? `
<tr><td style="padding:0 40px 8px 40px;">
  <p style="margin:0;padding:12px 16px;border-left:4px solid ${OK};background:${ZEBRA};font:400 13px/1.5 ${FONT};color:${INK};">No bills were voided after printing and every printed bill was finalized.</p>
</td></tr>`
      : `
<tr><td style="padding:0 40px 8px 40px;">
  <p style="margin:0;padding:12px 16px;border-left:4px solid ${DANGER};background:${DANGER_SOFT};font:400 13px/1.5 ${FONT};color:${INK};"><strong style="color:${DANGER};">Needs your attention.</strong> ${input.flaggedCount} ${input.flaggedCount === 1 ? 'order was' : 'orders were'} voided after the bill was printed or shown, and ${unfinalized} printed ${unfinalized === 1 ? 'bill was' : 'bills were'} never finalized. The Activity Summary sent with this report lists each one.</p>
</td></tr>`;

  const body = [
    hero,
    flagBanner,
    sectionHeading('Summary'),
    kpiGrid([
      { label: 'Net sales', value: rs(day?.netSales ?? zero), note: 'after discounts, before tax' },
      { label: 'Tax collected', value: rs(day?.taxCollected ?? zero) },
      { label: 'Delivery charges', value: rs(day?.deliveryCharge ?? zero) },
      { label: 'Service charge', value: rs(day?.serviceCharge ?? zero) },
      { label: 'Covers', value: String(day?.covers ?? 0), note: 'dine-in guests' },
      { label: 'Orders voided', value: String(voids) },
    ]),
    sectionHeading('Payments received'),
    dataTable(
      [
        { label: 'Method' },
        { label: 'Payments', align: 'right' },
        { label: 'Share', align: 'right' },
        { label: 'Amount', align: 'right' },
      ],
      payments.map((row) => [
        esc(PAYMENT_LABEL[row.method]),
        `${row.approvedCount}${row.declinedCount === 0 ? '' : ` <span style="color:${DANGER};">(${row.declinedCount} declined)</span>`}`,
        esc(percent(row.shareBps)),
        `<strong>${esc(rs(row.amount))}</strong>`,
      ]),
      'No payments were taken.',
    ),
    sectionHeading('Sales by channel'),
    dataTable(
      [
        { label: 'Channel' },
        { label: 'Orders', align: 'right' },
        { label: 'Share', align: 'right' },
        { label: 'Net sales', align: 'right' },
      ],
      channels.map((row) => [
        esc(CHANNEL_LABEL[row.channel]),
        String(row.orderCount),
        esc(percent(row.shareBps)),
        `<strong>${esc(rs(row.netSales))}</strong>`,
      ]),
      'No orders were invoiced.',
    ),
    sectionHeading('Best sellers', 'Top ten items by net sales.'),
    dataTable(
      [
        { label: '#', width: '28px' },
        { label: 'Item' },
        { label: 'Qty', align: 'right' },
        { label: 'Net sales', align: 'right' },
      ],
      top.map((row, index) => [
        `<span style="color:${MUTED};">${index + 1}</span>`,
        `${esc(row.itemName)}<br><span style="font-size:12px;color:${MUTED};">${esc(row.categoryName)}</span>`,
        esc(formatQty(parseQty(row.qtySold))),
        `<strong>${esc(rs(row.netSales))}</strong>`,
      ]),
      'Nothing was sold.',
    ),
  ].join('');

  const title = longDate(input.businessDate);
  const html = shell({
    outlet,
    eyebrow: 'Daily Sales Report',
    title,
    subtitle: `Business day ${input.businessDate} · ${outlet.tradingName}`,
    preheader: `${rs(gross)} from ${invoices} ${invoices === 1 ? 'invoice' : 'invoices'}${input.flaggedCount > 0 ? ` · ${input.flaggedCount} flagged` : ''}`,
    body,
    generatedAt: input.generatedAt,
  });

  const text = [
    `${outlet.tradingName} — Daily Sales Report`,
    title,
    '',
    `Gross takings: ${rs(gross)} from ${invoices} invoices (average ${rs(average)})`,
    `Net sales: ${rs(day?.netSales ?? zero)}   Tax: ${rs(day?.taxCollected ?? zero)}`,
    `Delivery: ${rs(day?.deliveryCharge ?? zero)}   Service: ${rs(day?.serviceCharge ?? zero)}`,
    `Covers: ${day?.covers ?? 0}   Orders voided: ${voids}`,
    `Voided after bill: ${input.flaggedCount}   Bills never finalized: ${unfinalized}`,
    '',
    'Payments:',
    ...payments.map(
      (row) => `  ${PAYMENT_LABEL[row.method]}: ${row.approvedCount} — ${rs(row.amount)}`,
    ),
    '',
    'Best sellers:',
    ...top.map(
      (row, index) =>
        `  ${index + 1}. ${row.itemName} — ${formatQty(parseQty(row.qtySold))} — ${rs(row.netSales)}`,
    ),
    '',
    'Confidential. Intended solely for the owners. A management summary, not a tax invoice or a fiscal return.',
    VENDOR_FOOTER_LINE,
  ].join('\n');

  return {
    subject: `Daily Sales Report — ${title} — ${rs(gross)}`,
    html,
    text,
  };
}

/* ------------------------------------------------------ activity summary */

export interface FlaggedVoid {
  readonly at: Date;
  readonly orderNo: number | null;
  /** True for a printed bill, false for one only shown on screen. */
  readonly printed: boolean;
  readonly quoted: Paisa | null;
  readonly voidedBy: string;
  readonly billBy: string;
}

export interface StaffActivity {
  readonly name: string;
  readonly role: string | null;
  readonly actions: number;
  readonly billsPrinted: number;
  readonly voids: number;
  readonly discounts: number;
}

export interface ActivitySummaryInput {
  readonly outlet: EmailOutlet;
  readonly businessDate: string;
  readonly generatedAt: Date;
  readonly actionCount: number;
  readonly flagged: readonly FlaggedVoid[];
  /** `BILL_NOT_FINALIZED` from the exceptions report. */
  readonly unfinalized: readonly ExceptionRow[];
  /** Voids and discounts, newest first, from the audit trail. */
  readonly notable: readonly {
    at: Date;
    label: string;
    who: string;
    reference: string;
    amount: Paisa | null;
  }[];
  readonly staff: readonly StaffActivity[];
}

export function activitySummaryEmail(input: ActivitySummaryInput): RenderedEmail {
  const { outlet } = input;
  const tz = outlet.timezone;
  const attention = input.flagged.length + input.unfinalized.length;

  const flaggedBlock =
    attention === 0
      ? `
<tr><td style="padding:16px 40px 0 40px;">
  <p style="margin:0;padding:16px 18px;border-left:4px solid ${OK};background:${ZEBRA};font:400 14px/1.5 ${FONT};color:${INK};"><strong style="color:${OK};">Nothing to review.</strong> No order was voided after its bill was printed or shown, and every printed bill was finalized.</p>
</td></tr>`
      : `
<tr><td style="padding:16px 40px 0 40px;">
  <p style="margin:0;padding:16px 18px;border-left:4px solid ${DANGER};background:${DANGER_SOFT};font:400 14px/1.5 ${FONT};color:${INK};"><strong style="color:${DANGER};">${attention} ${attention === 1 ? 'item needs' : 'items need'} your review.</strong> A bill handed to a customer and then voided, or never finalized, is how a sale can be taken in cash and kept off the books. Each one is listed below with the staff member responsible.</p>
</td></tr>` +
        (input.flagged.length === 0
          ? ''
          : sectionHeading('Voided after the bill was printed or shown') +
            dataTable(
              [
                { label: 'Time' },
                { label: 'Order' },
                { label: 'Bill' },
                { label: 'Voided by' },
                { label: 'Quoted', align: 'right' },
              ],
              input.flagged.map((row) => [
                esc(clock(row.at, tz)),
                `<strong>${row.orderNo === null ? '—' : `#${row.orderNo}`}</strong>`,
                `<span style="color:${DANGER};font-weight:700;">${row.printed ? 'Printed' : 'Shown'}</span><br><span style="font-size:12px;color:${MUTED};">by ${esc(row.billBy)}</span>`,
                esc(row.voidedBy),
                `<strong style="color:${DANGER};">${row.quoted === null ? '—' : esc(rs(row.quoted))}</strong>`,
              ]),
              '',
            )) +
        (input.unfinalized.length === 0
          ? ''
          : sectionHeading('Bill printed or shown, never finalized') +
            dataTable(
              [
                { label: 'Time' },
                { label: 'Order' },
                { label: 'Staff' },
                { label: 'Quoted', align: 'right' },
              ],
              input.unfinalized.map((row) => [
                esc(clock(row.at, tz)),
                `<strong>${esc(row.reference)}</strong>${row.tableCode === null ? '' : ` · Table ${esc(row.tableCode)}`}${row.reason === null ? '' : `<br><span style="font-size:12px;color:${MUTED};">${esc(row.reason)}</span>`}`,
                esc(row.actorName),
                `<strong>${esc(rs(row.amount))}</strong>`,
              ]),
              '',
            ));

  const body = [
    sectionHeading('At a glance'),
    kpiGrid([
      { label: 'Recorded actions', value: String(input.actionCount) },
      { label: 'Staff active', value: String(input.staff.length) },
      { label: 'Needs review', value: String(attention) },
    ]),
    flaggedBlock,
    sectionHeading(
      'Voids and discounts',
      'Every order void, line void and discount recorded today.',
    ),
    dataTable(
      [
        { label: 'Time' },
        { label: 'Action' },
        { label: 'Staff' },
        { label: 'Amount', align: 'right' },
      ],
      input.notable.map((row) => [
        esc(clock(row.at, tz)),
        `${esc(row.label)}<br><span style="font-size:12px;color:${MUTED};">${esc(row.reference)}</span>`,
        esc(row.who),
        row.amount === null ? `<span style="color:${SUBTLE};">—</span>` : esc(rs(row.amount)),
      ]),
      'No voids or discounts were recorded.',
    ),
    sectionHeading('By staff member'),
    dataTable(
      [
        { label: 'Staff' },
        { label: 'Actions', align: 'right' },
        { label: 'Bills', align: 'right' },
        { label: 'Voids', align: 'right' },
        { label: 'Discounts', align: 'right' },
      ],
      input.staff.map((row) => [
        `<strong>${esc(row.name)}</strong>${row.role === null ? '' : `<br><span style="font-size:12px;color:${MUTED};">${esc(row.role.toLowerCase())}</span>`}`,
        String(row.actions),
        String(row.billsPrinted),
        row.voids === 0 ? '0' : `<strong>${row.voids}</strong>`,
        row.discounts === 0 ? '0' : `<strong>${row.discounts}</strong>`,
      ]),
      'No staff activity was recorded.',
    ),
  ].join('');

  const title = longDate(input.businessDate);
  const html = shell({
    outlet,
    eyebrow: 'Activity Summary',
    title,
    subtitle: `Business day ${input.businessDate} · from the activity log`,
    preheader:
      attention === 0
        ? `${input.actionCount} actions recorded — nothing to review`
        : `${attention} ${attention === 1 ? 'item needs' : 'items need'} your review`,
    body,
    generatedAt: input.generatedAt,
  });

  const text = [
    `${outlet.tradingName} — Activity Summary`,
    title,
    '',
    `Recorded actions: ${input.actionCount}   Staff active: ${input.staff.length}   Needs review: ${attention}`,
    '',
    'Voided after the bill was printed or shown:',
    ...(input.flagged.length === 0
      ? ['  none']
      : input.flagged.map(
          (row) =>
            `  ${clock(row.at, tz)} Order #${row.orderNo ?? '—'} — bill ${row.printed ? 'printed' : 'shown'} by ${row.billBy}, voided by ${row.voidedBy}, quoted ${row.quoted === null ? '—' : rs(row.quoted)}`,
        )),
    '',
    'Bill printed or shown, never finalized:',
    ...(input.unfinalized.length === 0
      ? ['  none']
      : input.unfinalized.map(
          (row) => `  ${clock(row.at, tz)} ${row.reference} — ${row.actorName} — ${rs(row.amount)}`,
        )),
    '',
    'By staff member:',
    ...input.staff.map(
      (row) =>
        `  ${row.name}: ${row.actions} actions, ${row.billsPrinted} bills, ${row.voids} voids, ${row.discounts} discounts`,
    ),
    '',
    'Confidential. Intended solely for the owners.',
    VENDOR_FOOTER_LINE,
  ].join('\n');

  return {
    subject:
      attention === 0
        ? `Activity Summary — ${title}`
        : `Activity Summary — ${title} — ${attention} to review`,
    html,
    text,
  };
}
