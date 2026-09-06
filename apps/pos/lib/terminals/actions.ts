'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, posTerminals, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '@/lib/auth/session';

/**
 * Terminal registration — BUILD-PLAN.md §5.2, §14.6, M08 runfile "Terminal
 * registration reuses the staff-screen pattern exactly".
 *
 * §14.1 names no permission of its own for terminal management, and
 * `pos_terminals` is kin to `users`/`roles` — a shared till has to be
 * registered before anyone can bind to it — rather than to the menu or the
 * floor. Gated on `staff.write`, which the frozen seed grants to `OWNER`
 * alone, so terminal registration is `OWNER`-only, same as staff.
 *
 * `fbr_pos_id` has no field on either form here. §7.3 names it the PRAL
 * device id, M11 owns the registration flow that produces one, and writing a
 * value here now would be inventing a fiscal identifier the authority never
 * issued.
 *
 * "Remove" means deactivate, not delete: a terminal referenced by a shift,
 * an order, or years of `audit_log` rows must not disappear. `deleted_at`
 * stays null; only `is_active` moves.
 */

export interface TerminalFormState {
  readonly error: string | null;
  readonly message: string | null;
}

function normalise(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

const CreateInput = z.object({
  label: z.string().trim().min(1, 'A label is required.'),
  posType: z.enum(['PRIMARY', 'SECONDARY']),
  macAddress: z.string().trim().optional(),
  ipAddress: z.string().trim().optional(),
});

export async function createTerminalAction(
  _previous: TerminalFormState,
  form: FormData,
): Promise<TerminalFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = CreateInput.safeParse({
    label: form.get('label'),
    posType: form.get('posType'),
    macAddress: form.get('macAddress') ?? undefined,
    ipAddress: form.get('ipAddress') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  // `pos_terminals_label_idx` is a partial unique index on `label` (R6).
  // Pre-checked for a clean form error, matching `createStaffAction`'s email
  // clash — the wrapped Postgres message otherwise lands on `error.cause`,
  // not `error.message` (CLAUDE.md's traps).
  const clash = await db
    .select({ id: posTerminals.id })
    .from(posTerminals)
    .where(and(eq(posTerminals.label, parsed.data.label), isNull(posTerminals.deletedAt)));
  if (clash[0] !== undefined) {
    return { error: 'A terminal with that label already exists.', message: null };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(posTerminals)
      .values({
        label: parsed.data.label,
        posType: parsed.data.posType,
        macAddress: normalise(parsed.data.macAddress),
        ipAddress: normalise(parsed.data.ipAddress),
      })
      .returning({ id: posTerminals.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the terminal returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'pos_terminals',
        entityId: created.id,
        action: 'TERMINAL_CREATED',
        after: { label: parsed.data.label, posType: parsed.data.posType },
      },
    );
  });

  revalidatePath('/admin/terminals');
  return { error: null, message: `${parsed.data.label} registered.` };
}

const UpdateInput = z.object({
  terminalId: z.uuid(),
  label: z.string().trim().min(1, 'A label is required.'),
  posType: z.enum(['PRIMARY', 'SECONDARY']),
  macAddress: z.string().trim().optional(),
  ipAddress: z.string().trim().optional(),
});

export async function updateTerminalAction(
  _previous: TerminalFormState,
  form: FormData,
): Promise<TerminalFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = UpdateInput.safeParse({
    terminalId: form.get('terminalId'),
    label: form.get('label'),
    posType: form.get('posType'),
    macAddress: form.get('macAddress') ?? undefined,
    ipAddress: form.get('ipAddress') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  const before = await db
    .select({
      label: posTerminals.label,
      posType: posTerminals.posType,
      macAddress: posTerminals.macAddress,
      ipAddress: posTerminals.ipAddress,
    })
    .from(posTerminals)
    .where(and(eq(posTerminals.id, parsed.data.terminalId), isNull(posTerminals.deletedAt)));
  if (before[0] === undefined) return { error: 'That terminal no longer exists.', message: null };

  const clash = await db
    .select({ id: posTerminals.id })
    .from(posTerminals)
    .where(
      and(
        eq(posTerminals.label, parsed.data.label),
        isNull(posTerminals.deletedAt),
        ne(posTerminals.id, parsed.data.terminalId),
      ),
    );
  if (clash[0] !== undefined) {
    return { error: 'A terminal with that label already exists.', message: null };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(posTerminals)
      .set({
        label: parsed.data.label,
        posType: parsed.data.posType,
        macAddress: normalise(parsed.data.macAddress),
        ipAddress: normalise(parsed.data.ipAddress),
        updatedAt: new Date(),
      })
      .where(eq(posTerminals.id, parsed.data.terminalId));

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'pos_terminals',
        entityId: parsed.data.terminalId,
        action: 'TERMINAL_UPDATED',
        before: before[0],
        after: {
          label: parsed.data.label,
          posType: parsed.data.posType,
          macAddress: normalise(parsed.data.macAddress),
          ipAddress: normalise(parsed.data.ipAddress),
        },
      },
    );
  });

  revalidatePath('/admin/terminals');
  return { error: null, message: `${parsed.data.label} saved.` };
}

const ActivationInput = z.object({ terminalId: z.uuid(), active: z.enum(['true', 'false']) });

export async function setTerminalActiveAction(
  _previous: TerminalFormState,
  form: FormData,
): Promise<TerminalFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = ActivationInput.safeParse({
    terminalId: form.get('terminalId'),
    active: form.get('active'),
  });
  if (!parsed.success) return { error: 'Check the form.', message: null };

  const isActive = parsed.data.active === 'true';
  const context = await requestContext();
  const db = dbWrite();

  await db.transaction(async (tx) => {
    await tx
      .update(posTerminals)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(posTerminals.id, parsed.data.terminalId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'pos_terminals',
        entityId: parsed.data.terminalId,
        action: isActive ? 'TERMINAL_ACTIVATED' : 'TERMINAL_DEACTIVATED',
        after: { isActive },
      },
    );
  });

  revalidatePath('/admin/terminals');
  return { error: null, message: isActive ? 'Terminal reactivated.' : 'Terminal deactivated.' };
}
