'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { creditNotes, dbWrite, invoices, writeAudit } from '@natech/db';
import { paisa } from '@natech/domain';
import type { CreditNote } from '@natech/contracts';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requireTillStaff,
} from '../auth/session';

/**
 * Credit notes — BUILD-PLAN.md §7.3 `invoiceType: 4`, defect K2;
 * docs/runfiles/M11-fiscal.md §3.
 *
 * Full reversal only, this milestone: `credit_notes` has one `amount` column
 * and no per-line breakdown table, so there is nowhere to derive a
 * defensible tax split for a partial refund without inventing math the
 * engine does not have. `amount` is therefore never taken from the caller —
 * it is always the invoice's own `grand_total`, the same discipline
 * `finalizeOrderAction` already applies to a client-submitted total (never
 * trusted, always read from the database).
 *
 * No lookup/browse UI ships with this action: no screen anywhere in this
 * codebase yet lets staff find a past finalized invoice (that is reporting
 * territory, unscheduled). The action is complete and independently
 * testable; a future "find an invoice, issue a credit note" screen calls it
 * exactly as `OrderScreen.tsx`'s post-finalize dialog would.
 */
class CreditNoteRefusal extends Error {}

const InputSchema = z.object({
  invoiceId: z.uuid(),
  reason: z.string().trim().min(1, 'A reason is required.'),
});
export type IssueCreditNoteInput = z.infer<typeof InputSchema>;

export interface IssueCreditNoteResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly creditNote: CreditNote | null;
}

export async function issueCreditNoteAction(
  input: IssueCreditNoteInput,
): Promise<IssueCreditNoteResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the request.',
      creditNote: null,
    };
  }

  let identity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message, creditNote: null };
    }
    throw error;
  }
  const { viewer } = identity;

  try {
    assertPermission(viewer, 'invoice.refund');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message, creditNote: null };
    throw error;
  }

  const db = dbWrite();

  try {
    const result = await db.transaction(async (tx) => {
      const invoiceRows = await tx
        .select({
          id: invoices.id,
          orderId: invoices.orderId,
          localNo: invoices.localNo,
          status: invoices.status,
          taxTotal: invoices.taxTotal,
          grandTotal: invoices.grandTotal,
          discountTotal: invoices.discountTotal,
        })
        .from(invoices)
        .where(and(eq(invoices.id, parsed.data.invoiceId), isNull(invoices.deletedAt)));
      const invoiceRow = invoiceRows[0];
      if (invoiceRow === undefined) throw new CreditNoteRefusal('That invoice does not exist.');
      // Replay guard, the same "read status inside the transaction, then
      // assert" pattern `finalizeOrderAction` already relies on (M10 §3):
      // CREDITED has no outbound edge, so a second credit note against the
      // same invoice fails here before any row is written.
      if (invoiceRow.status !== 'FINALIZED') {
        throw new CreditNoteRefusal('That invoice has already been credited.');
      }

      // `order_lines` is never edited after finalize — soft-delete only — so
      // recomputing `priceLines` here reproduces the exact figures the
      // original invoice was built from. The invoice's own stored
      // `taxTotal`/`grandTotal`/`discountTotal` are used for the aggregate
      // payload fields regardless, never a fresh recomputation, so the
      // credit note can never disagree with the immutable record it reverses.
      const now = new Date();
      const [insertedCreditNote] = await tx
        .insert(creditNotes)
        .values({
          invoiceId: invoiceRow.id,
          reason: parsed.data.reason,
          amount: invoiceRow.grandTotal,
          issuedBy: viewer.id,
        })
        .returning();
      if (insertedCreditNote === undefined)
        throw new CreditNoteRefusal('The credit note could not be saved.');

      // R5's own sanctioned transition out of FINALIZED (the immutability
      // trigger's comment names it directly): a full reversal closes the
      // invoice it reverses.
      await tx
        .update(invoices)
        .set({ status: 'CREDITED', updatedAt: now })
        .where(eq(invoices.id, invoiceRow.id));

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'credit_notes',
          entityId: insertedCreditNote.id,
          action: 'CREDIT_NOTE_ISSUED',
          after: {
            invoiceId: invoiceRow.id,
            invoiceLocalNo: invoiceRow.localNo,
            amount: invoiceRow.grandTotal.toString(),
            reason: parsed.data.reason,
          },
        },
      );

      return {
        creditNoteId: insertedCreditNote.id,
        invoiceLocalNo: invoiceRow.localNo,
        grandTotal: paisa(invoiceRow.grandTotal),
        issuedAt: insertedCreditNote.createdAt,
      };
    });

    return {
      ok: true,
      error: null,
      creditNote: {
        id: result.creditNoteId,
        invoiceId: parsed.data.invoiceId,
        invoiceLocalNo: result.invoiceLocalNo,
        reason: parsed.data.reason,
        amount: result.grandTotal,
        issuedAt: result.issuedAt,
        issuedByName: viewer.displayName,
      },
    };
  } catch (error) {
    if (error instanceof CreditNoteRefusal) {
      return { ok: false, error: error.message, creditNote: null };
    }
    throw error;
  }
}
