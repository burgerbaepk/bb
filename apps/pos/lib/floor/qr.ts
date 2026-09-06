import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { dbRead, qrTokens, tables, zones } from '@natech/db';

export interface TableQrRow {
  readonly tableId: string;
  readonly tableCode: string;
  readonly zoneName: string;
  readonly token: string | null;
}

export async function listTableQrCodes(): Promise<readonly TableQrRow[]> {
  return dbRead()
    .select({
      tableId: tables.id,
      tableCode: tables.code,
      zoneName: zones.name,
      token: qrTokens.token,
    })
    .from(tables)
    .innerJoin(zones, eq(tables.zoneId, zones.id))
    .leftJoin(
      qrTokens,
      and(eq(qrTokens.tableId, tables.id), eq(qrTokens.isActive, true), isNull(qrTokens.deletedAt)),
    )
    .where(and(isNull(tables.deletedAt), isNull(zones.deletedAt)))
    .orderBy(zones.sortOrder, tables.code);
}
