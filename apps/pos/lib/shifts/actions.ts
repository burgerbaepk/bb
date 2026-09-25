'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { cashMovements, dbWrite, shifts, writeAudit } from '@natech/db';
import { IllegalTransitionError, paisa, shiftMachine } from '@natech/domain';
import { PaisaWireSchema } from '@natech/contracts';
import type { Viewer } from '@natech/contracts';
import { Forbidden, assertPermission, currentTillIdentity, requireOperator } from '../auth/session';
import type { TillIdentity } from '../auth/session';
import { readShiftById } from './queries';
import { computeExpectedCash } from './reconciliation';
import { readShiftReport, sendZReportEmail } from './report';

/**
 * The shift lifecycle actions — BUILD-PLAN.md §5.9, §6.13, §12, §2 R4/R7;
 * docs/runfiles/M12-shifts.md §3.
 *
 * `shift.close` gates all three actions here, not only closing — see the
 * runfile's own decision. The ownership check applies uniformly too: a
 * CASHIER may only act on a shift nobody opened (`openedBy: null`, an
 * auto-opened one) or one they personally opened; MANAGER and OWNER are
 * never restricted.
 */
class ShiftActionRefusal extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function assertShiftAccess(viewer: Viewer, openedBy: string | null): void {
  if (viewer.role === 'CASHIER' && openedBy !== null && openedBy !== viewer.id) {
    throw new ShiftActionRefusal(
      'Only the cashier who opened this shift, or a manager, can act on it.',
    );
  }
}

async function requireShiftStaff(): Promise<Pick<TillIdentity, 'viewer'> | { error: string }> {
  try {
    // A PIN identifies till actions; the password-authenticated operator is
    // the actor in the back office. Both paths resolve permissions afresh.
    const identity = await currentTillIdentity();
    const effectiveIdentity = identity ?? { viewer: await requireOperator() };
    assertPermission(effectiveIdentity.viewer, 'shift.close');
    return effectiveIdentity;
  } catch (error) {
    if (error instanceof Forbidden) {
      return { error: error.message };
    }
    throw error;
  }
}

/* -------------------------------------------------------------- open */

const OpenShiftInputSchema = z.object({ openingFloat: PaisaWireSchema });
export type OpenShiftInput = z.infer<typeof OpenShiftInputSchema>;

export interface ShiftActionResult {
  readonly ok: boolean;
  readonly error: string | null;
}

export async function openShiftAction(input: OpenShiftInput): Promise<ShiftActionResult> {
  const parsed = OpenShiftInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };

  const identity = await requireShiftStaff();
  if ('error' in identity) return { ok: false, error: identity.error };
  const { viewer } = identity;

  const db = dbWrite();
  try {
    await db.transaction(async (tx) => {
      // No partial-unique index enforces this (the frozen schema, M02) —
      // see the runfile's own `# ponytail:` note on the accepted race.
      const existing = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(eq(shifts.status, 'OPEN'));
      if (existing.length > 0) throw new ShiftActionRefusal('A shift is already open.');

      const openingFloat = paisa(BigInt(parsed.data.openingFloat));
      const [inserted] = await tx
        .insert(shifts)
        .values({ openedBy: viewer.id, openingFloat, mode: 'MANUAL', status: 'OPEN' })
        .returning({ id: shifts.id });
      if (inserted === undefined) throw new ShiftActionRefusal('The shift could not be opened.');

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'shifts',
          entityId: inserted.id,
          action: 'SHIFT_OPENED',
          after: { openingFloat: openingFloat.toString(), mode: 'MANUAL' },
        },
      );
    });

    revalidatePath('/shift');
    revalidatePath('/admin/shift');
    revalidatePath('/admin/reports/shift');
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ShiftActionRefusal) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) return { ok: false, error: 'A shift is already open.' };
    throw error;
  }
}

/* --------------------------------------------------- cash movements */

const CashMovementInputSchema = z.object({
  shiftId: z.uuid(),
  type: z.enum(['PAY_IN', 'PAY_OUT', 'DROP']),
  amount: PaisaWireSchema,
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type CashMovementInput = z.infer<typeof CashMovementInputSchema>;

export async function recordCashMovementAction(
  input: CashMovementInput,
): Promise<ShiftActionResult> {
  const parsed = CashMovementInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };

  const identity = await requireShiftStaff();
  if ('error' in identity) return { ok: false, error: identity.error };
  const { viewer } = identity;

  const db = dbWrite();
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: shifts.id, openedBy: shifts.openedBy, status: shifts.status })
        .from(shifts)
        .where(eq(shifts.id, parsed.data.shiftId))
        // The same lock `closeShiftAction` takes. Without it this read sees
        // OPEN while a close is mid-transaction, and the movement commits
        // after the drawer's expected cash was computed — a counted drawer
        // then holds a movement its variance never saw. Found in M27.
        .for('update');
      const shift = rows[0];
      if (shift === undefined) throw new ShiftActionRefusal('That shift no longer exists.');
      if (shift.status !== 'OPEN') throw new ShiftActionRefusal('This shift is already closed.');
      assertShiftAccess(viewer, shift.openedBy);

      const amount = paisa(BigInt(parsed.data.amount));
      const [inserted] = await tx
        .insert(cashMovements)
        .values({
          shiftId: shift.id,
          type: parsed.data.type,
          amount,
          reason: parsed.data.reason,
          actorId: viewer.id,
        })
        .returning({ id: cashMovements.id });
      if (inserted === undefined)
        throw new ShiftActionRefusal('The movement could not be recorded.');

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'cash_movements',
          entityId: inserted.id,
          action: parsed.data.type,
          after: { shiftId: shift.id, amount: amount.toString(), reason: parsed.data.reason },
        },
      );
    });

    revalidatePath('/shift');
    revalidatePath('/admin/shift');
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ShiftActionRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

/* -------------------------------------------------------------- close */

const CloseShiftInputSchema = z.object({
  shiftId: z.uuid(),
  countedCash: PaisaWireSchema,
  notes: z.string().trim().optional(),
});
export type CloseShiftInput = z.infer<typeof CloseShiftInputSchema>;

export async function closeShiftAction(input: CloseShiftInput): Promise<ShiftActionResult> {
  const parsed = CloseShiftInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };

  const identity = await requireShiftStaff();
  if ('error' in identity) return { ok: false, error: identity.error };
  const { viewer } = identity;

  const db = dbWrite();
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: shifts.id,
          openedBy: shifts.openedBy,
          openedAt: shifts.openedAt,
          openingFloat: shifts.openingFloat,
          status: shifts.status,
        })
        .from(shifts)
        .where(eq(shifts.id, parsed.data.shiftId))
        .for('update');
      const shift = rows[0];
      if (shift === undefined) throw new ShiftActionRefusal('That shift no longer exists.');

      shiftMachine.assert(shift.status, 'CLOSED');
      assertShiftAccess(viewer, shift.openedBy);

      const now = new Date();
      const countedCash = paisa(BigInt(parsed.data.countedCash));
      const expectedCash = await computeExpectedCash(tx, shift.id, paisa(shift.openingFloat));
      const variance = paisa(countedCash - expectedCash);

      await tx
        .update(shifts)
        .set({
          status: 'CLOSED',
          closedBy: viewer.id,
          closedAt: now,
          expectedCash,
          countedCash,
          variance,
          notes: parsed.data.notes ?? null,
        })
        .where(and(eq(shifts.id, shift.id), eq(shifts.status, 'OPEN')));

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'shifts',
          entityId: shift.id,
          action: 'SHIFT_CLOSED',
          after: {
            expectedCash: expectedCash.toString(),
            countedCash: countedCash.toString(),
            variance: variance.toString(),
          },
        },
      );
    });

    revalidatePath('/shift');
    revalidatePath('/admin/shift');
    revalidatePath('/admin/reports/shift');

    // Closing the till is complete once the transaction commits. Building
    // and emailing the Z report is best-effort external work and must not
    // keep the button pending or turn a committed close into a client-visible
    // failure when Resend is slow/unavailable.
    after(async () => {
      try {
        const closed = await readShiftById(parsed.data.shiftId);
        if (closed === null) return;
        const report = await readShiftReport(closed);
        await sendZReportEmail(report);
      } catch (error) {
        console.error('closeShiftAction: Z-report email failed', error);
      }
    });

    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ShiftActionRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    throw error;
  }
}
