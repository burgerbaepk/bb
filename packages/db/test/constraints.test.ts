import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeDb, dbWrite } from '../src/client';
import { allocateLocalNo } from '../src/counters';
import {
  attendance,
  demandItems,
  employees,
  invoiceCounter,
  invoices,
  orders,
  staffAdvances,
  stockMovements,
  tables,
  zones,
} from '../src/schema';

/**
 * M02 gate — the constraints, exercised against a real database.
 *
 * These assert behaviour only Postgres can provide: a trigger, a CHECK, and a
 * partial unique index. A unit test cannot stand in for them, because the point
 * of R5 and R10 is that they hold against code this repository does not contain.
 *
 * Skipped when no database URL is present, so CI without secrets stays green.
 */
const databaseUrl = process.env['NEON_DATABASE_URL'];
const hasDatabase = typeof databaseUrl === 'string' && databaseUrl.length > 0;

const suite = hasDatabase ? describe : describe.skip;

type Tx = Parameters<Parameters<ReturnType<typeof dbWrite>['transaction']>[0]>[0];

/** Sentinel used to roll a transaction back once its assertions have run. */
class Rollback extends Error {}

/**
 * Run inside a transaction that is always rolled back. Necessary rather than
 * tidy: a finalized invoice cannot be deleted afterwards — that is R5 — so the
 * only way to clean up is never to commit.
 */
async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await dbWrite().transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/**
 * Assert that a statement is rejected, and return the error.
 *
 * The savepoint is the whole reason this helper exists. In Postgres a failed
 * statement aborts the entire transaction — every later command returns 25P02
 * until rollback — so a bare `expect(...).rejects` poisons the transaction and
 * every assertion after it fails for the wrong reason. A nested drizzle
 * transaction issues SAVEPOINT / ROLLBACK TO, which contains the failure.
 */
async function rejected(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string> {
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
  } catch (error) {
    // Drizzle wraps the driver error in "Failed query: ..." and hangs the
    // original Postgres message — the one naming the trigger or constraint —
    // off .cause. Flatten the chain so assertions can read either.
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    }
    return parts.join(String.fromCharCode(10));
  }
  throw new Error('expected the statement to be rejected, but it succeeded');
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Minimal chain: an order, then a finalized invoice against it. */
async function makeFinalizedInvoice(tx: Tx): Promise<{ id: string; localNo: string }> {
  const [order] = await tx
    .insert(orders)
    .values({ orderNo: 1, businessDate: '2026-08-22' })
    .returning({ id: orders.id });

  const localNo = unique('INV');
  const [invoice] = await tx
    .insert(invoices)
    .values({
      orderId: order!.id,
      localNo,
      businessDate: '2026-08-22',
      subtotal: 1222000n,
      taxableBase: 1222000n,
      taxTotal: 97760n,
      serviceCharge: 61100n,
      posFee: 100n,
      grandTotal: 1380960n,
      taxSnapshot: { engineVersion: '0.0.0-test' },
      status: 'FINALIZED',
    })
    .returning({ id: invoices.id });

  return { id: invoice!.id, localNo };
}

afterAll(async () => {
  await closeDb();
});

suite('R5 — invoices_immutable_after_finalize', () => {
  it('rejects an UPDATE of a monetary column', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp.update(invoices).set({ grandTotal: 1n }).where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5/);
      expect(error).toMatch(/immutable/);
    });
  });

  it('rejects changing delivery charges after finalization', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp.update(invoices).set({ deliveryCharge: 15000n }).where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5/);
    });
  });

  it('rejects an UPDATE of local_no', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp.update(invoices).set({ localNo: 'INV-TAMPERED' }).where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5/);
    });
  });

  it('rejects an UPDATE of the tax snapshot', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp
          .update(invoices)
          .set({ taxSnapshot: { tampered: true } })
          .where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5/);
    });
  });

  it('rejects a soft delete after finalization', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp.update(invoices).set({ deletedAt: new Date() }).where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5/);
    });
  });

  it('rejects a hard DELETE', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      const error = await rejected(tx, (sp) =>
        sp.delete(invoices).where(eq(invoices.id, invoice.id)),
      );
      expect(error).toMatch(/R5\/R6/);
    });
  });

  it('permits incrementing the print counter', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);

      await tx.update(invoices).set({ printedCount: 2 }).where(eq(invoices.id, invoice.id));

      const [after] = await tx
        .select({ printed: invoices.printedCount })
        .from(invoices)
        .where(eq(invoices.id, invoice.id));

      expect(after?.printed).toBe(2);
    });
  });

  it('permits CREDITED, the sanctioned transition out of FINALIZED', async () => {
    await inRollback(async (tx) => {
      const invoice = await makeFinalizedInvoice(tx);
      await tx.update(invoices).set({ status: 'CREDITED' }).where(eq(invoices.id, invoice.id));
      const [after] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, invoice.id));
      expect(after?.status).toBe('CREDITED');
    });
  });
});

suite('R6 — soft delete frees a unique value', () => {
  it('lets a table code be reused once the holder is soft-deleted', async () => {
    await inRollback(async (tx) => {
      const [zone] = await tx
        .insert(zones)
        .values({ name: unique('Zone') })
        .returning({ id: zones.id });

      const code = unique('T');
      const [first] = await tx
        .insert(tables)
        .values({ zoneId: zone!.id, code })
        .returning({ id: tables.id });

      // While it lives, the code is taken.
      const clash = await rejected(tx, (sp) =>
        sp.insert(tables).values({ zoneId: zone!.id, code }),
      );
      expect(clash).toMatch(/tables_zone_code_idx|duplicate key/);

      // Soft-deleted, the code is free again — the point of the partial index.
      // Otherwise a retired table number could never come back.
      await tx.update(tables).set({ deletedAt: new Date() }).where(eq(tables.id, first!.id));
      await tx.insert(tables).values({ zoneId: zone!.id, code });

      const live = await tx
        .select({ id: tables.id })
        .from(tables)
        .where(sql`${tables.code} = ${code} and ${tables.deletedAt} is null`);
      expect(live.length).toBe(1);
    });
  });
});

suite('§5.8 — the counters are locked rows, not sequences', () => {
  it('allocates gap-free through allocateLocalNo', async () => {
    await inRollback(async (tx) => {
      // The seed provides the row. Create one if this database has not been seeded.
      const existing = await tx.select({ id: invoiceCounter.id }).from(invoiceCounter);
      if (existing.length === 0) {
        await tx.insert(invoiceCounter).values({ nextValue: 1n, prefix: 'INV-' });
      }

      const allocated: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        allocated.push(await allocateLocalNo(tx));
      }

      const numbers = allocated.map((n) => BigInt(n.replace(/[^0-9]/g, '')));
      for (let i = 1; i < numbers.length; i += 1) {
        // Gap-free is the requirement: a fiscal audit asks about gaps.
        expect(numbers[i]! - numbers[i - 1]!).toBe(1n);
      }
      expect(allocated[0]).toMatch(/^INV-[0-9]{6}$/);
    });
  });

  it('refuses a second counter row', async () => {
    await inRollback(async (tx) => {
      const existing = await tx.select({ id: invoiceCounter.id }).from(invoiceCounter);
      if (existing.length === 0) {
        await tx.insert(invoiceCounter).values({ nextValue: 1n });
      }
      const error = await rejected(tx, (sp) =>
        sp.insert(invoiceCounter).values({ nextValue: 99n }),
      );
      expect(error).toMatch(/invoice_counter_singleton_idx|duplicate key/);
    });
  });
});

suite('R1 — money survives the driver as bigint', () => {
  it('returns bigint, not a float, past MAX_SAFE_INTEGER', async () => {
    await inRollback(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({ orderNo: 1, businessDate: '2026-08-22' })
        .returning({ id: orders.id });

      const huge = 9007199254740993n; // MAX_SAFE_INTEGER + 2
      await tx.insert(invoices).values({
        orderId: order!.id,
        localNo: unique('INV'),
        businessDate: '2026-08-22',
        subtotal: huge,
        taxableBase: huge,
        taxTotal: 0n,
        grandTotal: huge,
        taxSnapshot: {},
      });

      // Its own row: against a database that already holds real invoices, an
      // unfiltered read returned somebody's lunch instead.
      const [row] = await tx
        .select({ subtotal: invoices.subtotal })
        .from(invoices)
        .where(eq(invoices.orderId, order!.id));
      expect(typeof row?.subtotal).toBe('bigint');
      // Had this gone through a float, it would read 9007199254740992.
      expect(row?.subtotal).toBe(huge);
    });
  });
});

/** A throwaway employee for the M26/M27 suites, inside the caller's rollback. */
async function makeEmployee(tx: Tx): Promise<string> {
  const [row] = await tx
    .insert(employees)
    .values({ name: unique('Test person') })
    .returning({ id: employees.id });
  if (row === undefined) throw new Error('no employee row');
  return row.id;
}

suite('M26 — one attendance row per person per day (ADR 0032)', () => {
  it('refuses a second live row for the same day, and allows one after a clear', async () => {
    await inRollback(async (tx) => {
      const employeeId = await makeEmployee(tx);
      const day = { employeeId, businessDate: '2026-09-25', status: 'PRESENT' as const };
      const [first] = await tx.insert(attendance).values(day).returning({ id: attendance.id });
      const error = await rejected(tx, (sp) => sp.insert(attendance).values(day));
      expect(error).toMatch(/attendance_employee_date_idx|duplicate key/);

      // Clearing a status soft-deletes the row (ADR 0032); the day is then free.
      if (first === undefined) throw new Error('no attendance row');
      await tx.update(attendance).set({ deletedAt: new Date() }).where(eq(attendance.id, first.id));
      await tx.insert(attendance).values({ ...day, status: 'ABSENT' });
    });
  });

  it('keeps an overnight time out as written', async () => {
    await inRollback(async (tx) => {
      const employeeId = await makeEmployee(tx);
      const [row] = await tx
        .insert(attendance)
        .values({
          employeeId,
          businessDate: '2026-09-25',
          status: 'PRESENT',
          timeIn: '16:00',
          timeOut: '01:30',
        })
        .returning({ timeIn: attendance.timeIn, timeOut: attendance.timeOut });
      // `time` comes back with seconds; `normaliseTime` in the app drops them.
      expect(row).toEqual({ timeIn: '16:00:00', timeOut: '01:30:00' });
    });
  });
});

suite('M27 — staff_advances CHECKs (ADR 0033)', () => {
  it('refuses a zero amount and a method on the wrong kind', async () => {
    await inRollback(async (tx) => {
      const employeeId = await makeEmployee(tx);
      const base = { employeeId, occurredOn: '2026-09-25' };
      await tx.insert(staffAdvances).values({ ...base, kind: 'ADVANCE', amount: 500000n });
      await tx
        .insert(staffAdvances)
        .values({ ...base, kind: 'RECOVERY', method: 'CASH_RETURN', amount: 100000n });

      expect(
        await rejected(tx, (sp) =>
          sp.insert(staffAdvances).values({ ...base, kind: 'ADVANCE', amount: 0n }),
        ),
      ).toMatch(/staff_advances_amount_positive/);
      expect(
        await rejected(tx, (sp) =>
          sp
            .insert(staffAdvances)
            .values({ ...base, kind: 'ADVANCE', method: 'CASH_RETURN', amount: 1n }),
        ),
      ).toMatch(/staff_advances_method_matches_kind/);
      expect(
        await rejected(tx, (sp) =>
          sp.insert(staffAdvances).values({ ...base, kind: 'RECOVERY', amount: 1n }),
        ),
      ).toMatch(/staff_advances_method_matches_kind/);
    });
  });
});

suite('M28 — stock_movements CHECKs and the on-hand sum (ADR 0034)', () => {
  it('holds the sign to the kind, demands a reason for waste, and sums exactly', async () => {
    await inRollback(async (tx) => {
      const [item] = await tx
        .insert(demandItems)
        .values({ name: unique('Test item'), category: 'Kitchen', defaultUnit: 'kg' })
        .returning({ id: demandItems.id });
      if (item === undefined) throw new Error('no item row');
      const base = { itemId: item.id, occurredOn: '2026-09-25' };

      await tx.insert(stockMovements).values({ ...base, kind: 'RECEIVED', qty: '20', delta: '20' });
      await tx
        .insert(stockMovements)
        .values({ ...base, kind: 'ISSUED', qty: '0.1', delta: '-0.1' });
      await tx
        .insert(stockMovements)
        .values({ ...base, kind: 'COUNTED', qty: '19.5', delta: '-0.4' });

      expect(
        await rejected(tx, (sp) =>
          sp.insert(stockMovements).values({ ...base, kind: 'RECEIVED', qty: '5', delta: '-5' }),
        ),
      ).toMatch(/stock_movements_delta_matches_kind/);
      expect(
        await rejected(tx, (sp) =>
          sp.insert(stockMovements).values({ ...base, kind: 'ISSUED', qty: '5', delta: '5' }),
        ),
      ).toMatch(/stock_movements_delta_matches_kind/);
      expect(
        await rejected(tx, (sp) =>
          sp.insert(stockMovements).values({ ...base, kind: 'WASTED', qty: '1', delta: '-1' }),
        ),
      ).toMatch(/stock_movements_waste_has_reason/);

      // The exact expression `readStock` and `readBooks` use. A raw aggregate
      // arrives as a driver string; it must keep three decimals for `parseQty`.
      const [row] = await tx
        .select({ total: sql<string>`sum(${stockMovements.delta})` })
        .from(stockMovements)
        .where(eq(stockMovements.itemId, item.id));
      expect(row?.total).toBe('19.500');
    });
  });
});
