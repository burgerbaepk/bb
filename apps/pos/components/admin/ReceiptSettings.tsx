'use client';

import { useActionState, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, SelectField, Switch, TextAreaField, TextField } from '@natech/ui';
import type { BrandConfig } from '@natech/branding';
import type { Invoice, Order, OutletConfig } from '@natech/contracts';
import { saveReceiptSettingsAction } from '@/lib/branding/receipt-actions';
import { PageHeading } from './PageHeading';
import { ReceiptPreview } from './ReceiptPreview';

/** Split a textarea into the lines the receipt frame will actually print. */
function toLines(value: string): readonly string[] {
  return value.split('\n').map((line) => line.trim());
}

const IDLE = { error: null, message: null };

export function ReceiptSettings({
  receipt,
  outlet,
  latestInvoice = null,
  storefrontUrl = null,
  embedded = false,
}: {
  readonly receipt: BrandConfig['receipt'];
  /** Null only if the outlet row has not been filled in yet — no preview without an identity to print. */
  readonly outlet?: OutletConfig | null;
  readonly latestInvoice?: { readonly invoice: Invoice; readonly order: Order } | null;
  readonly storefrontUrl?: string | null;
  readonly embedded?: boolean;
}) {
  const [state, action, pending] = useActionState(saveReceiptSettingsAction, IDLE);
  // Every field the preview reads is controlled, so the paper below moves as
  // the manager types rather than only after a save-and-reload round trip.
  const [widthMm, setWidthMm] = useState<'58' | '80'>(receipt.widthMm === 58 ? '58' : '80');
  const [showUrdu, setShowUrdu] = useState(receipt.showUrdu);
  const [headerLines, setHeaderLines] = useState(receipt.headerLines.join('\n'));
  const [footerLines, setFooterLines] = useState(receipt.footerLines.join('\n'));
  const [paymentDetails, setPaymentDetails] = useState(receipt.paymentDetails);
  const setDetail = (key: keyof BrandConfig['receipt']['paymentDetails'], value: string) =>
    setPaymentDetails((current) => ({ ...current, [key]: value }));
  return (
    <form action={action}>
      {embedded ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Receipt & invoice</h2>
            <p className="text-ink-muted mt-1 text-sm">
              Choose what customers see on printed receipts and tax invoices.
            </p>
          </div>
          <Button type="submit" tone="primary" icon={Save} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      ) : (
        <PageHeading
          title="Receipt & invoice"
          note="Choose what customers see on printed receipts and tax invoices."
          actions={
            <Button type="submit" tone="primary" icon={Save} disabled={pending}>
              {pending ? 'Saving…' : 'Save settings'}
            </Button>
          }
        />
      )}
      <div className="space-y-4">
        <section className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="mb-3 font-semibold">Paper and language</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Paper width"
              name="widthMm"
              value={widthMm}
              onChange={(event) => setWidthMm(event.target.value === '58' ? '58' : '80')}
              options={[
                { value: '80', label: '80mm' },
                { value: '58', label: '58mm' },
              ]}
            />
            <div className="space-y-3">
              <Switch checked={showUrdu} onChange={setShowUrdu} label="Print Urdu item names" />
              <input type="hidden" name="showUrdu" value={showUrdu ? 'true' : 'false'} />
            </div>
          </div>
        </section>
        <section className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="mb-1 font-semibold">Payment details</h2>
          <p className="text-ink-muted mb-3 text-sm">
            Only completed fields are printed in the receipt footer.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Bank name"
              name="bankName"
              value={paymentDetails.bankName}
              onChange={(event) => setDetail('bankName', event.target.value)}
              placeholder="Meezan Bank"
            />
            <TextField
              label="IBAN"
              name="iban"
              value={paymentDetails.iban}
              onChange={(event) => setDetail('iban', event.target.value)}
            />
            <TextField
              label="Account number"
              name="accountNumber"
              value={paymentDetails.accountNumber}
              onChange={(event) => setDetail('accountNumber', event.target.value)}
            />
            <TextField
              label="JazzCash"
              name="jazzCash"
              value={paymentDetails.jazzCash}
              onChange={(event) => setDetail('jazzCash', event.target.value)}
            />
            <TextField
              label="EasyPaisa"
              name="easyPaisa"
              value={paymentDetails.easyPaisa}
              onChange={(event) => setDetail('easyPaisa', event.target.value)}
            />
          </div>
        </section>
        <section className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="mb-3 font-semibold">Custom content</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField
              label="Header lines"
              value={headerLines}
              onChange={setHeaderLines}
              help="One line per row, up to six lines."
            />
            <input type="hidden" name="headerLines" value={headerLines} />
            <TextAreaField
              label="Footer lines"
              value={footerLines}
              onChange={setFooterLines}
              help="One line per row, up to six lines."
            />
            <input type="hidden" name="footerLines" value={footerLines} />
          </div>
        </section>
        {outlet != null && (
          <ReceiptPreview
            outlet={outlet}
            latest={latestInvoice}
            storefrontUrl={storefrontUrl}
            widthMm={widthMm === '58' ? 58 : 80}
            showUrdu={showUrdu}
            headerLines={toLines(headerLines)}
            footerLines={toLines(footerLines)}
            paymentDetails={paymentDetails}
          />
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-ok text-sm">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
