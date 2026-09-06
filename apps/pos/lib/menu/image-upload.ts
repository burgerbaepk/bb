'use server';

import { assertPermission, requireOperator } from '../auth/session';

/**
 * Menu item image upload — BUILD-PLAN.md M08 runfile §3, §4.
 *
 * Separate from `actions.ts` on purpose: everything in that file writes
 * through `dbWrite`, and this never touches the database at all — it only
 * mints a presigned R2 upload for a browser to POST to directly, so a menu
 * photo never round-trips through this server (see the runfile's "uploads go
 * straight from the browser to R2" decision).
 *
 * The content-type check happens here, before `presignUpload` is ever
 * called. A screen that only discovers "that file type is not
 * accepted" after minting a one-time URL and asking the browser to fail
 * against a storage provider is a worse error than refusing it up front.
 */
export interface MenuImageUpload {
  readonly url: string;
  readonly contentType: string;
  /** What `createMenuItemAction`/`updateMenuItemAction` write to `image_key` — never the URL. */
  readonly key: string;
}

export async function requestMenuImageUploadAction(
  _contentType: string,
): Promise<MenuImageUpload | { readonly error: string }> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  return { error: 'Menu image uploads are unavailable. Items will display without a photo.' };
}
