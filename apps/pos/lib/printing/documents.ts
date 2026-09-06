import 'server-only';
import { storefrontQrRaster } from './storefrontQrRaster';
import { visibleReceiptLines } from './receiptText';
import { formatPaisa } from '@natech/ui';
import type { EscPosDocument, EscPosLine } from '@natech/print-bridge/escpos';
import { rasterizeLogoImage, rasterizeUrduLine } from '@natech/print-bridge/raster';
import { VENDOR_FOOTER_LINE, type Invoice, type Order, type OutletConfig } from '@natech/contracts';
import type { BrandConfig } from '@natech/branding';
import { PAYMENT_METHOD_LABELS, formatQty, formatRate } from '@/components/lib/format';

/**
 * The ESC/POS tax invoice document — BUILD-PLAN.md §6.1, §7.1, §15.3;
 * docs/runfiles/M10-check-and-payment.md §2/§3; docs/runfiles/M15-urdu.md §2/§3.
 *
 * A plain-text rendering of the same figures `TaxInvoiceReceipt` already
 * shows on screen and in the HTML print path — not a pixel match, but the
 * same numbers. Money is formatted through `formatPaisa` (`@natech/ui`), the
 * one render boundary R1 permits — this file is another render boundary of
 * the same kind, a printed line instead of a screen pixel.
 *
 * §15.3 — ESC/POS text mode cannot render Nastaliq, so a `ReceiptUrduOptions`
 * with `showUrdu` on adds a rasterised line under each item name, and a
 * `logoReceiptUrl` adds the outlet's logo at the top, both through
 * `@natech/print-bridge/raster`'s shared rasterise-and-cache pipeline. Both
 * documents become async as a result — every raster call is awaited in print
 * order, so the returned `EscPosDocument` already carries the interleaved
 * buffer §15.3's diagram describes; `buildEscPosBuffer` itself stays sync.
 */
export interface ReceiptUrduOptions {
  readonly storefrontUrl?: string | null | undefined;
  readonly showUrdu: boolean;
  readonly logoReceiptUrl: string | null;
  readonly headerLines?: readonly string[];
  readonly footerLines?: readonly string[];
  readonly paymentDetails?: BrandConfig['receipt']['paymentDetails'];
}

const NO_URDU: ReceiptUrduOptions = { showUrdu: false, logoReceiptUrl: null };

function money(paisa: bigint): string {
  return formatPaisa(paisa, { symbol: 'Rs.' });
}

function rule(): EscPosLine {
  return { text: '-'.repeat(32) };
}

function activeLines(order: Order): Order['lines'] {
  return order.lines.filter((line) => line.voidReason === null);
}

/** A raster line under the English one, only when Urdu is on and a translation exists. */
async function urduLine(nameUr: string | null, receipt: ReceiptUrduOptions): Promise<EscPosLine[]> {
  if (!receipt.showUrdu || nameUr === null || nameUr.trim() === '') return [];
  return [{ raster: await rasterizeUrduLine(nameUr), align: 'right' }];
}

/**
 * The receipt logo, once, at the top — never printed on the ESC/POS path
 * before this milestone (§15.3's last line). A missing URL, a failed fetch,
 * or a non-PNG logo all resolve to no logo rather than a broken receipt.
 */
async function logoLines(receipt: ReceiptUrduOptions): Promise<EscPosLine[]> {
  if (receipt.logoReceiptUrl === null) return [];
  try {
    const response = await fetch(receipt.logoReceiptUrl);
    if (!response.ok) return [];
    const bytes = Buffer.from(await response.arrayBuffer());
    const raster = await rasterizeLogoImage(bytes);
    return raster === null ? [] : [{ raster, align: 'center' }];
  } catch {
    return [];
  }
}

export async function invoiceEscPosDocument(
  outlet: OutletConfig,
  order: Order,
  invoice: Invoice,
  receipt: ReceiptUrduOptions = NO_URDU,
): Promise<EscPosDocument> {
  const lines: EscPosLine[] = [
    ...(await logoLines(receipt)),
    { text: outlet.tradingName, align: 'center', bold: true },
    { text: outlet.address, align: 'center' },
    ...(invoice.taxLines.length === 0 || outlet.ntn.trim() === ''
      ? []
      : ([{ text: `NTN ${outlet.ntn}`, align: 'center' as const }] satisfies EscPosLine[])),
    ...visibleReceiptLines(receipt.headerLines ?? [], invoice.taxLines.length > 0).map((text) => ({
      text,
      align: 'center' as const,
    })),
    rule(),
    {
      text: invoice.taxLines.length === 0 ? 'SALE RECEIPT' : 'TAX INVOICE',
      align: 'center',
      bold: true,
    },
    rule(),
    { text: `INVOICE NO. ${invoice.localNo}`, align: 'center', bold: true },
    rule(),
    { text: order.tableCode === null ? order.type : `Table ${order.tableCode}` },
    { text: `Order #${order.orderNo}` },
    rule(),
  ];

  for (const line of activeLines(order)) {
    lines.push({ text: `${line.nameSnapshot}  x${formatQty(line.qty)}` });
    lines.push(...(await urduLine(line.nameUrSnapshot, receipt)));
  }

  lines.push(rule());
  lines.push({
    text: `${invoice.taxLines.length === 0 ? 'Subtotal' : 'Total (ex tax)'}  ${money(invoice.taxableBase)}`,
  });
  for (const taxLine of invoice.taxLines) {
    lines.push({
      text: `Sales tax @ ${formatRate(taxLine.rateBps)} (${PAYMENT_METHOD_LABELS[taxLine.paymentMethodScope].toLowerCase()})  ${money(taxLine.amount)}`,
    });
  }
  if (order.type === 'DELIVERY' && order.deliveryAddress)
    lines.push({ text: `Delivery address: ${order.deliveryAddress}` });
  if (invoice.deliveryCharge !== undefined && invoice.deliveryCharge > 0n)
    lines.push({ text: `Delivery charges  ${money(invoice.deliveryCharge)}` });
  if (invoice.posFee !== 0n) lines.push({ text: `POS service fee  ${money(invoice.posFee)}` });
  if (invoice.serviceCharge !== 0n)
    lines.push({ text: `Service charge  ${money(invoice.serviceCharge)}` });
  lines.push(rule());
  lines.push({ text: `TOTAL  ${money(invoice.grandTotal)}`, bold: true });
  lines.push(rule());

  for (const text of visibleReceiptLines(receipt.footerLines ?? [], invoice.taxLines.length > 0))
    lines.push({ text, align: 'center' });
  const payment = receipt.paymentDetails;
  if (payment !== undefined && Object.values(payment).some(Boolean)) {
    lines.push(rule());
    if (payment.bankName !== '') lines.push({ text: `Bank: ${payment.bankName}` });
    if (payment.iban !== '') lines.push({ text: `IBAN: ${payment.iban}` });
    if (payment.accountNumber !== '') lines.push({ text: `Account No: ${payment.accountNumber}` });
    if (payment.jazzCash !== '') lines.push({ text: `JazzCash: ${payment.jazzCash}` });
    if (payment.easyPaisa !== '') lines.push({ text: `EasyPaisa: ${payment.easyPaisa}` });
  }
  const onlineQr = storefrontQrRaster(receipt.storefrontUrl);
  if (onlineQr !== null) {
    lines.push({ text: 'Order Online', align: 'center', bold: true });
    lines.push({ raster: onlineQr, align: 'center' });
  }
  lines.push({ text: VENDOR_FOOTER_LINE, align: 'center' });

  return { lines };
}
