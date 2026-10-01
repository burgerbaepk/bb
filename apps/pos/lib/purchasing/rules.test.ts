import { describe, expect, it } from 'vitest';
import { paisa, parsePaisa, parseQty } from '@natech/domain';
import {
  billTotal,
  collectLines,
  parseOptionalRupees,
  refuseSettlement,
  runningStatement,
  supplierBalance,
} from './rules';

/**
 * ADR 0035 — the purchasing rules. Asserted against the ADR's statements, not
 * against the implementation: a bill totals goods + charges − discount, the
 * payables balance is opening + posted bills − payments, and a payment can
 * neither exceed what is owed nor reach the till unless it is cash, today.
 */

const names = new Map([
  ['chicken', 'Chicken'],
  ['rice', 'Rice'],
]);
const line = (itemId: string, qty: string, amount = '', unit = '') => ({
  itemId,
  qty,
  amount,
  unit,
});

describe('collectLines', () => {
  it('skips the blank row the form keeps at the bottom', () => {
    const { lines, errors } = collectLines([line('chicken', '20', '13000'), line('', '')], names, {
      amountRequired: true,
    });
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { itemId: 'chicken', quantity: parseQty('20'), amount: parsePaisa('13000'), unit: null },
    ]);
  });

  it('accepts thousands separators in the amount, as bills print them', () => {
    const { lines } = collectLines([line('rice', '0.5', '1,250.50')], names, {
      amountRequired: true,
    });
    expect(lines[0]?.amount).toBe(parsePaisa('1250.50'));
  });

  it('names the item in every refusal', () => {
    const { errors } = collectLines(
      [line('chicken', '0', '100'), line('rice', 'abc', '100')],
      names,
      { amountRequired: true },
    );
    expect(errors).toEqual([
      'Chicken: the quantity must be more than zero.',
      'Rice: enter a quantity, e.g. 20 or 0.25.',
    ]);
  });

  it('refuses an item chosen twice instead of merging the lines', () => {
    const { errors } = collectLines(
      [line('chicken', '2', '100'), line('chicken', '3', '150')],
      names,
      { amountRequired: true },
    );
    expect(errors).toEqual(['Chicken: appears twice. Put it on one line.']);
  });

  it('requires an amount on a bill line but not on a PO line', () => {
    expect(collectLines([line('rice', '5')], names, { amountRequired: true }).errors).toEqual([
      'Rice: enter the line amount from the bill.',
    ]);
    expect(collectLines([line('rice', '5')], names, { amountRequired: false }).lines[0]).toEqual({
      itemId: 'rice',
      quantity: parseQty('5'),
      amount: null,
      unit: null,
    });
  });

  it('refuses an item that is not in the catalogue', () => {
    expect(collectLines([line('ghost', '1', '1')], names, { amountRequired: true }).errors).toEqual(
      ['Line 1: choose an item from the list.'],
    );
  });
});

describe('billTotal', () => {
  it('is goods plus charges less discount, exact to the paisa', () => {
    expect(
      billTotal(
        [parsePaisa('13000'), parsePaisa('1250.50')],
        parsePaisa('300'),
        parsePaisa('0.50'),
      ),
    ).toBe(parsePaisa('14550'));
  });
});

describe('supplierBalance', () => {
  it('is opening plus posted bills less payments', () => {
    expect(
      supplierBalance(parsePaisa('5000'), [parsePaisa('14550')], [parsePaisa('10000')]),
    ).toEqual({
      billed: parsePaisa('14550'),
      paid: parsePaisa('10000'),
      balance: parsePaisa('9550'),
    });
  });

  it('goes negative when a paid bill is cancelled — an advance with the supplier', () => {
    expect(supplierBalance(paisa(0n), [], [parsePaisa('100')]).balance).toBe(parsePaisa('-100'));
  });
});

describe('refuseSettlement', () => {
  const base = {
    amount: parsePaisa('1000'),
    method: 'CASH' as const,
    throughTill: false,
    occurredOn: '2026-10-01',
    today: '2026-10-01',
    balance: parsePaisa('1000'),
  };

  it('allows paying the whole balance', () => {
    expect(refuseSettlement(base)).toBeNull();
  });

  it('refuses more than the balance', () => {
    expect(refuseSettlement({ ...base, amount: parsePaisa('1000.01') })).toBe(
      'That is more than the balance of Rs. 1,000.00. Check the amount.',
    );
  });

  it('refuses a cheque through the till, and till cash not dated today', () => {
    expect(refuseSettlement({ ...base, method: 'CHEQUE', throughTill: true })).toBe(
      'Only cash goes through the till.',
    );
    expect(refuseSettlement({ ...base, throughTill: true, occurredOn: '2026-09-30' })).toBe(
      'Cash through the till must be dated today.',
    );
  });

  it('refuses zero and the future', () => {
    expect(refuseSettlement({ ...base, amount: paisa(0n) })).toBe(
      'Enter an amount greater than zero.',
    );
    expect(refuseSettlement({ ...base, occurredOn: '2026-10-02' })).toBe(
      'A payment cannot be dated in the future.',
    );
  });
});

describe('parseOptionalRupees', () => {
  it('reads blank as zero and refuses a negative', () => {
    expect(parseOptionalRupees('', 'Charges')).toBe(paisa(0n));
    expect(parseOptionalRupees('-5', 'Charges')).toBe('Charges cannot be negative.');
  });
});

describe('runningStatement', () => {
  const entry = (id: string, date: string, kind: 'BILL' | 'PAYMENT', amount: string) => ({
    id,
    date,
    kind,
    reference: id,
    detail: null,
    debit: kind === 'BILL' ? parsePaisa(amount) : null,
    credit: kind === 'PAYMENT' ? parsePaisa(amount) : null,
    href: null,
  });

  it('runs oldest first, bill before payment on one day, and ends on the derived balance', () => {
    const rows = runningStatement(parsePaisa('500'), [
      entry('pay', '2026-09-02', 'PAYMENT', '1000'),
      entry('bill2', '2026-09-02', 'BILL', '800'),
      entry('bill1', '2026-09-01', 'BILL', '1200'),
    ]);
    expect(rows.map((row) => [row.id, row.balance])).toEqual([
      ['opening', parsePaisa('500')],
      ['bill1', parsePaisa('1700')],
      ['bill2', parsePaisa('2500')],
      ['pay', parsePaisa('1500')],
    ]);
    expect(rows.at(-1)?.balance).toBe(
      supplierBalance(
        parsePaisa('500'),
        [parsePaisa('1200'), parsePaisa('800')],
        [parsePaisa('1000')],
      ).balance,
    );
  });
});
