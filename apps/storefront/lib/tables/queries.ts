import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { dbRead, dbWrite, qrTokens, tables, zones } from '@natech/db';
import type { QrResolution } from '@natech/contracts';

/**
 * QR table binding — BUILD-PLAN.md §5.11, §13.1; docs/runfiles/
 * M14-storefront.md.
 *
 * An inactive token (a retired table, a reprinted code) resolves rather than
 * 404s — the customer is standing in the restaurant with a phone in hand,
 * and `QrResolution.isActive` is exactly the field that lets the screen
 * explain rather than dead-end.
 */
export async function resolveQrToken(token: string): Promise<QrResolution | null> {
  const rows = await dbRead()
    .select({
      tokenId: qrTokens.id,
      isActive: qrTokens.isActive,
      tableId: tables.id,
      tableCode: tables.code,
      zoneName: zones.name,
    })
    .from(qrTokens)
    .innerJoin(tables, eq(qrTokens.tableId, tables.id))
    .innerJoin(zones, eq(tables.zoneId, zones.id))
    .where(and(eq(qrTokens.token, token), isNull(qrTokens.deletedAt), isNull(tables.deletedAt)));

  const row = rows[0];
  if (row === undefined) return null;

  return {
    token,
    tableId: row.tableId,
    tableCode: row.tableCode,
    zoneName: row.zoneName,
    isActive: row.isActive,
  };
}

/**
 * Best-effort — a scan count is a usage metric, not a fiscal figure, so a
 * lost increment (a double render, a prefetch) costs nothing worth a
 * transaction over. Fire-and-forget from the page that resolves the token.
 */
export async function recordQrScan(token: string): Promise<void> {
  await dbWrite()
    .update(qrTokens)
    .set({ scanCount: sql`${qrTokens.scanCount} + 1`, updatedAt: new Date() })
    .where(eq(qrTokens.token, token));
}
