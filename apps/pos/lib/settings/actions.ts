'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, settingHistory, settings, writeAudit } from '@natech/db';
import { Forbidden, assertPermission, requestContext, requireOperator } from '../auth/session';
import { registeredSetting } from './registry';
import { SettingValueError, formatSettingValue, parseSettingValue } from './serialise';

/**
 * Writing one setting — BUILD-PLAN.md §5.10, §6.8, §2 R2, R7;
 * docs/runfiles/M21-settings-registry.md §3.
 *
 * This action is the whole of M21. Until it existed, `SettingsRegistry`
 * "saved" a change into React state and raised
 * `toast.show('success', '… updated and recorded')` — a screen reporting a
 * persisted, audited change that was neither, on the surface §5.10 exists to
 * make auditable. ADR 0025 pulled the screen rather than leave that shipped.
 *
 * Four things are enforced here rather than in the component that draws the
 * form, because a rule enforced only by its own UI is not enforced:
 *
 *   **The key must be in the registry.** Trusting the key the client sent
 *   would let anyone holding `settings.write` write any row of `settings` —
 *   `branding` and the whole `tax.policy` blob included — through an action
 *   whose UI only ever offers nine keys.
 *
 *   **The permission comes from the definition**, not from the screen. §6.8
 *   puts tax policy behind `settings.tax.write`, a higher grant than
 *   `settings.write`; asserting one blanket permission for the whole registry
 *   would hand every tax key to whoever holds the weaker one.
 *
 *   **A HIGH-audit change needs a reason.** §5.10 gives `setting_history` a
 *   `reason` column and §6.8 sets tax policy at HIGH. `ReasonDialog` still
 *   asks — that is the right place to ask — but an empty reason in the audit
 *   trail is worse than a refusal, and a client-side-only check is an empty
 *   reason waiting for a second caller.
 *
 *   **The row is locked for the read-modify-write.** Six of the nine keys are
 *   fields inside the single `tax.policy` blob. Without the lock, two managers
 *   changing two different fields at once both read the old blob and the
 *   second write silently discards the first — no error, no audit trail of the
 *   loss, and a tax setting that reverts for no visible reason.
 *
 * `dbWrite` (R2): a multi-statement transaction on `dbRead` no-ops silently.
 */
const Input = z.object({
  key: z.string().min(1),
  value: z.string(),
  reason: z.string().trim().default(''),
});

export interface SaveSettingResult {
  readonly ok: boolean;
  readonly error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function saveSettingAction(input: unknown): Promise<SaveSettingResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the value.' };
  }

  const entry = registeredSetting(parsed.data.key);
  // Not "unknown setting" — the caller asked for something this action does
  // not write, and saying which key would confirm the shape of the table.
  if (entry === undefined) return { ok: false, error: 'That setting cannot be changed here.' };
  const { definition, storage } = entry;

  const operator = await requireOperator();
  try {
    assertPermission(operator, definition.permission);
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const reason = parsed.data.reason;
  if (definition.auditLevel === 'HIGH' && reason.length < 8) {
    return { ok: false, error: 'This change needs a reason of at least eight characters.' };
  }

  let next: string | number | boolean | string[];
  try {
    next = parseSettingValue(definition.kind, parsed.data.value, definition.options);
  } catch (error) {
    if (error instanceof SettingValueError) return { ok: false, error: error.message };
    throw error;
  }

  const context = await requestContext();
  const db = dbWrite();

  await db.transaction(async (tx) => {
    const row = await tx
      .select({ id: settings.id, value: settings.value })
      .from(settings)
      .where(eq(settings.key, storage.row))
      // §5.10 — the lock that makes the read-modify-write below atomic.
      .for('update')
      .then((rows) => rows[0]);

    // What changed, at the granularity the operator actually edited. A field
    // inside a blob is recorded as that field, under the full setting key, so
    // the history line reads `false → true` rather than one tax policy object
    // against another.
    const before =
      storage.field === undefined
        ? row?.value
        : isRecord(row?.value)
          ? row.value[storage.field]
          : undefined;

    const nextRowValue =
      storage.field === undefined
        ? next
        : { ...(isRecord(row?.value) ? row.value : {}), [storage.field]: next };

    if (row === undefined) {
      // `print.activePath` is not seeded, so the first write of it is an
      // insert. `onConflictDoUpdate` closes the window the `FOR UPDATE` above
      // cannot cover: a lock on a row that does not exist locks nothing, and
      // two concurrent first writes would otherwise collide on
      // `settings_key_idx`.
      await tx
        .insert(settings)
        .values({ key: storage.row, value: nextRowValue as object, updatedBy: operator.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: nextRowValue as object, updatedBy: operator.id, updatedAt: new Date() },
        });
    } else {
      await tx
        .update(settings)
        .set({ value: nextRowValue as object, updatedBy: operator.id, updatedAt: new Date() })
        .where(eq(settings.id, row.id));
    }

    await tx.insert(settingHistory).values({
      key: definition.key,
      before: before === undefined ? null : (before as object),
      after: next as object,
      actorId: operator.id,
      reason: reason === '' ? null : reason,
    });

    // R7 — an audit row for every mutation, inside the caller's transaction.
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'settings',
        entityId: row?.id,
        action: 'SETTING_UPDATED',
        before: { key: definition.key, value: formatSettingValue(before) },
        after: { key: definition.key, value: formatSettingValue(next), reason },
      },
    );
  });

  // The tax policy and the idle lock are read by the layout on every request,
  // so the whole tree is revalidated rather than this page alone.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
  return { ok: true, error: null };
}
