import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { dbRead, outletConfig } from '@natech/db';
import { OutletConfigSchema, type OutletConfig } from '@natech/contracts';
import { computeBusinessDate } from '../orders/businessDateLogic';

/**
 * Read the singleton outlet identity used on fiscal documents.
 *
 * Database numerics arrive as strings and optional database columns arrive as
 * null, so this is the one conversion boundary into the stricter receipt
 * contract. An incomplete identity returns null instead of silently printing
 * placeholder or stale business details on a tax invoice.
 */
export async function readOutletConfig(): Promise<OutletConfig | null> {
  const rows = await dbRead()
    .select({
      legalName: outletConfig.legalName,
      tradingName: outletConfig.tradingName,
      address: outletConfig.address,
      city: outletConfig.city,
      phone: outletConfig.phone,
      email: outletConfig.email,
      ntn: outletConfig.ntn,
      strn: outletConfig.strn,
      timezone: outletConfig.timezone,
      businessDayCutoff: outletConfig.businessDayCutoff,
      latitude: outletConfig.latitude,
      longitude: outletConfig.longitude,
      storeOpen: outletConfig.storeOpen,
      storeClose: outletConfig.storeClose,
      weeklyOffDays: outletConfig.weeklyOffDays,
    })
    .from(outletConfig)
    .where(and(eq(outletConfig.singleton, true), isNull(outletConfig.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const parsed = OutletConfigSchema.safeParse({
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    weeklyOffDays: row.weeklyOffDays ?? [],
  });

  return parsed.success ? parsed.data : null;
}

export async function readOutletTimezone(): Promise<string> {
  const rows = await dbRead()
    .select({ timezone: outletConfig.timezone })
    .from(outletConfig)
    .where(and(eq(outletConfig.singleton, true), isNull(outletConfig.deletedAt)))
    .limit(1);
  return rows[0]?.timezone ?? 'Asia/Karachi';
}

export async function readOutletEmail(): Promise<string | null> {
  const rows = await dbRead()
    .select({ email: outletConfig.email })
    .from(outletConfig)
    .where(and(eq(outletConfig.singleton, true), isNull(outletConfig.deletedAt)))
    .limit(1);
  return rows[0]?.email ?? null;
}

export async function readCurrentBusinessDate(at: Date = new Date()): Promise<string> {
  const rows = await dbRead()
    .select({ timezone: outletConfig.timezone, cutoff: outletConfig.businessDayCutoff })
    .from(outletConfig)
    .where(and(eq(outletConfig.singleton, true), isNull(outletConfig.deletedAt)))
    .limit(1);
  const row = rows[0];
  return computeBusinessDate(at, {
    timezone: row?.timezone ?? 'Asia/Karachi',
    cutoff: row?.cutoff ?? '05:00',
  });
}
