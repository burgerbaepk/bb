'use client';

import { useState } from 'react';
import { DataTable, Money, SegmentedControl } from '@natech/ui';
import { paisa } from '@natech/domain';
import type {
  CategoryMixRow,
  ChannelMixRow,
  DateRange,
  ItemSalesRow,
  PaymentMixRow,
  SalesByDateRow,
} from '@natech/contracts';
import { ReportShell } from './ReportShell';
import { formatBusinessDate, formatShare } from '@/components/lib/format';

/**
 * Sales — BUILD-PLAN.md §17, R16, defects C3, C4.
 *
 * Every table here computes its summary from the rows it is rendering, which is
 * what `DataTable` makes structural: `summary` is a function of `rows` and there
 * is no way to hand it a figure from elsewhere. The system this replaces reports
 * `Total Revenue Rs. 0` beside `Total Orders 19984`.
 *
 * Item sales is the report defect C4 lives in — the current Popular Items lists
 * dishes that are not on this menu, which is mock data left in a shipped
 * surface. The `mock-data-grep` gate is the structural answer; this screen only
 * ever renders what it is given.
 */
type Tab = 'DATE' | 'ITEM' | 'CATEGORY' | 'CHANNEL' | 'PAYMENT';

/** Export follows the active tab — the tab on screen is what gets exported. */
const TAB_REPORT_KIND: Record<Tab, string> = {
  DATE: 'sales-by-date',
  ITEM: 'item-sales',
  CATEGORY: 'category-mix',
  CHANNEL: 'channel-mix',
  PAYMENT: 'payment-mix',
};

export interface SalesReportProps {
  readonly range: DateRange;
  readonly byDate: readonly SalesByDateRow[];
  readonly byItem: readonly ItemSalesRow[];
  readonly byCategory: readonly CategoryMixRow[];
  readonly byChannel: readonly ChannelMixRow[];
  readonly byPayment: readonly PaymentMixRow[];
}

export function SalesReport({
  range,
  byDate,
  byItem,
  byCategory,
  byChannel,
  byPayment,
}: SalesReportProps) {
  const [tab, setTab] = useState<Tab>('DATE');

  return (
    <ReportShell
      title="Sales"
      note="Net sales exclude tax. Gross takings are what actually crossed the counter, tax and service charge included."
      range={range}
      reportKind={TAB_REPORT_KIND[tab]}
    >
      <div className="mb-4">
        <SegmentedControl
          label="Sales breakdown"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'DATE' as const, label: 'By date', count: byDate.length },
            { value: 'ITEM' as const, label: 'By item', count: byItem.length },
            { value: 'CATEGORY' as const, label: 'By category', count: byCategory.length },
            { value: 'CHANNEL' as const, label: 'By channel', count: byChannel.length },
            { value: 'PAYMENT' as const, label: 'By payment', count: byPayment.length },
          ]}
        />
      </div>

      {tab === 'DATE' && (
        <DataTable
          rows={byDate}
          getRowId={(row) => row.businessDate}
          caption="Sales by business date"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, row) => total + row.invoiceCount, 0)}
              </strong>{' '}
              invoices ·{' '}
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, row) => total + row.covers, 0)}
              </strong>{' '}
              covers · net{' '}
              <Money
                value={paisa(rows.reduce((total, row) => total + row.netSales, 0n))}
                symbol="Rs."
                emphasis="strong"
              />{' '}
              · tax{' '}
              <Money value={paisa(rows.reduce((total, row) => total + row.taxCollected, 0n))} />
            </span>
          )}
          columns={[
            {
              key: 'date',
              header: 'Business date',
              render: (row) => formatBusinessDate(row.businessDate),
            },
            {
              key: 'invoices',
              header: 'Invoices',
              numeric: true,
              render: (row) => <span className="tabular-nums">{row.invoiceCount}</span>,
            },
            {
              key: 'covers',
              header: 'Covers',
              numeric: true,
              secondary: true,
              render: (row) => <span className="tabular-nums">{row.covers}</span>,
            },
            {
              key: 'net',
              header: 'Net sales',
              numeric: true,
              render: (row) => <Money value={row.netSales} />,
            },
            {
              key: 'tax',
              header: 'Tax collected',
              numeric: true,
              secondary: true,
              render: (row) => <Money value={row.taxCollected} />,
            },
            {
              key: 'delivery',
              header: 'Delivery charges',
              numeric: true,
              render: (row) => <Money value={row.deliveryCharge ?? paisa(0n)} />,
            },
            {
              key: 'gross',
              header: 'Gross takings',
              numeric: true,
              render: (row) => <Money value={row.grossTakings} emphasis="strong" />,
            },
          ]}
        />
      )}

      {tab === 'ITEM' && (
        <DataTable
          rows={byItem}
          getRowId={(row) => row.itemName}
          caption="Item sales"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">{rows.length}</strong> items · net{' '}
              <Money
                value={paisa(rows.reduce((total, row) => total + row.netSales, 0n))}
                symbol="Rs."
                emphasis="strong"
              />
            </span>
          )}
          columns={[
            { key: 'item', header: 'Item', render: (row) => row.itemName },
            {
              key: 'category',
              header: 'Category',
              secondary: true,
              render: (row) => row.categoryName,
            },
            {
              key: 'qty',
              header: 'Sold',
              numeric: true,
              render: (row) => <span className="tabular-nums">{row.qtySold}</span>,
            },
            {
              key: 'net',
              header: 'Net sales',
              numeric: true,
              render: (row) => <Money value={row.netSales} />,
            },
          ]}
        />
      )}

      {tab === 'CATEGORY' && (
        <DataTable
          rows={byCategory}
          getRowId={(row) => row.categoryName}
          caption="Category mix"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">{rows.length}</strong> categories · net{' '}
              <Money
                value={paisa(rows.reduce((total, row) => total + row.netSales, 0n))}
                symbol="Rs."
                emphasis="strong"
              />
            </span>
          )}
          columns={[
            { key: 'category', header: 'Category', render: (row) => row.categoryName },
            {
              key: 'items',
              header: 'Items sold',
              numeric: true,
              secondary: true,
              render: (row) => <span className="tabular-nums">{row.itemCount}</span>,
            },
            {
              key: 'net',
              header: 'Net sales',
              numeric: true,
              render: (row) => <Money value={row.netSales} />,
            },
            {
              key: 'share',
              header: 'Share',
              numeric: true,
              render: (row) => <span className="tabular-nums">{formatShare(row.shareBps)}</span>,
            },
          ]}
        />
      )}

      {tab === 'CHANNEL' && (
        <DataTable
          rows={byChannel}
          getRowId={(row) => row.channel}
          caption="Channel mix"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, row) => total + row.orderCount, 0)}
              </strong>{' '}
              orders · net{' '}
              <Money
                value={paisa(rows.reduce((total, row) => total + row.netSales, 0n))}
                symbol="Rs."
                emphasis="strong"
              />
            </span>
          )}
          columns={[
            { key: 'channel', header: 'Channel', render: (row) => row.channel },
            {
              key: 'orders',
              header: 'Orders',
              numeric: true,
              render: (row) => <span className="tabular-nums">{row.orderCount}</span>,
            },
            {
              key: 'net',
              header: 'Net sales',
              numeric: true,
              render: (row) => <Money value={row.netSales} />,
            },
            {
              key: 'share',
              header: 'Share',
              numeric: true,
              render: (row) => <span className="tabular-nums">{formatShare(row.shareBps)}</span>,
            },
          ]}
        />
      )}

      {tab === 'PAYMENT' && (
        <DataTable
          rows={byPayment}
          getRowId={(row) => row.method}
          caption="Payment method mix"
          summary={(rows) => (
            <span>
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, row) => total + row.approvedCount, 0)}
              </strong>{' '}
              approved ·{' '}
              <strong className="text-ink tabular-nums">
                {rows.reduce((total, row) => total + row.declinedCount, 0)}
              </strong>{' '}
              declined ·{' '}
              <Money
                value={paisa(rows.reduce((total, row) => total + row.amount, 0n))}
                symbol="Rs."
                emphasis="strong"
              />
            </span>
          )}
          columns={[
            { key: 'method', header: 'Method', render: (row) => row.method },
            {
              key: 'approved',
              header: 'Approved',
              numeric: true,
              render: (row) => <span className="tabular-nums">{row.approvedCount}</span>,
            },
            {
              key: 'declined',
              header: 'Declined',
              numeric: true,
              render: (row) => (
                <span className={row.declinedCount > 0 ? 'text-warn tabular-nums' : 'tabular-nums'}>
                  {row.declinedCount}
                </span>
              ),
            },
            {
              key: 'amount',
              header: 'Taken',
              numeric: true,
              render: (row) => <Money value={row.amount} />,
            },
            {
              key: 'share',
              header: 'Share',
              numeric: true,
              secondary: true,
              render: (row) => <span className="tabular-nums">{formatShare(row.shareBps)}</span>,
            },
          ]}
        />
      )}
    </ReportShell>
  );
}
