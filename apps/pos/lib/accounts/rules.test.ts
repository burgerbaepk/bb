import { describe, expect, it } from 'vitest';
import { paisa, parsePaisa } from '@natech/domain';
import { accountBalance, amountOnAccount, refuseCreditSale } from './rules';

/**
 * ADR 0036 — asserted against the ADR's statements: the balance is opening +
 * charges − payments; a credit sale needs an open account, something actually
 * left on credit, and room under the limit (a null limit is no limit).
 */

describe('accountBalance', () => {
  it('is opening plus charges less payments, exact to the paisa', () => {
    expect(
      accountBalance(
        parsePaisa('1000'),
        [parsePaisa('2450.50'), parsePaisa('99.50')],
        [parsePaisa('1500')],
      ),
    ).toEqual({
      charged: parsePaisa('2550'),
      paid: parsePaisa('1500'),
      balance: parsePaisa('2050'),
    });
  });
});

describe('refuseCreditSale', () => {
  const sale = {
    grandTotal: parsePaisa('3000'),
    paidNow: paisa(0n),
    balance: parsePaisa('5000'),
    creditLimit: parsePaisa('8000'),
    accountActive: true,
  };

  it('allows a sale that lands exactly on the limit', () => {
    expect(refuseCreditSale(sale)).toBeNull();
  });

  it('refuses one paisa over the limit, and counts cash paid now against it', () => {
    expect(refuseCreditSale({ ...sale, grandTotal: parsePaisa('3000.01') })).toMatch(
      /credit limit/,
    );
    expect(
      refuseCreditSale({ ...sale, grandTotal: parsePaisa('4000'), paidNow: parsePaisa('1000') }),
    ).toBeNull();
  });

  it('treats a null limit as no limit', () => {
    expect(
      refuseCreditSale({ ...sale, creditLimit: null, grandTotal: parsePaisa('1000000') }),
    ).toBeNull();
  });

  it('refuses a closed account, and a sale with nothing left on credit', () => {
    expect(refuseCreditSale({ ...sale, accountActive: false })).toMatch(/closed/);
    expect(refuseCreditSale({ ...sale, paidNow: parsePaisa('3000') })).toMatch(/cash sale/);
  });
});

describe('amountOnAccount', () => {
  const approved = (amount: string) => ({ amount: parsePaisa(amount), attemptStatus: 'APPROVED' });

  it('is the total less what was taken at the counter, ignoring declined attempts', () => {
    expect(
      amountOnAccount({
        grandTotal: parsePaisa('2450'),
        payments: [approved('1000'), { amount: parsePaisa('1450'), attemptStatus: 'DECLINED' }],
      }),
    ).toBe(parsePaisa('1450'));
  });

  it('is zero on a sale paid in full, and the whole total when nothing was taken', () => {
    expect(amountOnAccount({ grandTotal: parsePaisa('500'), payments: [approved('500')] })).toBe(
      paisa(0n),
    );
    expect(amountOnAccount({ grandTotal: parsePaisa('500'), payments: [] })).toBe(
      parsePaisa('500'),
    );
  });
});
