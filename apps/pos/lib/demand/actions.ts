'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  dbWrite,
  demandItems,
  demandSheetLines,
  demandSheets,
  writeAudit,
  type Tx,
} from '@natech/db';
import {
  IllegalTransitionError,
  demandSheetMachine,
  parsePaisa,
  parseQty,
  qtyToString,
  type DemandSheetStatus,
} from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { sendOwnerReport } from '../mail';
import { demandSheetEmail } from './email';
import { collectGridLines } from './grid';
import { readDemandSheet } from './queries';

/**
 * Demand order sheet mutations — ADR 0026, docs/runfiles/M23-demand-sheets.md.
 *
 * `reports.read` gates the screen; `expenses.write` gates everything here. No
 * new permission was added — runfile §3 has the reasoning, and the short
 * version is that OWNER and MANAGER already hold exactly this grant and
 * AUDITOR already holds read without it.
 *
 * Every write goes through `dbWrite` in a transaction with its audit row inside
 * it (R2, R7). On `dbRead` the transaction would silently no-op and the audit
 * row would be lost without anything throwing.
 */

export interface DemandActionState {
  readonly error: string | null;
  readonly message: string | null;
}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

const SheetInput = z.object({
  neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date the goods are needed by.'),
  supplier: z.string().trim().max(120).nullable(),
  note: z.string().trim().max(500).nullable(),
});

const LineInput = z.object({
  item: z.string().trim().min(2, 'Name the item.').max(160),
  // Optional since M24: the restaurant's printed sheet has no unit column.
  unit: z.string().trim().max(32).nullable(),
  qty: z.string().trim().min(1, 'Enter a quantity.'),
  estimatedUnitCost: z.string().trim().nullable(),
  note: z.string().trim().max(240).nullable(),
});

/**
 * The freeze, in one place.
 *
 * Every line mutation and the delete path come through here, so a SUBMITTED
 * sheet cannot be edited by any route. A guard written into each action
 * separately would have been six guards, and the seventh action somebody adds
 * next year is the one that forgets — which is the whole argument for R4 having
 * an explicit machine rather than scattered if-statements.
 */
async function loadDraftSheet(
  tx: Tx,
  id: string,
): Promise<{ id: string; status: DemandSheetStatus } | null> {
  const [sheet] = await tx
    .select({ id: demandSheets.id, status: demandSheets.status })
    .from(demandSheets)
    .where(and(eq(demandSheets.id, id), isNull(demandSheets.deletedAt)))
    .limit(1);
  if (sheet === undefined) return null;
  if (sheet.status !== 'DRAFT') return null;
  return sheet;
}

export async function createDemandSheetAction(
  _previous: DemandActionState,
  form: FormData,
): Promise<DemandActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = SheetInput.safeParse({
    neededBy: form.get('neededBy'),
    supplier: optional(form.get('supplier')),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the sheet.', message: null };

  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    const [created] = await tx
      .insert(demandSheets)
      .values({ ...parsed.data, createdBy: operator.id })
      .returning({ id: demandSheets.id });
    if (created === undefined) throw new Error('Creating the demand sheet returned no row.');
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'demand_sheets',
        entityId: created.id,
        action: 'DEMAND_SHEET_CREATED',
        after: { neededBy: parsed.data.neededBy, supplier: parsed.data.supplier },
      },
    );
  });
  revalidatePath('/admin/demand');
  return { error: null, message: 'Demand sheet started. Add what you need to it.' };
}

export async function addDemandLineAction(
  sheetId: string,
  _previous: DemandActionState,
  form: FormData,
): Promise<DemandActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = LineInput.safeParse({
    item: form.get('item'),
    unit: optional(form.get('unit')),
    qty: form.get('qty'),
    estimatedUnitCost: optional(form.get('estimatedUnitCost')),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the line.', message: null };

  // Parsed here rather than in Zod so the failure message names the format.
  // `parseQty` takes up to three decimals and rejects a float string outright.
  let qty;
  try {
    qty = parseQty(parsed.data.qty);
  } catch {
    return { error: 'Enter a quantity, e.g. 20 or 0.25. Three decimals at most.', message: null };
  }
  if (qty <= 0n) return { error: 'Quantity must be greater than zero.', message: null };

  let estimatedUnitCost: bigint | null = null;
  if (parsed.data.estimatedUnitCost !== null) {
    try {
      estimatedUnitCost = parsePaisa(parsed.data.estimatedUnitCost);
    } catch {
      return {
        error: 'Enter a unit cost in rupees, e.g. 620.00, or leave it blank.',
        message: null,
      };
    }
    if (estimatedUnitCost < 0n)
      return { error: 'An estimated cost cannot be negative.', message: null };
  }

  const context = await requestContext();
  const outcome = await dbWrite().transaction(async (tx) => {
    const sheet = await loadDraftSheet(tx, sheetId);
    if (sheet === null) return 'locked' as const;
    const [created] = await tx
      .insert(demandSheetLines)
      .values({
        sheetId,
        item: parsed.data.item,
        unit: parsed.data.unit,
        qty: qtyToString(qty),
        estimatedUnitCost,
        note: parsed.data.note,
      })
      .returning({ id: demandSheetLines.id });
    if (created === undefined) throw new Error('Adding the demand line returned no row.');
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'demand_sheet_lines',
        entityId: created.id,
        action: 'DEMAND_LINE_ADDED',
        after: {
          sheetId,
          item: parsed.data.item,
          unit: parsed.data.unit,
          qty: qtyToString(qty),
          estimatedUnitCost: estimatedUnitCost?.toString() ?? null,
        },
      },
    );
    return 'added' as const;
  });
  if (outcome === 'locked')
    return { error: 'This sheet has been submitted and can no longer be changed.', message: null };
  revalidatePath(`/admin/demand/${sheetId}`);
  return { error: null, message: `${parsed.data.item} added.` };
}

export async function deleteDemandLineAction(sheetId: string, lineId: string): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    if ((await loadDraftSheet(tx, sheetId)) === null) return;
    const [before] = await tx
      .select({ id: demandSheetLines.id, item: demandSheetLines.item, qty: demandSheetLines.qty })
      .from(demandSheetLines)
      .where(
        and(
          eq(demandSheetLines.id, lineId),
          eq(demandSheetLines.sheetId, sheetId),
          isNull(demandSheetLines.deletedAt),
        ),
      );
    if (before === undefined) return;
    await tx
      .update(demandSheetLines)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(demandSheetLines.id, lineId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'demand_sheet_lines',
        entityId: lineId,
        action: 'DEMAND_LINE_REMOVED',
        before,
      },
    );
  });
  revalidatePath(`/admin/demand/${sheetId}`);
}

/**
 * Move a sheet along its lifecycle (R4).
 *
 * The machine is asked rather than told: `assert` throws
 * `IllegalTransitionError` naming both states, which is what makes a double
 * submit from a stale tab a readable refusal instead of a second freeze
 * overwriting the first `submitted_at`.
 */
async function transitionSheet(
  sheetId: string,
  to: DemandSheetStatus,
  reason: string | null,
): Promise<DemandActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const context = await requestContext();
  try {
    const outcome = await dbWrite().transaction(async (tx) => {
      const [sheet] = await tx
        .select({ id: demandSheets.id, status: demandSheets.status })
        .from(demandSheets)
        .where(and(eq(demandSheets.id, sheetId), isNull(demandSheets.deletedAt)))
        .limit(1);
      if (sheet === undefined) return 'missing' as const;
      demandSheetMachine.assert(sheet.status, to);

      if (to === 'SUBMITTED') {
        const lines = await tx
          .select({ id: demandSheetLines.id })
          .from(demandSheetLines)
          .where(and(eq(demandSheetLines.sheetId, sheetId), isNull(demandSheetLines.deletedAt)));
        // An empty sheet is not a request for anything. Freezing one produces a
        // permanent document that says nothing and cannot be edited into saying
        // something, so it is refused while it is still a draft.
        if (lines.length === 0) return 'empty' as const;
      }

      await tx
        .update(demandSheets)
        .set({
          status: to,
          updatedAt: new Date(),
          ...(to === 'SUBMITTED' ? { submittedAt: new Date() } : {}),
          ...(to === 'CANCELLED' ? { cancelReason: reason } : {}),
        })
        .where(eq(demandSheets.id, sheetId));
      await writeAudit(
        tx,
        { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'demand_sheets',
          entityId: sheetId,
          action: to === 'SUBMITTED' ? 'DEMAND_SHEET_SUBMITTED' : 'DEMAND_SHEET_CANCELLED',
          before: { status: sheet.status },
          after: { status: to, reason },
        },
      );
      return 'done' as const;
    });
    if (outcome === 'missing') return { error: 'That sheet no longer exists.', message: null };
    if (outcome === 'empty')
      return { error: 'Add at least one line before submitting this sheet.', message: null };
  } catch (error) {
    if (error instanceof IllegalTransitionError) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/demand');
  revalidatePath(`/admin/demand/${sheetId}`);

  if (to === 'SUBMITTED') {
    // The sheet is recorded the moment the transaction commits; emailing it to
    // the owner is best-effort external work that runs after the response.
    // Same shape and the same reasoning as `lib/shifts/actions.ts`'s Z-report
    // send: a slow or unavailable Resend must not leave the manager's submit
    // button pending, and a failed send must not report a frozen sheet back as
    // if it had not been submitted. The sheet is read back rather than
    // assembled from the form, so what the owner receives is what the database
    // now holds.
    after(async () => {
      try {
        const sheet = await readDemandSheet(sheetId);
        if (sheet === null) return;
        const { subject, text } = demandSheetEmail(sheet);
        await sendOwnerReport(subject, text);
      } catch (error) {
        console.error('submitDemandSheetAction: demand sheet email failed', error);
      }
    });
  }

  return {
    error: null,
    message: to === 'SUBMITTED' ? 'Sheet submitted and frozen.' : 'Sheet cancelled.',
  };
}

export async function submitDemandSheetAction(
  sheetId: string,
  _previous: DemandActionState,
  // Unused, but `useActionState` types the action as (state, payload) and a
  // bound one-argument function infers `void` for the payload, which then will
  // not sit on a `<form action>`.
  _form: FormData,
): Promise<DemandActionState> {
  return transitionSheet(sheetId, 'SUBMITTED', null);
}

export async function cancelDemandSheetAction(
  sheetId: string,
  _previous: DemandActionState,
  form: FormData,
): Promise<DemandActionState> {
  return transitionSheet(sheetId, 'CANCELLED', optional(form.get('cancelReason')));
}

/**
 * Soft-delete a draft nobody submitted.
 *
 * `loadDraftSheet` is the whole guard: an abandoned draft is not a record of
 * anything and may go, but a SUBMITTED sheet is a document that was handed to
 * somebody and is cancelled instead, never deleted (R6, and the same reasoning
 * R5 applies to a finalized invoice).
 */
export async function deleteDemandSheetAction(sheetId: string): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    if ((await loadDraftSheet(tx, sheetId)) === null) return;
    await tx
      .update(demandSheets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(demandSheets.id, sheetId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'demand_sheets',
        entityId: sheetId,
        action: 'DEMAND_SHEET_DELETED',
        before: { status: 'DRAFT' },
      },
    );
  });
  revalidatePath('/admin/demand');
}

/**
 * Write a filled-in checklist onto a draft sheet in one go — M24.
 *
 * One transaction and one `loadDraftSheet()` check for the whole grid, so a
 * sheet submitted from another tab while the manager was walking the store
 * refuses the lot rather than writing half of it onto a frozen document.
 *
 * The audit row is per line (R7). A single "grid submitted" row would hide
 * which twenty of the 144 items were actually asked for, which is the only
 * thing anybody would ever come back to the audit trail to find out.
 */
export async function addDemandLinesAction(
  sheetId: string,
  _previous: DemandActionState,
  form: FormData,
): Promise<DemandActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');

  const context = await requestContext();
  const outcome = await dbWrite().transaction(async (tx) => {
    if ((await loadDraftSheet(tx, sheetId)) === null) return 'locked' as const;

    // The catalogue is read here rather than passed in from the client. The
    // form supplies quantities keyed by item id and nothing else; the item's
    // name, category and unit come from the database, so a tampered payload
    // cannot write an arbitrary line onto the sheet. Read through `tx`, not
    // `dbRead` — R2, and it has to see the same snapshot as the insert.
    const catalogue = await tx
      .select({
        itemId: demandItems.id,
        name: demandItems.name,
        category: demandItems.category,
        defaultUnit: demandItems.defaultUnit,
      })
      .from(demandItems)
      .where(isNull(demandItems.deletedAt))
      .orderBy(asc(demandItems.category), asc(demandItems.sortOrder));

    const { lines, errors } = collectGridLines(
      catalogue.map((item) => ({
        ...item,
        // Boxes are named by item id, so a renamed catalogue entry cannot
        // silently land a quantity on a different item.
        raw: String(form.get(`qty:${item.itemId}`) ?? ''),
      })),
    );
    if (errors.length > 0) return { bad: errors.slice(0, 3).join(' ') } as const;
    if (lines.length === 0) return 'empty' as const;
    for (const line of lines) {
      const [created] = await tx
        .insert(demandSheetLines)
        .values({
          sheetId,
          item: line.item,
          unit: line.unit,
          category: line.category,
          qty: qtyToString(line.qty),
        })
        .returning({ id: demandSheetLines.id });
      if (created === undefined) throw new Error('Adding a demand line returned no row.');
      await writeAudit(
        tx,
        { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'demand_sheet_lines',
          entityId: created.id,
          action: 'DEMAND_LINE_ADDED',
          after: {
            sheetId,
            item: line.item,
            category: line.category,
            qty: qtyToString(line.qty),
            source: 'GRID',
          },
        },
      );
    }
    return { added: lines.length } as const;
  });

  if (outcome === 'locked')
    return { error: 'This sheet has been submitted and can no longer be changed.', message: null };
  if (outcome === 'empty')
    return {
      error: 'Nothing was filled in. Enter a quantity beside what you need.',
      message: null,
    };
  if ('bad' in outcome) return { error: outcome.bad, message: null };

  revalidatePath(`/admin/demand/${sheetId}`);
  return {
    error: null,
    message: `${outcome.added} ${outcome.added === 1 ? 'item' : 'items'} added to the sheet.`,
  };
}
