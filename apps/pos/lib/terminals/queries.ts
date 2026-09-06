import 'server-only';
import { isNull } from 'drizzle-orm';
import { dbRead, posTerminals } from '@natech/db';
import type { Terminal } from '@natech/contracts';

/**
 * Reads behind the terminal-registration screen — BUILD-PLAN.md §5.2, §14.6.
 *
 * `dbRead` throughout (R2), same reasoning as `lib/auth/queries.ts`: these
 * answer React Server Components, and a mutation's own pre-checks live on
 * `dbWrite` in `actions.ts`.
 */
export interface TerminalRow extends Terminal {
  /** Physical NIC identifiers. Not part of the frozen `Terminal` — nothing
   * outside the back office needs them. */
  readonly macAddress: string | null;
  readonly ipAddress: string | null;
}

export async function listTerminals(): Promise<TerminalRow[]> {
  const rows = await dbRead()
    .select({
      id: posTerminals.id,
      label: posTerminals.label,
      posType: posTerminals.posType,
      macAddress: posTerminals.macAddress,
      ipAddress: posTerminals.ipAddress,
      isActive: posTerminals.isActive,
    })
    .from(posTerminals)
    .where(isNull(posTerminals.deletedAt))
    .orderBy(posTerminals.label);

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    // M08 scope: this stays null. M11 populates it once the FBR device
    // registration flow exists — the form has no field for it, only a
    // read-only note.
    posType: row.posType,
    macAddress: row.macAddress,
    ipAddress: row.ipAddress,
    isActive: row.isActive,
  }));
}
