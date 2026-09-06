import { eq, isNull } from 'drizzle-orm';
import { can } from '@natech/contracts';
import { dbRead, outletConfig, settings } from '@natech/db';
import { SEO_SETTINGS_KEY, parseSeoSettings } from '@natech/branding';
import { SeoSettings } from '@/components/admin/SeoSettings';
import { BrandingEditor } from '@/components/admin/BrandingEditor';
import { OutletSettings } from '@/components/admin/OutletSettings';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintingGuide } from '@/components/admin/PrintingGuide';
import { ReceiptSettings } from '@/components/admin/ReceiptSettings';
import { ServiceChargeSettings } from '@/components/admin/ServiceChargeSettings';
import { SettingsNav, type SettingsSection } from '@/components/admin/SettingsNav';
import { SettingsRegistry } from '@/components/admin/SettingsRegistry';
import { requirePermissionPage } from '@/lib/auth/session';
import { readBrandConfig } from '@/lib/branding/queries';
import { resolveAssetUrl } from '@/lib/assets';
import { readServiceChargeSettings } from '@/lib/tax/queries';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { readSettingsRegistry } from '@/lib/settings/queries';
import { readLatestInvoiceForPreview } from '@/lib/invoices/queries';
import { readOutletConfig } from '@/lib/outlet/queries';
import { readInvoiceStorefrontUrl } from '@/lib/seo/queries';

const SECTIONS = new Set<SettingsSection>([
  'outlet',
  'pos',
  'receipt',
  'branding',
  'printing',
  'seo',
]);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requirePermissionPage('settings.read');
  const requested = (await searchParams)['section'];
  const parsed =
    typeof requested === 'string' && SECTIONS.has(requested as SettingsSection)
      ? (requested as SettingsSection)
      : 'outlet';
  const canManage = can(viewer, 'settings.write');
  const section = !canManage && parsed !== 'pos' ? 'pos' : parsed;

  return (
    <>
      <PageHeading
        title="Settings"
        note="Everything needed to set up and run your POS in one place."
      />
      <SettingsNav active={section} canManage={canManage} />
      <SettingsContent section={section} />
    </>
  );
}

async function SettingsContent({ section }: { readonly section: SettingsSection }) {
  if (section === 'seo') {
    const [row] = await dbRead()
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SEO_SETTINGS_KEY));
    return <SeoSettings values={parseSeoSettings(row?.value)} />;
  }
  if (section === 'printing') return <PrintingGuide />;
  if (section === 'pos') {
    // M21 — every figure below comes from `settings` and `setting_history`.
    // ADR 0025 removed this registry because it rendered the Phase-1 fixture:
    // fabricated values, a fabricated actor and a fabricated audit trail, on
    // the screen §5.10 exists to make auditable.
    const [serviceCharge, registry, timezone] = await Promise.all([
      readServiceChargeSettings(),
      readSettingsRegistry(),
      readOutletTimezone(),
    ]);
    return (
      <SettingsRegistry
        embedded
        definitions={registry.definitions}
        values={registry.values}
        history={registry.history}
        timezone={timezone}
        leadingContent={<ServiceChargeSettings values={serviceCharge} />}
      />
    );
  }
  if (section === 'outlet') {
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
        googlePlaceId: outletConfig.googlePlaceId,
        googleRating: outletConfig.googleRating,
        googleReviewCount: outletConfig.googleReviewCount,
      })
      .from(outletConfig)
      .where(isNull(outletConfig.deletedAt))
      .limit(1);
    return <OutletSettings embedded outlet={rows[0] ?? null} />;
  }
  const brand = await readBrandConfig();
  if (section === 'receipt') {
    // §14.3, §14.4 — the previews render the real documents, so they need the
    // outlet identity that goes in the frame's header and the most recent
    // finalized invoice to render inside it.
    const [outlet, latestInvoice, storefrontUrl] = await Promise.all([
      readOutletConfig(),
      readLatestInvoiceForPreview(),
      readInvoiceStorefrontUrl(),
    ]);
    return (
      <ReceiptSettings
        embedded
        receipt={brand.receipt}
        outlet={outlet}
        latestInvoice={latestInvoice}
        storefrontUrl={storefrontUrl}
      />
    );
  }
  const keyOrNull = (value: string): string | null => (value === '' ? null : value);
  return (
    <BrandingEditor
      embedded
      brand={brand}
      assetUrls={{
        logoLight: resolveAssetUrl(keyOrNull(brand.identity.logoLight)),
        logoDark: resolveAssetUrl(keyOrNull(brand.identity.logoDark)),
        logoReceipt: resolveAssetUrl(keyOrNull(brand.identity.logoReceipt)),
        favicon: resolveAssetUrl(keyOrNull(brand.identity.favicon)),
      }}
    />
  );
}
