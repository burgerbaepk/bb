import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { dbRead, outletConfig } from '@natech/db';

/**
 * `outlet_config` — BUILD-PLAN.md §5.1, §13.5, R12; docs/runfiles/
 * M14-storefront.md.
 *
 * The only sanctioned source for the trading name, address, phone, and
 * coordinates this app ever shows — R12 bans a hardcoded one in source, and
 * `brand-grep` enforces it. Degrades to empty/`null` fields rather than
 * throwing when the row is absent (a public storefront can load before
 * `pnpm brand:init` has ever run, the same reasoning `readCurrentBusinessDate`
 * already applies to an admin dashboard).
 */
export interface OutletProfile {
  readonly tradingName: string;
  readonly legalName: string;
  readonly address: string;
  readonly city: string;
  readonly phone: string;
  readonly email: string | null;
  readonly timezone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly storeOpen: string | null;
  readonly storeClose: string | null;
  readonly weeklyOffDays?: readonly string[] | null;
  /** The Google Business listing — see `outlet_config.google_place_id`. Null until a manager fills it in. */
  readonly googlePlaceId: string | null;
  readonly googleRating: number | null;
  readonly googleReviewCount: number | null;
}

const EMPTY_OUTLET: OutletProfile = {
  tradingName: '',
  legalName: '',
  address: '',
  city: '',
  phone: '',
  email: null,
  timezone: 'Asia/Karachi',
  latitude: null,
  longitude: null,
  storeOpen: null,
  storeClose: null,
  googlePlaceId: null,
  googleRating: null,
  googleReviewCount: null,
};

export const readOutletProfile = cache(async (): Promise<OutletProfile> => {
  const rows = await dbRead()
    .select({
      tradingName: outletConfig.tradingName,
      legalName: outletConfig.legalName,
      address: outletConfig.address,
      city: outletConfig.city,
      phone: outletConfig.phone,
      email: outletConfig.email,
      timezone: outletConfig.timezone,
      latitude: outletConfig.latitude,
      longitude: outletConfig.longitude,
      storeOpen: outletConfig.storeOpen,
      storeClose: outletConfig.storeClose,
      weeklyOffDays: outletConfig.weeklyOffDays,
      googlePlaceId: outletConfig.googlePlaceId,
      googleRating: outletConfig.googleRating,
      googleReviewCount: outletConfig.googleReviewCount,
    })
    .from(outletConfig)
    .where(eq(outletConfig.singleton, true));

  const row = rows[0];
  if (row === undefined) return EMPTY_OUTLET;

  return {
    tradingName: row.tradingName,
    legalName: row.legalName,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    timezone: row.timezone,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    storeOpen: row.storeOpen,
    storeClose: row.storeClose,
    weeklyOffDays: row.weeklyOffDays,
    googlePlaceId: row.googlePlaceId,
    // `numeric` arrives as a string from the driver, the same coercion
    // latitude and longitude above already need.
    googleRating: row.googleRating === null ? null : Number(row.googleRating),
    googleReviewCount: row.googleReviewCount,
  };
});
