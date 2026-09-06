'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { dbWrite, settings, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { BRANDING_SETTINGS_KEY, parseBrandConfig } from './config';
import { mergeBrandConfig, SaveBrandingInput } from './merge';

/**
 * The branding write path — BUILD-PLAN.md §14.3, §14.4, R12, R7;
 * docs/runfiles/M08-menu-floor-brand.md §3.
 *
 * **`settings.write` gates both actions here, not a dedicated `branding.write`.**
 * The frozen `PermissionSchema` has none, and §14.1 never gives `MANAGER`
 * branding — only `OWNER` holds `settings.write` in the seeded roles. The
 * runfile records this as deliberate: a rebrand changes what a fiscal document
 * looks like.
 *
 * **Read-modify-write.** `BrandingEditor` only edits a subset of
 * `BrandConfigSchema` (`./merge.ts`'s `SaveBrandingInput`) — identity, theme,
 * and the receipt fields it renders a control for. `typography.*`,
 * `locale.*`, and `identity.legalName` never arrive in the submission, so
 * `saveBrandingAction` loads the row it is about to replace, overlays only
 * the submitted fields, and writes the merged whole back.
 *
 * The schema and the merge live in `./merge.ts` rather than here because a
 * `'use server'` file may only export async functions — everything
 * synchronous, including what `branding.test.ts` exercises directly, has to
 * live next door.
 */

export interface BrandingFormState {
  readonly error: string | null;
  readonly message: string | null;
}

export async function saveBrandingAction(
  _previous: BrandingFormState,
  form: FormData,
): Promise<BrandingFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.write');

  const parsed = SaveBrandingInput.safeParse({
    tradingName: form.get('tradingName'),
    tagline: form.get('tagline'),
    logoLight: form.get('logoLight'),
    logoDark: form.get('logoDark'),
    logoReceipt: form.get('logoReceipt'),
    favicon: form.get('favicon'),
    primary: form.get('primary'),
    accent: form.get('accent'),
    radius: form.get('radius'),
    mode: form.get('mode'),
    widthMm: form.get('widthMm'),
    showUrdu: form.get('showUrdu'),
    footerLines: form.get('footerLines'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const context = await requestContext();
  const db = dbWrite();

  await db.transaction(async (tx) => {
    // R2 — read inside the same `dbWrite` connection as the write that
    // follows, not through `readBrandConfig()`'s `dbRead`. The HTTP driver's
    // view of the row is not guaranteed to include a write this same request
    // is about to make redundant, and a merge base has to be current.
    const existing = await tx
      .select({ id: settings.id, value: settings.value })
      .from(settings)
      .where(eq(settings.key, BRANDING_SETTINGS_KEY));

    const row = existing[0];
    const before = parseBrandConfig(row?.value);
    const after = mergeBrandConfig(before, parsed.data);

    if (row === undefined) {
      await tx
        .insert(settings)
        .values({ key: BRANDING_SETTINGS_KEY, value: after as object, updatedBy: operator.id });
    } else {
      await tx
        .update(settings)
        .set({ value: after as object, updatedBy: operator.id, updatedAt: new Date() })
        .where(eq(settings.id, row.id));
    }

    // R7. `entityId` is omitted: `settings` rows are addressed by `key`, not
    // consulted by id anywhere else in the codebase (`idleLockSeconds()` reads
    // the same way), so there is no id an auditor would look one up by.
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      { entity: 'settings', action: 'BRANDING_UPDATED', before, after },
    );
  });

  // The root layout reads `readBrandConfig()` on every request, so the theme
  // takes effect on the very next navigation without a rebuild (§14.3) — this
  // just clears the cached render of the pages that show the values back.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/branding');
  return { error: null, message: 'Branding saved.' };
}

export interface AssetUploadResult {
  readonly ok: true;
  readonly url: string;
  readonly contentType: string;
  readonly key: string;
}
export interface AssetUploadError {
  readonly ok: false;
  readonly error: string;
}

/**
 * Mint a presigned upload for one branding asset — §3's "uploads go straight
 * from the browser to R2" decision. Called directly from `BrandingEditor` (not
 * through `useActionState`) the moment a file is chosen, ahead of the form's
 * own submit, because the key it returns is what the form later saves.
 *
 * Returns a discriminated result rather than throwing on a bad content type:
 * this is invoked from a plain `onChange` handler, not a `<form action>`, and
 * a thrown Server Action error reaches the client as an opaque digest in
 * production — useless for telling an operator their file was a PDF.
 */
export async function requestBrandAssetUploadAction(
  _contentType: string,
): Promise<AssetUploadResult | AssetUploadError> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.write');

  return { ok: false, error: 'Asset uploads are disabled.' };
}
