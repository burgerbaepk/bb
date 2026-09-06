'use client';

import { useActionState, useEffect, useId, useState, type ChangeEvent } from 'react';
import { Image as ImageIcon, Printer, Save } from 'lucide-react';
import { Button, SegmentedControl, SelectField, Switch, TextField, cn, useToast } from '@natech/ui';
import { RADIUS_REM, type BrandConfig } from '@natech/branding';
import { VENDOR_FOOTER_LINE } from '@natech/contracts';
import { BRANDING_IDLE } from '@/lib/branding/idle';
import { requestBrandAssetUploadAction, saveBrandingAction } from '@/lib/branding/actions';
import { PageHeading } from './PageHeading';

/**
 * The branding editor — BUILD-PLAN.md §14.3, §14.4, R12;
 * docs/runfiles/M08-menu-floor-brand.md §3.
 *
 * Everything an operator can change about how the product looks, saved
 * through `saveBrandingAction` to the `branding` settings row and resolved at
 * runtime into CSS custom properties over the token defaults. A rebrand is a
 * database write; nothing here ends up in source, which is what keeps the R12
 * grep gate green for the next deployment.
 *
 * Two things this screen deliberately will not let you do.
 *
 * **The vendor line cannot be removed.** §14.4 puts the vendor credit beneath
 * the operator's own footer on both documents, and the field for it is
 * read-only and carries no `name` — it is not part of the form submission at
 * all, and `saveBrandingAction`'s input schema has structurally nowhere to put
 * one even if it were. The receipt this replaces prints a personal mobile
 * number as the software vendor on every fiscal document (defect K1).
 *
 * **The receipt logo is a separate asset.** A thermal printer takes 1-bit
 * monochrome at 384 dots (§15.3); a downscaled colour logo prints as a smear,
 * so it is asked for separately rather than derived.
 *
 * `typography.*`, `locale.*`, and `identity.legalName` have no controls here
 * on purpose — `saveBrandingAction` does a read-modify-write, so they survive
 * every save this screen makes untouched.
 */
export interface BrandingAssetUrls {
  readonly logoLight: string | null;
  readonly logoDark: string | null;
  readonly logoReceipt: string | null;
  readonly favicon: string | null;
}

export interface BrandingEditorProps {
  readonly brand: BrandConfig;
  /** Resolved server-side (`resolveAssetUrl` is `server-only`) from the stored keys. */
  readonly assetUrls: BrandingAssetUrls;
  readonly embedded?: boolean;
}

export function BrandingEditor({ brand, assetUrls, embedded = false }: BrandingEditorProps) {
  const { show } = useToast();
  const [state, formAction, pending] = useActionState(saveBrandingAction, BRANDING_IDLE);

  const [primary, setPrimary] = useState(brand.theme.primary);
  const [accent, setAccent] = useState(brand.theme.accent);
  const [radius, setRadius] = useState(brand.theme.radius);
  const [mode, setMode] = useState(brand.theme.mode);
  const [tradingName, setTradingName] = useState(brand.identity.tradingName);
  const [tagline, setTagline] = useState(brand.identity.tagline ?? '');
  const [showUrdu, setShowUrdu] = useState(brand.receipt.showUrdu);
  const [widthMm, setWidthMm] = useState(String(brand.receipt.widthMm));
  const [footer, setFooter] = useState(brand.receipt.footerLines.join(' · '));

  // `show` is a `useCallback` with an empty dependency list (`@natech/ui`'s
  // `ToastProvider`), so it never changes reference — only the outer context
  // value does, whenever a toast is added. Depending on the context value
  // itself here would re-fire this effect the instant the toast it just
  // raised changes that value, showing the same outcome twice.
  useEffect(() => {
    if (state.error !== null) show('error', state.error);
    else if (state.message !== null) show('success', state.message);
  }, [state, show]);

  return (
    <form action={formAction}>
      {embedded ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Branding</h2>
            <p className="text-ink-muted mt-1 text-sm">
              Your name, logos, colours, and default appearance.
            </p>
          </div>
          <Button tone="primary" icon={Save} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save branding'}
          </Button>
        </div>
      ) : (
        <PageHeading
          title="Branding"
          note="Your name, logos, colours, and default appearance."
          actions={
            <Button tone="primary" icon={Save} type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save branding'}
            </Button>
          }
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="border-border bg-surface-raised rounded-base border p-4">
            <h2 className="mb-3 font-semibold">Identity</h2>
            <div className="space-y-3">
              <TextField
                label="Trading name"
                name="tradingName"
                help="Printed at the head of every tax invoice, and shown on the storefront."
                value={tradingName}
                onChange={(event) => setTradingName(event.target.value)}
                required
              />
              <TextField
                label="Tagline"
                name="tagline"
                value={tagline}
                onChange={(event) => setTagline(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetField
                  label="Logo, light background"
                  name="logoLight"
                  value={brand.identity.logoLight}
                  assetUrl={assetUrls.logoLight}
                />
                <AssetField
                  label="Logo, dark background"
                  name="logoDark"
                  value={brand.identity.logoDark}
                  assetUrl={assetUrls.logoDark}
                />
                <AssetField
                  label="Receipt logo"
                  name="logoReceipt"
                  value={brand.identity.logoReceipt}
                  assetUrl={assetUrls.logoReceipt}
                  help="For clearest results, upload a simple black-and-white logo."
                  icon={Printer}
                />
                <AssetField
                  label="Favicon"
                  name="favicon"
                  value={brand.identity.favicon}
                  assetUrl={assetUrls.favicon}
                />
              </div>
            </div>
          </section>

          <section className="border-border bg-surface-raised rounded-base border p-4">
            <h2 className="mb-3 font-semibold">Theme</h2>
            <div className="space-y-3">
              <TextField
                label="Primary colour"
                name="primary"
                help="Used for primary buttons and selected items."
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
                required
              />
              <TextField
                label="Accent colour"
                name="accent"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                required
              />
              <SelectField
                label="Corner radius"
                name="radius"
                value={radius}
                onChange={(event) =>
                  setRadius(event.target.value as BrandConfig['theme']['radius'])
                }
                options={[
                  { value: 'sharp', label: 'Sharp' },
                  { value: 'soft', label: 'Soft' },
                  { value: 'round', label: 'Round' },
                ]}
              />
              <div>
                <p className="mb-1.5 text-sm font-medium">Default appearance</p>
                <SegmentedControl
                  label="Default appearance"
                  value={mode}
                  onChange={(next) => setMode(next as BrandConfig['theme']['mode'])}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'Follow the device' },
                  ]}
                />
                {/* Not a native control — its value rides along in a hidden field. */}
                <input type="hidden" name="mode" value={mode} />
              </div>
            </div>
          </section>

          {!embedded && (
            <section className="border-border bg-surface-raised rounded-base border p-4">
              <h2 className="mb-3 font-semibold">Receipts</h2>
              <div className="space-y-3">
                <SelectField
                  label="Paper width"
                  name="widthMm"
                  value={widthMm}
                  onChange={(event) => setWidthMm(event.target.value)}
                  options={[
                    { value: '80', label: '80mm' },
                    { value: '58', label: '58mm' },
                  ]}
                />
                <div>
                  <p className="mb-1.5 text-sm font-medium">Bilingual receipts</p>
                  <Switch checked={showUrdu} onChange={setShowUrdu} label="Print Urdu lines" />
                  <input type="hidden" name="showUrdu" value={showUrdu ? 'true' : 'false'} />
                  <p className="text-ink-subtle mt-1 text-xs">
                    Adds Urdu item names where available.
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Verification QR</p>
                  <p className="text-ink-subtle mt-1 text-xs">On every finalized tax invoice.</p>
                </div>
                <TextField
                  label="Footer lines"
                  name="footerLines"
                  help="Separated by a middle dot. Yours, above the vendor line."
                  value={footer}
                  onChange={(event) => setFooter(event.target.value)}
                />
                <TextField
                  label="Vendor line"
                  help="Fixed. It appears beneath your footer on both documents and is not removable."
                  value={VENDOR_FOOTER_LINE}
                  onChange={() => {}}
                  readOnly
                />
              </div>
            </section>
          )}
          {embedded && (
            <>
              <input type="hidden" name="widthMm" value={widthMm} />
              <input type="hidden" name="showUrdu" value={showUrdu ? 'true' : 'false'} />
              <input type="hidden" name="footerLines" value={footer} />
            </>
          )}
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <h2 className="mb-2 font-semibold">Preview</h2>
          <div
            className="border-border overflow-hidden border p-4"
            style={{ borderRadius: RADIUS_REM[radius] }}
          >
            <div
              className="text-ink-inverse mb-3 px-3 py-2 text-sm font-semibold"
              style={{ background: primary, borderRadius: RADIUS_REM[radius] }}
            >
              {tradingName}
            </div>
            <p className="text-ink-muted mb-3 text-sm">{tagline}</p>
            <div
              className="text-ink-inverse px-3 py-2 text-sm"
              style={{ background: accent, borderRadius: RADIUS_REM[radius] }}
            >
              Accent
            </div>
            <p className="text-ink-subtle mt-3 text-xs">
              Preview only. The live theme resolves from these values at runtime, over the neutral
              token defaults.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}

/** Mirrors `ALLOWED_IMAGE_TYPES` in `lib/storage/r2.ts` — that module is `server-only`. */
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Mirrors `MAX_IMAGE_BYTES` in `lib/storage/r2.ts`. R2 presigned PUT URLs
 * cannot enforce a content-length range, so this prevents accidental
 * oversized uploads before spending a round trip.
 */
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

function AssetField({
  label,
  name,
  value,
  assetUrl,
  help,
  icon: Icon = ImageIcon,
}: {
  readonly label: string;
  readonly name: 'logoLight' | 'logoDark' | 'logoReceipt' | 'favicon';
  readonly value: string;
  /** Resolved server-side for the key currently saved — stale the moment a new file is chosen. */
  readonly assetUrl: string | null;
  readonly help?: string | undefined;
  readonly icon?: typeof ImageIcon | undefined;
}) {
  const { show } = useToast();
  const [key, setKey] = useState(value);
  const [uploading, setUploading] = useState(false);
  const inputId = useId();

  /**
   * Upload on choice, straight to R2 — §3's "the app never proxies the
   * bytes" decision. Only the returned key is kept; the row is not written
   * until the whole form is saved, so a chosen-but-unsaved file is still
   * discarded by navigating away, the same as every other field here.
   */
  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;

    if (file.size > MAX_ASSET_BYTES) {
      show('error', `${label}: that file is larger than ${MAX_ASSET_BYTES / (1024 * 1024)}MB.`);
      return;
    }

    setUploading(true);
    try {
      const presigned = await requestBrandAssetUploadAction(file.type);
      if (!presigned.ok) {
        show('error', presigned.error);
        return;
      }

      const response = await fetch(presigned.url, {
        method: 'PUT',
        headers: { 'Content-Type': presigned.contentType },
        body: file,
      });
      if (!response.ok) {
        show('error', `${label}: the upload was rejected.`);
        return;
      }

      setKey(presigned.key);
      show('success', `${label} uploaded. Save branding to keep it.`);
    } catch {
      show('error', `${label}: the upload failed. Check the connection and try again.`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div
        className={cn(
          'border-border bg-surface-sunken min-h-touch flex items-center gap-2 rounded-base border px-3 py-2 text-sm',
        )}
      >
        <Icon aria-hidden="true" className="text-ink-subtle size-4 shrink-0" />
        {/* A resolved preview only applies to the key already saved — the R2
            public base URL is unset in this environment (M08 runfile §4), so
            this renders `null` and falls through to the plain key today. */}
        {assetUrl !== null && key === value ? (
          <a
            href={assetUrl}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate font-mono text-xs underline"
          >
            {key}
          </a>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {uploading ? 'Uploading…' : key === '' ? 'Not set' : key}
          </span>
        )}
        <label
          htmlFor={inputId}
          className={cn(
            'text-primary shrink-0 text-xs font-medium',
            uploading ? 'opacity-60' : 'cursor-pointer',
          )}
        >
          {uploading ? 'Uploading…' : 'Choose file'}
        </label>
      </div>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        onChange={handleChange}
        disabled={uploading}
      />
      <input type="hidden" name={name} value={key} />
      {help !== undefined && <p className="text-ink-subtle mt-1 text-xs">{help}</p>}
    </div>
  );
}
